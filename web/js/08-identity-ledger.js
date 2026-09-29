"use strict";
/* Identity and books — Auth client, audit trail, document numbers, double-entry Ledger. */

/** Client-side mirror of the server's password policy (auth.js in
 *  server/), so a weak password is rejected instantly instead of after
 *  a round trip. The server enforces this independently — this check
 *  is a UX convenience only, never the actual security boundary. */
function passwordProblems(pw){
  const out = [];
  if(!pw || pw.length < 8) out.push("at least 8 characters");
  if(!/[a-zA-Z]/.test(pw)) out.push("a letter");
  if(!/[0-9]/.test(pw)) out.push("a number");
  if(/^(admin|password|12345678|qwerty)$/i.test(pw || "")) out.push("something less guessable");
  return out;
}

/* ===========================================================
   IDENTITY — self-hosted variant. All password hashing and
   session issuance now happens on the server (bcrypt + a signed,
   httpOnly session cookie) — this object just talks to it.       */

const Auth = {
  session:null,

  get user(){ return this.session ? {id:this.session.uid, username:this.session.username,
    role:this.session.role, name:this.session.name} : null; },
  get name(){ return this.session ? (this.session.name || this.session.username) : "system"; },
  is(role){ return !!this.session && (this.session.role === role || this.session.role === "admin"); },

  async restore(){
    try{
      const res = await api("/api/auth/me");
      if(res && res.user){
        this.session = {uid:res.user.id, username:res.user.username, role:res.user.role, name:res.user.name};
        return this.session;
      }
    }catch(e){ /* no valid session cookie — that's fine, not an error */ }
    return null;
  },
  touch(){ /* no-op: the server-issued session cookie has its own expiry */ },

  async signIn(username, password){
    try{
      const res = await api("/api/auth/login", {method:"POST", body:{username, password}});
      this.session = {uid:res.user.id, username:res.user.username, role:res.user.role, name:res.user.name};
      DB.canEdit = true; DB.uid = res.user.id; DB.role = res.user.role;
      DB.startPolling();
      await DB.refreshAll().catch(()=>{});
      return {ok:true, mustChange: !!res.user.mustChange};
    }catch(err){
      return {ok:false, msg: (err && err.message) || "Username or password is wrong."};
    }
  },

  async signOut(){
    try{ await api("/api/auth/logout", {method:"POST"}); }catch(e){}
    this.session = null;
    DB.canEdit = false; DB.uid = null; DB.role = null;
    DB.startPolling();
    await DB.refreshAll().catch(()=>{});
  },

  async changePassword(uid, current, next){
    try{
      await api("/api/auth/change-password", {method:"POST", body:{userId:uid, current, next}});
      if(this.session && this.session.uid === uid) this.session.mustChange = false;
      return {ok:true};
    }catch(err){
      return {ok:false, msg: (err && err.message) || "The password could not be saved."};
    }
  }
};

/* ---------- 19. AUDIT TRAIL ----------
   Money records are never hard-deleted. They are voided, and the void
   is itself an entry.                                                */

const Audit = {
  async log(action, entity, entityId, before, after, reason){
    if(!DB.canEdit) return;
    try{
      await DB.put("audit", "aud-" + uid(), {
        action, entity, entityId: entityId || null,
        before: before ? JSON.stringify(before).slice(0, 4000) : null,
        after:  after  ? JSON.stringify(after).slice(0, 4000)  : null,
        reason: reason || "", who: Auth.name,
        whoId: Auth.session ? Auth.session.uid : null,
        at: new Date().toISOString()
      });
    }catch(e){ console.warn("audit write failed", e && e.code); }
  }
};

/* ---------- 20. DOCUMENT NUMBERING ----------
   A lease makes two cashiers on two tills unable to mint the same
   invoice number at the same moment.                                */

async function nextNo(kind){
  const res = await api("/api/counters/" + kind, {method:"POST"});
  return res.no;
}

/* ---------- 21. DOUBLE-ENTRY LEDGER ----------
   Every money event posts a balanced journal entry, so the reports
   are derived from the books rather than from a total field on a row. */

const ACCOUNTS = [
  {code:"1000", name:"Cash on hand",        type:"Asset"},
  {code:"1010", name:"Bank",               type:"Asset"},
  {code:"1020", name:"Mobile money",       type:"Asset"},
  {code:"1100", name:"Accounts receivable",type:"Asset"},
  {code:"1200", name:"Vehicle inventory",  type:"Asset"},
  {code:"1210", name:"Parts inventory",    type:"Asset"},
  {code:"2000", name:"Accounts payable",   type:"Liability"},
  {code:"2100", name:"VAT payable",        type:"Liability"},
  {code:"4000", name:"Vehicle sales",      type:"Income"},
  {code:"4010", name:"Parts sales",        type:"Income"},
  {code:"4100", name:"Sales returns",      type:"Income"},
  {code:"5000", name:"Cost of vehicles sold", type:"Expense"},
  {code:"5010", name:"Cost of parts sold", type:"Expense"},
  {code:"6000", name:"Rent",               type:"Expense"},
  {code:"6010", name:"Salaries",           type:"Expense"},
  {code:"6020", name:"Utilities",          type:"Expense"},
  {code:"6030", name:"Transport",          type:"Expense"},
  {code:"6040", name:"Advertising",        type:"Expense"},
  {code:"6050", name:"Repairs and preparation", type:"Expense"},
  {code:"6900", name:"Other expenses",     type:"Expense"}
];
const accountName = code => (ACCOUNTS.find(a => a.code === code) || {}).name || code;
const accountType = code => (ACCOUNTS.find(a => a.code === code) || {}).type || "Expense";
const PAY_ACCOUNT = {CASH:"1000", CARD:"1010", BANK:"1010", MPESA:"1020", CREDIT:"1100"};
const EXPENSE_ACCOUNT = {Rent:"6000", Salaries:"6010", Utilities:"6020", Transport:"6030",
  Advertising:"6040", "Repairs and preparation":"6050", Packaging:"6900", "Petty cash":"6900", Other:"6900"};

const Ledger = {
  async post(memo, ref, lines){
    const debit  = lines.reduce((s,l)=>s + (Number(l.debit)||0), 0);
    const credit = lines.reduce((s,l)=>s + (Number(l.credit)||0), 0);
    if(Math.abs(debit - credit) > 0.5){
      console.warn("unbalanced entry blocked", memo, debit, credit);
      return null;
    }
    const no = await nextNo("journal");
    await DB.put("journal", "jrn-" + uid(), {
      no, memo, ref: ref || null, lines,
      debit, credit, date:new Date().toISOString(), by:Auth.name
    });
    return no;
  },
  /** Every posted line, flattened — the basis for every report. */
  lines(from, to){
    const out = [];
    [...DB.journal.values()].forEach(j => {
      if(from && j.date < from) return;
      if(to && j.date > to) return;
      (j.lines||[]).forEach(l => out.push(Object.assign({}, l, {date:j.date, no:j.no, memo:j.memo, ref:j.ref})));
    });
    return out;
  },
  balance(code, from, to){
    return this.lines(from, to).filter(l => l.account === code)
      .reduce((s,l)=>s + (Number(l.debit)||0) - (Number(l.credit)||0), 0);
  },
  totalBy(type, from, to){
    const codes = ACCOUNTS.filter(a => a.type === type).map(a => a.code);
    const raw = this.lines(from, to).filter(l => codes.includes(l.account))
      .reduce((s,l)=>s + (Number(l.debit)||0) - (Number(l.credit)||0), 0);
    return (type === "Income" || type === "Liability") ? -raw : raw;
  }
};

/* ---------- 22. LOGIN ---------- */

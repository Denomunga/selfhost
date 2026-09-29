"use strict";
/* Admin: cash register (till), cash movements, expenses. */

function admRegisters(){
  const list = [...DB.registers.values()].sort((a,b)=>String(b.openedAt).localeCompare(String(a.openedAt)));
  const reg = openRegister();
  return `${toolbar("Cash registers",
    reg ? `<button class="btn btn--sm" id="q-move">Cash in / out</button>
           <button class="btn btn--sm btn--solid" id="q-close">Close till</button>`
        : `<button class="btn btn--sm btn--solid" id="q-open">Open till</button>`)}
    ${reg?`<div class="till-live">
      <div><span>Register</span><b>${esc(reg.no)}</b></div>
      <div><span>Opened by</span><b>${esc(reg.openedBy)}</b></div>
      <div><span>Opening float</span><b class="num">${ksh(reg.openingCash)}</b></div>
      <div><span>Cash sales</span><b class="num">${ksh([...DB.payments.values()].filter(p=>p.registerId===reg.id&&p.method==="CASH").reduce((s,p)=>s+(Number(p.amount)||0),0))}</b></div>
      <div><span>Paid out</span><b class="num">${ksh([...DB.cashmoves.values()].filter(m=>m.registerId===reg.id&&m.type==="OUT").reduce((s,m)=>s+(Number(m.amount)||0),0))}</b></div>
      <div class="grand"><span>Expected in drawer</span><b class="num">${ksh(expectedCash(reg))}</b></div>
    </div>`:`<div class="notice">No till is open. Open one before taking cash so the drawer can be reconciled at close.</div>`}
    <h4 class="adm-h" style="margin-top:28px">Session history</h4>
    ${tbl(["Register","Opened by","Opening","Expected","Counted","Difference","Opened","Closed","Status"],
      list.map(r=>{
        const diff = r.status === "CLOSED" ? (Number(r.counted)||0) - (Number(r.expected)||0) : null;
        return `<tr>
          <td style="color:var(--white)">${esc(r.no)}</td><td>${esc(r.openedBy)}</td>
          <td class="num">${ksh(r.openingCash)}</td>
          <td class="num">${r.status==="CLOSED"?ksh(r.expected):ksh(expectedCash(r))}</td>
          <td class="num">${r.status==="CLOSED"?ksh(r.counted):"—"}</td>
          <td class="num ${diff!==null&&Math.abs(diff)>0.5?(diff<0?"bad":"good"):""}">
            ${diff===null?"—":(diff<0?"−":"+") + ksh(Math.abs(diff)).replace("KSh ","KSh ")}</td>
          <td class="muted">${dateLabel(r.openedAt)}</td>
          <td class="muted">${r.closedAt?dateLabel(r.closedAt):"—"}</td>
          <td><span class="pill ${r.status==="OPEN"?"pill--ok":""}">${esc(r.status)}</span></td></tr>`;
      }), "No till sessions yet.")}`;
}

function registerOpenForm(){
  if(openRegister()) return toast("A till is already open.", true);
  openModal(`<div class="modal-head"><div><span class="tag">Till</span>
      <h3 class="h-2" style="margin-top:10px">Open the register</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="reg-form" class="form-grid">
      ${inputField("rg-float","Opening cash float (KSh)", 20000, "number", 'min="0" step="500" required')}
      ${inputField("rg-note","Note","","text")}
      <div class="full btn-row"><button class="btn btn--solid" type="submit">Open till</button></div>
    </form>`);
  $("#reg-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const no = await nextNo("register"), id = "reg-" + uid();
    await DB.put("registers", id, {no, openingCash:num("#rg-float"), openedBy:Auth.name,
      openedAt:todayISO(), status:"OPEN", note:val("#rg-note"), closedAt:null, counted:null, expected:null});
    Audit.log("TILL_OPEN", "register", id, null, {openingCash:num("#rg-float")}, "");
    closeModal(); toast("Till open"); refreshAdmin();
  });
}

function registerCloseForm(){
  const reg = openRegister(); if(!reg) return toast("No till is open.", true);
  const expected = expectedCash(reg);
  openModal(`<div class="modal-head"><div><span class="tag">Till</span>
      <h3 class="h-2" style="margin-top:10px">Close ${esc(reg.no)}</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="till-live" style="margin-bottom:20px">
      <div class="grand"><span>Expected cash</span><b class="num">${ksh(expected)}</b></div>
    </div>
    <form id="cls-form" class="form-grid">
      ${inputField("cl-count","Counted cash in drawer (KSh)","","number",'min="0" step="50" required')}
      <div class="full" id="cl-diff"></div>
      <div class="field full"><label for="cl-reason">Reason for any difference</label>
        <textarea id="cl-reason" style="min-height:70px"></textarea></div>
      <div class="full btn-row"><button class="btn btn--solid" type="submit">Close till</button></div>
    </form>`);
  const show = () => {
    const d = num("#cl-count") - expected;
    $("#cl-diff").innerHTML = !$("#cl-count").value ? "" :
      `<div class="notice ${Math.abs(d)>0.5?(d<0?"notice--bad":"notice--good"):""}">
        Difference: ${d<0?"−":"+"}${ksh(Math.abs(d))} ${Math.abs(d)<=0.5?"— the drawer balances.":
        d<0?"— the drawer is short.":"— there is more cash than expected."}</div>`;
  };
  $("#cl-count").addEventListener("input", show);
  $("#cls-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const counted = num("#cl-count"), diff = counted - expected;
    if(Math.abs(diff) > 0.5 && !val("#cl-reason"))
      return toast("Give a reason for the difference before closing.", true);
    await DB.patch("registers", reg.id, {status:"CLOSED", closedAt:todayISO(),
      counted, expected, difference:diff, closeReason:val("#cl-reason"), closedBy:Auth.name});
    Audit.log("TILL_CLOSE", "register", reg.id, {expected}, {counted, difference:diff}, val("#cl-reason"));
    closeModal();
    toast(Math.abs(diff) <= 0.5 ? "Till closed and balanced" : `Till closed · ${diff<0?"short":"over"} ${ksh(Math.abs(diff))}`);
    refreshAdmin();
  });
}

function cashMoveForm(){
  const reg = openRegister(); if(!reg) return toast("Open the till first.", true);
  openModal(`<div class="modal-head"><div><span class="tag">Cash movement</span>
      <h3 class="h-2" style="margin-top:10px">Money in or out of the drawer</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="cm-form" class="form-grid">
      ${selectField("cm-type","Direction", [["IN","Cash added to drawer"],["OUT","Cash removed from drawer"]], "OUT")}
      ${inputField("cm-amt","Amount (KSh)","","number",'min="1" step="100" required')}
      ${inputField("cm-reason","Reason","","text","required")}
      <div class="full btn-row"><button class="btn btn--solid" type="submit">Record movement</button></div>
    </form>`);
  $("#cm-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const type = val("#cm-type"), amt = num("#cm-amt");
    await DB.put("cashmoves", "cm-" + uid(), {registerId:reg.id, type, amount:amt,
      reason:val("#cm-reason"), by:Auth.name, at:todayISO()});
    await Ledger.post(`Cash ${type === "IN" ? "in" : "out"} — ${val("#cm-reason")}`, reg.no,
      type === "IN" ? [{account:"1000", debit:amt, credit:0},{account:"1010", debit:0, credit:amt}]
                    : [{account:"1010", debit:amt, credit:0},{account:"1000", debit:0, credit:amt}]);
    Audit.log("CASH_MOVE", "register", reg.id, null, {type, amount:amt}, val("#cm-reason"));
    closeModal(); toast("Movement recorded"); refreshAdmin();
  });
}

function admCashMoves(){
  const list = [...DB.cashmoves.values()].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  return `${toolbar("Cash movements", openRegister()?`<button class="btn btn--sm btn--solid" id="q-move">Cash in / out</button>`:"")}
    ${tbl(["Till","Direction","Amount","Reason","By","When"], list.map(m=>`<tr>
      <td>${esc((DB.registers.get(m.registerId)||{}).no||"—")}</td>
      <td><span class="pill ${m.type==="IN"?"pill--ok":""}">${m.type==="IN"?"In":"Out"}</span></td>
      <td class="num">${ksh(m.amount)}</td><td>${esc(m.reason)}</td><td>${esc(m.by)}</td>
      <td class="muted" style="white-space:nowrap">${dateLabel(m.at)}</td></tr>`),
      "No cash has been moved in or out of a drawer.")}`;
}

/* ---------- 33. EXPENSES ---------- */

const EXPENSE_CATS = ["Rent","Salaries","Utilities","Transport","Advertising",
  "Repairs and preparation","Packaging","Petty cash","Other"];

function admExpenses(){
  const list = [...DB.expenses.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const total = list.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const byCat = EXPENSE_CATS.map(c=>[c, list.filter(x=>x.category===c).reduce((s,x)=>s+(Number(x.amount)||0),0)])
    .filter(x=>x[1] > 0).sort((a,b)=>b[1]-a[1]);
  return `${toolbar("Expenses", `<button class="btn btn--sm btn--solid" id="q-expense">Record expense</button>`)}
    ${statGrid([["Entries", list.length], ["Total out", ksh(total)],
      ["Largest category", byCat.length ? byCat[0][0] : "—", byCat.length ? ksh(byCat[0][1]) : ""]])}
    ${tbl(["Category","Amount","Method","Description","Recorded by","Date",""],
      list.map(x=>`<tr>
        <td style="color:var(--white)">${esc(x.category)}</td>
        <td class="num">${ksh(x.amount)}</td><td>${esc(x.method)}</td>
        <td>${esc(x.description||"—")}</td><td>${esc(x.by||"—")}</td>
        <td class="muted" style="white-space:nowrap">${dateLabel(x.date)}</td>
        <td><button class="mini mini--danger" data-voidexp="${esc(x.id)}">Void</button></td></tr>`),
      "No expenses recorded.")}`;
}

function expenseForm(){
  const reg = openRegister();
  openModal(`<div class="modal-head"><div><span class="tag">Expense</span>
      <h3 class="h-2" style="margin-top:10px">Record money going out</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="exp-form" class="form-grid">
      ${selectField("ex-cat","Category", EXPENSE_CATS, "Other")}
      ${inputField("ex-amt","Amount (KSh)","","number",'min="1" step="100" required')}
      ${selectField("ex-method","Paid by", METHODS, "CASH")}
      ${inputField("ex-date","Date", dayKey(todayISO()), "date")}
      <div class="field full"><label for="ex-desc">Description</label>
        <textarea id="ex-desc" style="min-height:80px"></textarea></div>
      ${reg?`<label class="tick full"><input type="checkbox" id="ex-till" checked> Paid out of the open till (${esc(reg.no)})</label>`:""}
      <div class="full btn-row" style="justify-content:space-between">
        <button class="btn btn--solid" type="submit">Record expense</button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button></div>
    </form>`);
  $("#exp-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const amt = num("#ex-amt"), cat = val("#ex-cat"), method = val("#ex-method");
    const fromTill = $("#ex-till") && $("#ex-till").checked;
    const id = "exp-" + uid();
    await DB.put("expenses", id, {category:cat, amount:amt, method,
      description:val("#ex-desc"), date:new Date(val("#ex-date")||Date.now()).toISOString(),
      registerId: fromTill && reg ? reg.id : null, by:Auth.name, createdAt:todayISO()});
    await Ledger.post(`Expense — ${cat}`, id, [
      {account:EXPENSE_ACCOUNT[cat] || "6900", debit:amt, credit:0},
      {account:PAY_ACCOUNT[method] || "1000", debit:0, credit:amt}
    ]);
    Audit.log("EXPENSE", "expense", id, null, {category:cat, amount:amt}, val("#ex-desc"));
    closeModal(); toast("Expense recorded"); refreshAdmin();
  });
}

/* ---------- 34. PURCHASING ---------- */

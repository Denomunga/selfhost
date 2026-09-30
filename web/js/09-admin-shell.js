"use strict";
/* Admin: login screen, dashboard shell, shared table/form helpers, common finance helpers. */

function viewLogin(){
  const s = DB.s;
  return `<main class="auth">
    <div class="auth-art">
      <div class="vcine-media" data-par="60">${frameSVG({kind:"side",env:"nairobi",body:"Wagon",seed:"login",alt:""})}</div>
      <div class="cine-scrim"></div>
      <div class="auth-art-in">
        <span class="tag">${esc(s.dealership)}</span>
        <h2 class="h-2" style="margin-top:14px;max-width:14ch">Staff access to the shop floor.</h2>
        <p class="muted" style="max-width:38ch;margin-top:14px">Inventory, invoices, payments and the till — all behind one sign-in.</p>
      </div>
    </div>
    <div class="auth-panel">
      <div class="auth-box">
        <a class="brand" href="#/" style="margin-bottom:34px">${markSubaru(32)}<span><b>${esc(s.dealership)}</b><small>Subaru · Kenya</small></span></a>
        <span class="tag">Sign in</span>
        <h1 class="h-2" style="margin:12px 0 26px">Welcome back</h1>
        <form id="login-form" class="form-grid">
          <div class="field full"><label for="lg-user">Username or email</label>
            <input id="lg-user" autocomplete="username" required autocapitalize="none" spellcheck="false"></div>
          <div class="field full"><label for="lg-pass">Password</label>
            <div class="pw-wrap">
              <input id="lg-pass" type="password" autocomplete="current-password" required>
              <button type="button" class="pw-eye" id="lg-eye" aria-label="Show password">Show</button>
            </div></div>
          <div class="full" id="lg-msg" style="display:none"></div>
          <div class="full"><button class="btn btn--solid" type="submit" id="lg-go" style="width:100%">Sign in</button></div>
        </form>
        <p class="muted" style="font-size:.8rem;margin-top:26px;line-height:1.7">
          Signing in unlocks the dashboard on this device. What each account is allowed to
          <em style="font-style:normal;color:var(--chalk)">change</em> is enforced by the server on top of this,
          not by this form.</p>
        <p class="muted" style="font-size:.8rem;margin-top:10px">No public sign-up — an administrator
          creates staff accounts from Users &amp; Roles once they're signed in.</p>
        <a class="crumb" href="#/" style="margin-top:18px">← Back to the website</a>
      </div>
    </div>
  </main>`;
}

function mountLogin(){
  console.log("[mountLogin] Function called");
  const f = $("#login-form"); 
  console.log("[mountLogin] Login form element:", f);
  if(!f) return;
  const eye = $("#lg-eye");
  if(eye) eye.addEventListener("click", ()=>{
    const p = $("#lg-pass");
    p.type = p.type === "password" ? "text" : "password";
    eye.textContent = p.type === "password" ? "Show" : "Hide";
  });
  f.addEventListener("submit", async e=>{
    e.preventDefault();
    console.log("[Login Form] Submit event triggered");
    const btn = $("#lg-go"), msg = $("#lg-msg");
    btn.disabled = true; btn.textContent = "Checking…";
    msg.style.display = "none";
    let res;
    console.log("[Login Form] Calling Auth.signIn");
    try{ res = await Auth.signIn($("#lg-user").value, $("#lg-pass").value); }
    catch(err){ 
      console.error("[Login Form] Auth.signIn error:", err);
      res = {ok:false, msg:"Something went wrong signing in. Please try again."}; 
    }
    console.log("[Login Form] Auth.signIn result:", res);
    if(!res.ok){
      btn.disabled = false; btn.textContent = "Sign in";
      msg.className = "notice notice--bad"; msg.textContent = res.msg; msg.style.display = "block";
      $("#lg-pass").value = ""; $("#lg-pass").focus();
      return;
    }
    // Force a router update to recognize the new session state
    btn.textContent = "Success!";
    console.log("[Login Form] Login successful, Auth.session:", Auth.session);
    console.log("[Login Form] DB.canEdit:", DB.canEdit, "DB.uid:", DB.uid);
    console.log("[Login Form] Current hash before redirect:", location.hash);
    
    // Direct DOM manipulation to show admin dashboard
    setTimeout(() => {
      console.log("[Login Form] About to directly show admin dashboard");
      location.hash = "#/admin";
      // Direct DOM manipulation
      const app = $("#app");
      if(app) {
        console.log("[Login Form] Found app element, setting admin HTML");
        app.innerHTML = viewAdmin();
        console.log("[Login Form] HTML set, calling mountAdmin");
        mountAdmin();
      } else {
        console.error("[Login Form] Could not find app element");
      }
    }, 100);
  });
}

/* ---------- 23. ADMIN SHELL ---------- */

let ADMIN_TAB = "overview";
const BODIES = ["SUV","Wagon","Sedan","Hatchback","Coupe"];
const KINDS  = [["side","Side"],["front","Front"],["rear","Rear"],["interior","Interior"],["wheel","Wheel"],["detail","Detail"],["landscape","Landscape"]];
const COMMON_FEATURES = Object.values(F);

const ADMIN_NAV = [
  ["", [["overview","Dashboard"]]],
  ["Marketing", [["meta_ads","Meta Advertising"]]],
  ["Sales", [["orders","Orders"],["invoices","Invoices"],["receipts","Receipts"],
             ["payments","Payments"],["refunds","Refunds & credit notes"],["customers","Customers"]]],
  ["Cash & money", [["registers","Cash registers"],["cashmoves","Cash movements"],["expenses","Expenses"]]],
  ["Purchasing", [["purchases","Purchases"],["suppliers","Suppliers"]]],
  ["Inventory", [["vehicles","Vehicles"],["parts","Parts inventory"],["photos","Photo library"],["stories","Stories"],["inquiries","Inquiries"]]],
  ["Accounting", [["accounts","Chart of accounts"],["journal","General ledger"],
                  ["receivable","Receivable"],["payable","Payable"]]],
  ["Reports", [["reports","Financial reports"],["audit","Audit log"]]],
  ["Settings", [["users","Users & roles"],["settings","Store settings"]]]
];

function viewAdmin(){
  if(!Auth.session) return viewLogin();
  const u = Auth.user;
  if(!u){ Auth.signOut(); return viewLogin(); }

  const nav = ADMIN_NAV.map(([group, items]) => `
    ${group?`<div class="sb-group">${esc(group)}</div>`:""}
    ${items.map(([k,l])=>`<button class="sb-item ${ADMIN_TAB===k?"on":""}" data-tab="${k}">
        <span>${esc(l)}</span>${badgeFor(k)}</button>`).join("")}`).join("");

  return `<div class="adm-shell">
    <aside class="sb" id="sb">
      <a class="brand" href="#/">${markSubaru(26)}<span><b>${esc(DB.s.dealership)}</b><small>Admin</small></span></a>
      <nav class="sb-nav">${nav}</nav>
      <div class="sb-foot">
        <div class="sb-who"><b>${esc(u.name || u.username)}</b><span>${esc(u.role)}</span></div>
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="mini" id="a-pw" style="flex:1">Password</button>
          <button class="mini" id="a-out" style="flex:1">Sign out</button>
        </div>
      </div>
    </aside>
    <div class="adm-main">
      <header class="adm-bar">
        <button class="mini sb-toggle" id="sb-toggle" aria-label="Toggle menu">Menu</button>
        <div class="adm-title">${esc(labelFor(ADMIN_TAB))}</div>
        <div class="adm-bar-right">
          <span class="count">Connected to ${API_BASE || "this server"}</span>
          ${openRegister()?`<span class="pill pill--ok">Till open · ${ksh(expectedCash(openRegister()))}</span>`
            :`<span class="pill">Till closed</span>`}
          <a class="mini" href="#/" target="_self">View site</a>
        </div>
      </header>
      ${DB.canEdit ? "" : `<div class="notice notice--bad" style="margin:clamp(18px,2.6vw,34px) clamp(18px,2.6vw,34px) 0">
        You are signed in, but this account is disabled or lacks permission, so the server will refuse
        any change you make. Ask an administrator to check your account under Users &amp; Roles.</div>`}
      <div class="adm-body" id="adm-body">${adminBody()}</div>
    </div>
  </div>`;
}

function labelFor(tab){
  for(const [,items] of ADMIN_NAV){ const f = items.find(i=>i[0]===tab); if(f) return f[1]; }
  return "Dashboard";
}
function badgeFor(tab){
  const n = tab === "inquiries" ? DB.allInquiries().filter(i=>i.status==="NEW").length
          : tab === "invoices"  ? overdueInvoices().length
          : tab === "orders"    ? [...DB.orders.values()].filter(o=>o.status==="PENDING").length : 0;
  return n ? `<i class="sb-badge">${n}</i>` : "";
}

function adminBody(){
  const t = ADMIN_TAB;
  const map = {
    overview:admOverview, meta_ads:admMetaAds, orders:admOrders, invoices:admInvoices, receipts:admReceipts,
    payments:admPayments, refunds:admRefunds, customers:admCustomers,
    registers:admRegisters, cashmoves:admCashMoves, expenses:admExpenses,
    purchases:admPurchases, suppliers:admSuppliers,
    vehicles:admVehicles, parts:admParts, photos:admPhotos, stories:admStories, inquiries:admInquiries,
    accounts:admAccounts, journal:admJournal, receivable:admReceivable, payable:admPayable,
    reports:admReports, audit:admAudit, users:admUsers, settings:admSettings
  };
  return (map[t] || admOverview)();
}

/* ---------- 24. SHARED ADMIN PIECES ---------- */

function tbl(cols, rows, emptyMsg){
  return `<div class="tbl-wrap"><table class="tbl">
    <thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${rows.length ? rows.join("")
      : `<tr><td colspan="${cols.length}" class="muted" style="padding:44px;text-align:center">${esc(emptyMsg||"Nothing here yet.")}</td></tr>`}
    </tbody></table></div>`;
}
function statGrid(items){
  return `<div class="stats">${items.map(([l,v,sub])=>`<div class="stat">
    <b class="num">${v}</b><span>${esc(l)}</span>
    ${sub?`<em class="stat-sub">${esc(sub)}</em>`:""}</div>`).join("")}</div>`;
}
function toolbar(title, buttons, right){
  return `<div class="adm-tools">
    <h3 class="h-3">${esc(title)}</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${right||""}${buttons||""}</div>
  </div>`;
}
function selectField(id, label, values, cur, blank){
  return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}">
    ${blank?`<option value="">${esc(blank)}</option>`:""}
    ${values.map(v=>{
      const val = Array.isArray(v)?v[0]:v, lab = Array.isArray(v)?v[1]:v;
      return `<option value="${esc(val)}" ${String(cur)===String(val)?"selected":""}>${esc(lab)}</option>`;
    }).join("")}</select></div>`;
}
function inputField(id, label, val, type, attrs){
  return `<div class="field"><label for="${id}">${esc(label)}</label>
    <input id="${id}" type="${type||"text"}" value="${esc(val==null?"":val)}" ${attrs||""}></div>`;
}
const num = id => Number(($(id) && $(id).value) || 0);
const val = id => (($(id) && $(id).value) || "").trim();
const todayISO = () => new Date().toISOString();
const dayKey = d => String(d||"").slice(0,10);

/* derived collections */
const invoiceBalance = inv => Math.max(0, (Number(inv.total)||0) - (Number(inv.paid)||0));
function invoiceStatus(inv){
  if(inv.status === "CANCELLED") return "CANCELLED";
  const bal = invoiceBalance(inv);
  if(bal <= 0.5) return "PAID";
  if((Number(inv.paid)||0) > 0) return "PARTIAL";
  if(inv.dueDate && dayKey(inv.dueDate) < dayKey(todayISO())) return "OVERDUE";
  return inv.status === "DRAFT" ? "DRAFT" : "SENT";
}
const overdueInvoices = () => [...DB.invoices.values()].filter(i=>invoiceStatus(i)==="OVERDUE");
const customerName = id => { const c = DB.customers.get(id); return c ? c.name : "Walk-in customer"; };
const supplierName = id => { const s = DB.suppliers.get(id); return s ? s.name : "—"; };
const openRegister = () => [...DB.registers.values()].find(r => r.status === "OPEN") || null;

function expectedCash(reg){
  if(!reg) return 0;
  let v = Number(reg.openingCash)||0;
  [...DB.payments.values()].forEach(p => {
    if(p.registerId === reg.id && p.method === "CASH") v += Number(p.amount)||0;
  });
  [...DB.refunds.values()].forEach(r => {
    if(r.registerId === reg.id && r.method === "CASH") v -= Number(r.amount)||0;
  });
  [...DB.cashmoves.values()].forEach(m => {
    if(m.registerId !== reg.id) return;
    v += m.type === "IN" ? (Number(m.amount)||0) : -(Number(m.amount)||0);
  });
  [...DB.expenses.values()].forEach(x => {
    if(x.registerId === reg.id && x.method === "CASH") v -= Number(x.amount)||0;
  });
  return v;
}

/* ---------- 25. DASHBOARD ---------- */

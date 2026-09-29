"use strict";
/* Admin: users, password form, photo library, printing, CSV export, action wiring. */

function admUsers(){
  const list = [...DB.users.values()];
  const me = Auth.session ? Auth.session.uid : null;
  return `${toolbar("Users and roles", `<button class="btn btn--sm btn--solid" id="q-user">Add user</button>`)}
    <div class="notice" style="margin-bottom:20px">Signing in unlocks this dashboard on the device.
      What an account can actually <b>write</b> is decided by the server from the sharing permission on this
      server — disabling an account here immediately blocks it from signing in again.</div>
    ${tbl(["Username","Name","Email","Role","Last sign-in","Status",""], list.map(u=>`<tr>
      <td style="color:var(--white)">${esc(u.username)}${u.id===me?` <span class="pill">you</span>`:""}</td>
      <td>${esc(u.name||"—")}</td><td class="muted">${esc(u.email||"—")}</td>
      <td><span class="pill ${u.role==="admin"?"pill--new":""}">${esc(u.role)}</span></td>
      <td class="muted">${u.lastLogin?dateLabel(u.lastLogin):"never"}</td>
      <td>${u.mustChange?`<span class="pill pill--bad">must change password</span>`
        :u.active===false?`<span class="pill">disabled</span>`:`<span class="pill pill--ok">active</span>`}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="mini" data-userpw="${esc(u.id)}">Reset password</button>
        ${u.id!==me?`<button class="mini" data-usertoggle="${esc(u.id)}">${u.active===false?"Enable":"Disable"}</button>`:""}
      </div></td></tr>`), "No users.")}`;
}

function userForm(){
  openModal(`<div class="modal-head"><div><span class="tag">New user</span>
      <h3 class="h-2" style="margin-top:10px">Add a staff account</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="usr-form" class="form-grid">
      ${inputField("us-user","Username","","text",'required autocapitalize="none"')}
      ${inputField("us-name","Full name","","text")}
      ${inputField("us-email","Email","","email")}
      ${selectField("us-role","Role", [["cashier","Cashier"],["manager","Manager"],["admin","Administrator"]], "cashier")}
      ${inputField("us-pw","Temporary password","","text","required")}
      <label class="tick full"><input type="checkbox" id="us-must" checked> Require a password change at first sign-in</label>
      <div class="full btn-row"><button class="btn btn--solid" type="submit" id="us-go">Create account</button></div>
    </form>`);
  $("#usr-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const probs = passwordProblems(val("#us-pw"));
    if(probs.length) return toast("The temporary password needs " + probs.join(", ") + ".", true);
    const uname = val("#us-user").toLowerCase();
    if([...DB.users.values()].some(u=>String(u.username).toLowerCase() === uname))
      return toast("That username is taken.", true);
    const btn = $("#us-go"); btn.disabled = true; btn.textContent = "Creating…";
    try{
      const res = await api("/api/auth/users", {method:"POST", body:{
        username:uname, name:val("#us-name"), email:val("#us-email"), role:val("#us-role"),
        password:val("#us-pw"), mustChange:$("#us-must").checked
      }});
      Audit.log("USER_CREATED", "user", res.id, null, {username:uname, role:val("#us-role")}, "");
      await DB.refreshAll();
      closeModal(); toast("Account created"); refreshAdmin();
    }catch(err){
      btn.disabled = false; btn.textContent = "Create account";
      toast((err && err.message) || "Could not create the account.", true);
    }
  });
}

function passwordForm(uid_, forced){
  const u = DB.users.get(uid_); if(!u) return;
  const mine = Auth.session && Auth.session.uid === uid_;
  openModal(`<div class="modal-head"><div><span class="tag">${forced?"Password change required":"Password"}</span>
      <h3 class="h-2" style="margin-top:10px">${forced?"Choose a new password":`Reset ${esc(u.username)}`}</h3>
      ${forced?`<p class="muted" style="margin-top:10px;max-width:44ch">This account is still on the
        password it shipped with. Pick something only you know before you carry on.</p>`:""}</div>
      ${forced?"":`<button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button>`}</div>
    <form id="pw-form" class="form-grid">
      ${mine && !forced ? inputField("pw-cur","Current password","","password",'autocomplete="current-password" required') : ""}
      ${forced ? inputField("pw-cur","Current password","","password",'autocomplete="current-password" required') : ""}
      ${inputField("pw-new","New password","","password",'autocomplete="new-password" required')}
      ${inputField("pw-rep","Repeat new password","","password",'autocomplete="new-password" required')}
      <div class="full muted" style="font-size:.8rem">At least 8 characters, with a letter and a number.</div>
      <div class="full btn-row"><button class="btn btn--solid" type="submit" id="pw-go" style="width:100%">Save password</button></div>
    </form>`);
  $("#pw-form").addEventListener("submit", async e=>{
    e.preventDefault();
    if(val("#pw-new") !== val("#pw-rep")) return toast("The two passwords don't match.", true);
    const btn = $("#pw-go"); btn.disabled = true; btn.textContent = "Saving…";
    const cur = $("#pw-cur") ? val("#pw-cur") : null;
    const res = await Auth.changePassword(uid_, cur, val("#pw-new"));
    btn.disabled = false; btn.textContent = "Save password";
    if(!res.ok) return toast(res.msg, true);
    closeModal(); toast("Password updated"); refreshAdmin();
  });
}

/* ---------- 39. PHOTO LIBRARY ---------- */

function admPhotos(){
  const cars = DB.allCars(), parts = DB.allParts();
  const carsReal = cars.filter(c=>(c.images||[]).some(i=>i.assetId));
  const partsReal = parts.filter(p=>(p.images||[]).some(i=>i.assetId));
  return `${toolbar("Photo library")}
    <div class="notice" style="margin-bottom:22px">
      Vehicles and parts below use generated placeholder artwork until you upload real photographs.
      Uploaded files are stored with this site and served from it — no external image host is involved,
      and none would be permitted by the page's security policy.</div>
    ${statGrid([["Vehicles", cars.length], ["Vehicles with photos", carsReal.length],
      ["Parts", parts.length], ["Parts with photos", partsReal.length]])}
    <h4 class="adm-h">Vehicles</h4>
    ${tbl(["Vehicle","Images","Source",""], cars.map(c=>{
      const imgs = c.images||[];
      const real = imgs.filter(i=>i.assetId).length;
      return `<tr>
        <td style="color:var(--white)">${esc(c.year)} ${esc(c.model)} ${esc(c.variant||"")}</td>
        <td class="num">${imgs.length}</td>
        <td>${real ? `<span class="pill pill--ok">${real} photo${real===1?"":"s"}</span>`
                   : `<span class="pill">placeholder art</span>`}</td>
        <td><button class="mini" data-edit="${esc(c.id)}">Upload photos</button></td></tr>`;
    }), "No vehicles yet.")}
    <h4 class="adm-h" style="margin-top:30px">Parts</h4>
    ${tbl(["Part","Images","Source",""], parts.map(p=>{
      const imgs = p.images||[];
      const real = imgs.filter(i=>i.assetId).length;
      return `<tr>
        <td style="color:var(--white)">${esc(p.name)}</td>
        <td class="num">${imgs.length}</td>
        <td>${real ? `<span class="pill pill--ok">${real} photo${real===1?"":"s"}</span>`
                   : `<span class="pill">placeholder art</span>`}</td>
        <td><button class="mini" data-partedit="${esc(p.id)}">Upload photos</button></td></tr>`;
    }), "No parts yet.")}`;
}

/* ---------- 40. PRINTING ---------- */

function printDoc(html, narrow){
  let area = $("#print-area");
  if(!area){
    area = document.createElement("div");
    area.id = "print-area";
    document.body.appendChild(area);
  }
  area.className = narrow ? "narrow" : "";
  area.innerHTML = html;
  document.body.classList.add("printing");
  const done = () => {
    document.body.classList.remove("printing");
    area.innerHTML = "";
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  setTimeout(()=>window.print(), 120);
}

function exportCSV(){
  const [from, to] = rangeBounds(REPORT_RANGE);
  const rows = [["Document","Date","Customer","Total","Paid","Balance","Status"]];
  [...DB.invoices.values()].filter(i=>i.issueDate>=from && i.issueDate<=to).forEach(i=>{
    rows.push([i.no, dayKey(i.issueDate), customerName(i.customerId),
      i.total, i.paid, invoiceBalance(i), invoiceStatus(i)]);
  });
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], {type:"text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sheriffmotors-invoices-${REPORT_RANGE}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- 41. ADMIN WIRING ---------- */

function bindOnce(el, ev, fn){
  if(!el || el.dataset.bound) return;
  el.dataset.bound = "1";
  el.addEventListener(ev, fn);
}
function bindAll(sel, fn, root){
  $$(sel, root || document).forEach(el => bindOnce(el, "click", () => fn(el)));
}

/** Every money action, bindable inside the page body or inside a modal. */
function bindMoneyActions(root){
  bindAll("#q-sell",     ()=>sellForm(), root);
  bindAll("#q-expense",  ()=>expenseForm(), root);
  bindAll("#q-open",     ()=>registerOpenForm(), root);
  bindAll("#q-close",    ()=>registerCloseForm(), root);
  bindAll("#q-move",     ()=>cashMoveForm(), root);
  bindAll("#q-customer", ()=>customerForm(null), root);
  bindAll("#q-supplier", ()=>supplierForm(), root);
  bindAll("#q-purchase", ()=>purchaseForm(), root);
  bindAll("#q-user",     ()=>userForm(), root);
  bindAll("#new-part",   ()=>partForm(null), root);

  bindAll("[data-inv]",    el=>invoiceDetail(el.dataset.inv), root);
  bindAll("[data-pay]",    el=>paymentForm(el.dataset.pay), root);
  bindAll("[data-rcpt]",   el=>receiptDetail(el.dataset.rcpt), root);
  bindAll("[data-order]",  el=>orderDetail(el.dataset.order), root);
  bindAll("[data-cust]",   el=>customerDetail(el.dataset.cust), root);
  bindAll("[data-custedit]", el=>customerForm(el.dataset.custedit), root);
  bindAll("[data-refund]", el=>refundForm(el.dataset.refund), root);
  bindAll("[data-paysup]", el=>supplierPayForm(el.dataset.paysup), root);
  bindAll("[data-userpw]", el=>passwordForm(el.dataset.userpw, false), root);
  bindAll("[data-partedit]", el=>partForm(el.dataset.partedit), root);
  bindAll("[data-partdel]", el=>{
    const p = DB.part(el.dataset.partdel); if(!p) return;
    confirmBox(`Delete ${p.name}?`, "This removes the part from the catalogue for good.", async ()=>{
      await DB.remove("parts", p.id); toast("Part deleted"); refreshAdmin();
    });
  }, root);

  bindAll("[data-goto]", el=>{ ADMIN_TAB = el.dataset.goto; closeModal(); refreshAdmin(); }, root);
  bindAll("[data-range]", el=>{ REPORT_RANGE = el.dataset.range; refreshAdmin(); }, root);

  bindAll("[data-cancel]", el=>{
    const inv = DB.invoices.get(el.dataset.cancel); if(!inv) return;
    reasonBox(`Cancel ${inv.no}?`,
      "The invoice stays on record as cancelled and the ledger entry is reversed. Nothing is deleted.",
      async reason=>{
        await DB.patch("invoices", inv.id, {status:"CANCELLED", cancelledAt:todayISO(), cancelReason:reason});
        const net = (Number(inv.total)||0) - (Number(inv.tax)||0);
        const lines = [{account:"4000", debit:net, credit:0}];
        if(Number(inv.tax) > 0.5) lines.push({account:"2100", debit:inv.tax, credit:0});
        lines.push({account:"1100", debit:0, credit:inv.total});
        await Ledger.post(`Cancellation of ${inv.no}`, inv.no, lines);
        if(inv.carId && DB.car(inv.carId)) await DB.patch("cars", inv.carId, {status:"AVAILABLE", soldAt:null});
        Audit.log("INVOICE_CANCELLED", "invoice", inv.id, {status:inv.status}, {status:"CANCELLED"}, reason);
        closeModal(); toast("Invoice cancelled and reversed"); refreshAdmin();
      });
  }, root);

  bindAll("[data-voidexp]", el=>{
    const x = DB.expenses.get(el.dataset.voidexp); if(!x) return;
    reasonBox("Void this expense?", "The entry is reversed in the ledger and kept in the audit log.",
      async reason=>{
        await DB.patch("expenses", x.id, {voided:true, voidReason:reason, voidedAt:todayISO()});
        await Ledger.post(`Void expense — ${x.category}`, x.id, [
          {account:PAY_ACCOUNT[x.method]||"1000", debit:x.amount, credit:0},
          {account:EXPENSE_ACCOUNT[x.category]||"6900", debit:0, credit:x.amount}
        ]);
        Audit.log("EXPENSE_VOIDED", "expense", x.id, {amount:x.amount}, {voided:true}, reason);
        closeModal(); toast("Expense voided"); refreshAdmin();
      });
  }, root);

  bindAll("[data-usertoggle]", el=>{
    const u = DB.users.get(el.dataset.usertoggle); if(!u) return;
    const nextActive = u.active === false;
    api("/api/auth/users/" + u.id, {method:"PATCH", body:{active: nextActive}}).then(async ()=>{
      Audit.log(nextActive ? "USER_ENABLED" : "USER_DISABLED", "user", u.id, null, null, "");
      await DB.refreshAll();
      toast(nextActive ? "Account enabled" : "Account disabled"); refreshAdmin();
    }).catch(err=>toast((err && err.message) || "Could not update that account.", true));
  }, root);

  bindAll("#rp-print", ()=>{
    const area = $("#report-area");
    if(area) printDoc(`<div class="doc doc--print"><div class="doc-head">
      <div><div class="doc-brand">${esc(DB.s.dealership)}</div>
      <div class="doc-small">${esc(DB.s.address)}</div></div>
      <div style="text-align:right"><div class="doc-type">Financial report</div>
      <div class="doc-small">${esc(REPORT_RANGE)} · generated ${dateLabel(todayISO())}</div></div></div>
      ${area.innerHTML}</div>`);
  }, root);
  bindAll("#rp-csv", ()=>exportCSV(), root);
}
function wireMoneyButtons(){ bindMoneyActions($("#modal-box")); }

function reasonBox(title, note, onOK){
  openModal(`<div class="modal-head"><div><h3 class="h-3">${esc(title)}</h3>
      <p class="muted" style="margin:10px 0 0;font-size:.9rem">${esc(note)}</p></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="field" style="margin-top:14px"><label for="rb-reason">Reason (kept in the audit log)</label>
      <input id="rb-reason" required></div>
    <div class="btn-row" style="margin-top:18px">
      <button class="btn btn--solid" id="rb-go">Confirm</button>
      <button class="btn" onclick="closeModal()">Keep it</button></div>`);
  $("#rb-go").addEventListener("click", async ()=>{
    const r = val("#rb-reason");
    if(!r) return toast("Give a reason first.", true);
    await onOK(r);
  });
}

function refreshAdmin(){
  const body = $("#adm-body");
  if(!body){ render(); return; }
  const title = $(".adm-title");
  if(title) title.textContent = labelFor(ADMIN_TAB);
  $$(".sb-item").forEach(b => b.classList.toggle("on", b.dataset.tab === ADMIN_TAB));
  body.innerHTML = adminBody();
  body.scrollTop = 0;
  mountAdminBody();
}

function mountAdmin(){
  $$(".sb-item").forEach(b => bindOnce(b, "click", ()=>{
    ADMIN_TAB = b.dataset.tab;
    $("#sb").classList.remove("open");
    refreshAdmin();
  }));
  bindOnce($("#sb-toggle"), "click", ()=>$("#sb").classList.toggle("open"));
  bindOnce($("#a-out"), "click", ()=>{ Auth.signOut(); toast("Signed out"); render(); });
  bindOnce($("#a-pw"), "click", ()=>passwordForm(Auth.session.uid, false));
  mountAdminBody();
  const u = Auth.user;
  if(u && u.mustChange) setTimeout(()=>passwordForm(u.id, true), 350);
}

function mountAdminBody(){
  bindMoneyActions(document);
  mountAdminLegacy();
}

/* ---------- 42. EXTENDED DATA LAYER ---------- */

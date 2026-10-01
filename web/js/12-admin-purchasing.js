"use strict";
/* Admin: purchases and suppliers. */

function admPurchases(){
  const list = [...DB.purchases.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const owed = list.reduce((s,p)=>s + Math.max(0,(Number(p.cost)||0)-(Number(p.paid)||0)), 0);
  const noCost = DB.available().filter(c=>!carCost(c.id));
  return `${toolbar("Purchases", `<button class="btn btn--sm btn--solid" id="q-purchase">Record purchase</button>`)}
    ${statGrid([["Purchases", list.length, "", {points:adminDailySeries(list,p=>p.date,()=>1)}],
      ["Spent on stock", ksh(list.reduce((s,p)=>s+(Number(p.cost)||0),0)), "",
        {points:adminDailySeries(list,p=>p.date,p=>p.cost),invert:true}],
      ["Owed to suppliers", ksh(owed)],
      ["Vehicles without cost", noCost.length]])}
    ${noCost.length?`<div class="notice" style="margin-bottom:20px">${noCost.length} available vehicle${noCost.length===1?" has":"s have"}
      no purchase cost, so gross profit on ${noCost.length===1?"it":"them"} cannot be calculated.</div>`:""}
    ${tbl(["Purchase","Supplier","Vehicle","Cost","Paid","Balance","Date",""],
      list.map(p=>{
        const car = DB.car(p.carId);
        const bal = Math.max(0,(Number(p.cost)||0)-(Number(p.paid)||0));
        return `<tr>
          <td style="color:var(--white)">${esc(p.no)}</td>
          <td>${esc(supplierName(p.supplierId))}</td>
          <td>${esc(car ? `${car.year} ${car.model} ${car.variant||""}` : p.vehicle || "—")}</td>
          <td class="num">${ksh(p.cost)}</td><td class="num">${ksh(p.paid)}</td>
          <td class="num">${ksh(bal)}</td>
          <td class="muted" style="white-space:nowrap">${dateLabel(p.date)}</td>
          <td>${bal>0?`<button class="mini" data-paysup="${esc(p.id)}">Pay supplier</button>`:`<span class="pill pill--ok">Settled</span>`}</td></tr>`;
      }), "No purchases recorded. Recording one sets the vehicle's cost and makes profit reporting work.")}`;
}

function purchaseForm(){
  const cars = DB.allCars();
  const sups = [...DB.suppliers.values()];
  openModal(`<div class="modal-head"><div><span class="tag">Purchase</span>
      <h3 class="h-2" style="margin-top:10px">Record a vehicle purchase</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="pur-form" class="form-grid">
      ${selectField("pu-sup","Supplier", sups.map(s=>[s.id, s.name]), "", sups.length?"New supplier…":"New supplier…")}
      <div class="field" id="pu-newsup"><label for="pu-supname">New supplier name</label><input id="pu-supname"></div>
      ${selectField("pu-car","Vehicle", cars.map(c=>[c.id, `${c.year} Subaru ${c.model} ${c.variant||""}`]), "")}
      ${inputField("pu-cost","Purchase cost landed (KSh)","","number",'min="0" step="10000" required')}
      ${inputField("pu-paid","Paid now (KSh)","0","number",'min="0" step="10000"')}
      ${selectField("pu-method","Paid by", METHODS, "BANK")}
      ${inputField("pu-date","Date", dayKey(todayISO()), "date")}
      <div class="full notice">This is what the vehicle cost you, landed. It stays private — it is stored
        separately from the public listing, so it never reaches the website.</div>
      <div class="full btn-row" style="justify-content:space-between">
        <button class="btn btn--solid" type="submit">Record purchase</button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button></div>
    </form>`, true);
  const toggle = () => { $("#pu-newsup").style.display = $("#pu-sup").value ? "none" : "block"; };
  $("#pu-sup").addEventListener("change", toggle); toggle();

  $("#pur-form").addEventListener("submit", async e=>{
    e.preventDefault();
    let supId = val("#pu-sup");
    if(!supId){
      const nm = val("#pu-supname");
      if(!nm) return toast("Name the supplier.", true);
      supId = "sup-" + uid();
      await DB.put("suppliers", supId, {name:nm, phone:"", email:"", address:"", createdAt:todayISO()});
    }
    const cost = num("#pu-cost"), paid = Math.min(num("#pu-paid"), cost);
    const carId = val("#pu-car"), car = DB.car(carId);
    const no = await nextNo("purchase"), id = "pur-" + uid();
    await DB.put("purchases", id, {no, supplierId:supId, carId,
      vehicle: car ? `${car.year} Subaru ${car.model} ${car.variant||""}` : "",
      cost, paid, method:val("#pu-method"),
      date:new Date(val("#pu-date")||Date.now()).toISOString(), by:Auth.name});
    if(carId) await DB.put("carcost", carId, {cost, purchaseId:id, supplierId:supId, at:todayISO()});

    await Ledger.post(`Purchase ${no} — ${supplierName(supId)}`, no,
      [{account:"1200", debit:cost, credit:0}, {account:"2000", debit:0, credit:cost}]);
    if(paid > 0) await Ledger.post(`Supplier payment on ${no}`, no,
      [{account:"2000", debit:paid, credit:0}, {account:PAY_ACCOUNT[val("#pu-method")]||"1010", debit:0, credit:paid}]);
    Audit.log("PURCHASE", "purchase", id, null, {no, cost, paid}, "");
    closeModal(); toast(`Purchase ${no} recorded`); refreshAdmin();
  });
}

function supplierPayForm(purId){
  const p = DB.purchases.get(purId); if(!p) return;
  const bal = Math.max(0,(Number(p.cost)||0)-(Number(p.paid)||0));
  openModal(`<div class="modal-head"><div><span class="tag">Supplier payment</span>
      <h3 class="h-2" style="margin-top:10px">${esc(p.no)}</h3>
      <div class="muted num" style="margin-top:6px">Outstanding ${ksh(bal)} to ${esc(supplierName(p.supplierId))}</div></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="sp-form" class="form-grid">
      ${inputField("sp-amt","Amount (KSh)", bal, "number", `min="1" max="${bal}" step="1000" required`)}
      ${selectField("sp-method","Method", METHODS, "BANK")}
      ${inputField("sp-ref","Reference","","text")}
      <div class="full btn-row"><button class="btn btn--solid" type="submit">Record payment</button></div>
    </form>`);
  $("#sp-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const amt = Math.min(num("#sp-amt"), bal);
    await DB.patch("purchases", p.id, {paid:(Number(p.paid)||0) + amt});
    await Ledger.post(`Supplier payment on ${p.no}`, p.no,
      [{account:"2000", debit:amt, credit:0}, {account:PAY_ACCOUNT[val("#sp-method")]||"1010", debit:0, credit:amt}]);
    Audit.log("SUPPLIER_PAYMENT", "purchase", p.id, {paid:p.paid}, {paid:(Number(p.paid)||0)+amt}, val("#sp-ref"));
    closeModal(); toast("Supplier payment recorded"); refreshAdmin();
  });
}

function admSuppliers(){
  const list = [...DB.suppliers.values()];
  const stats = s => {
    const purs = [...DB.purchases.values()].filter(p=>p.supplierId === s.id);
    const cost = purs.reduce((a,p)=>a+(Number(p.cost)||0),0);
    const paid = purs.reduce((a,p)=>a+(Number(p.paid)||0),0);
    return {purs, cost, paid, bal:Math.max(0,cost-paid)};
  };
  return `${toolbar("Suppliers", `<button class="btn btn--sm btn--solid" id="q-supplier">Add supplier</button>`)}
    ${tbl(["Supplier","Phone","Purchases","Total cost","Paid","Balance"],
      list.map(s=>{ const st = stats(s); return `<tr>
        <td style="color:var(--white)">${esc(s.name)}</td><td>${esc(s.phone||"—")}</td>
        <td class="num">${st.purs.length}</td><td class="num">${ksh(st.cost)}</td>
        <td class="num">${ksh(st.paid)}</td><td class="num">${ksh(st.bal)}</td></tr>`;
      }), "No suppliers yet.")}`;
}

function supplierForm(){
  openModal(`<div class="modal-head"><div><span class="tag">Supplier</span>
      <h3 class="h-2" style="margin-top:10px">Add a supplier</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="sup-form" class="form-grid">
      ${inputField("su-name","Name","","text","required")}
      ${inputField("su-phone","Phone","","tel")}
      ${inputField("su-email","Email","","email")}
      ${inputField("su-addr","Address","","text")}
      <div class="full btn-row"><button class="btn btn--solid" type="submit">Add supplier</button></div>
    </form>`);
  $("#sup-form").addEventListener("submit", async e=>{
    e.preventDefault();
    await DB.put("suppliers", "sup-" + uid(), {name:val("#su-name"), phone:val("#su-phone"),
      email:val("#su-email"), address:val("#su-addr"), createdAt:todayISO()});
    closeModal(); toast("Supplier added"); refreshAdmin();
  });
}

/* ---------- 35. ACCOUNTING ---------- */

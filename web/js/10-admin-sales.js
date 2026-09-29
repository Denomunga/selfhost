"use strict";
/* Admin: dashboard overview, orders, the sell flow, invoices, payments, receipts, refunds, customers. */

function admOverview(){
  const now = new Date();
  const t0 = dayKey(todayISO());
  const weekAgo = new Date(now.getTime() - 6*86400000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const invs = [...DB.invoices.values()].filter(i=>i.status !== "CANCELLED");
  const sumInv = list => list.reduce((s,i)=>s + (Number(i.total)||0), 0);
  const todayInv  = invs.filter(i=>dayKey(i.issueDate) === t0);
  const weekInv   = invs.filter(i=>i.issueDate >= weekAgo);
  const monthInv  = invs.filter(i=>i.issueDate >= monthStart);

  const pays = [...DB.payments.values()];
  const byMethod = m => pays.filter(p=>p.method === m).reduce((s,p)=>s + (Number(p.amount)||0), 0);
  const refunded = [...DB.refunds.values()].reduce((s,r)=>s + (Number(r.amount)||0), 0);
  const expenses = [...DB.expenses.values()].reduce((s,x)=>s + (Number(x.amount)||0), 0);

  const revenue = Ledger.totalBy("Income", monthStart);
  const cogs = Ledger.balance("5000", monthStart) + Ledger.balance("5010", monthStart);
  const grossProfit = revenue - cogs;
  const outstanding = invs.reduce((s,i)=>s + invoiceBalance(i), 0);
  const payable = -Ledger.balance("2000");
  const vehicleStockValue = DB.available().reduce((s,c)=>s + (Number(carCost(c.id))||0), 0);
  const partStockValue = DB.allParts().reduce((s,p)=>s + partCost(p.id) * (Number(p.stock)||0), 0);
  const lowParts = DB.allParts().filter(p=>{const q=Number(p.stock)||0; return q>0 && q<=3;});
  const outParts = DB.allParts().filter(p=>(Number(p.stock)||0)<=0);
  const reg = openRegister();

  const recent = [
    ...pays.map(p=>({t:p.createdAt, s:`Payment ${p.no} · ${ksh(p.amount)} · ${p.method}`, k:"payments"})),
    ...invs.map(i=>({t:i.issueDate, s:`Invoice ${i.no} · ${customerName(i.customerId)} · ${ksh(i.total)}`, k:"invoices"})),
    ...[...DB.expenses.values()].map(x=>({t:x.date, s:`Expense · ${x.category} · ${ksh(x.amount)}`, k:"expenses"}))
  ].sort((a,b)=>String(b.t).localeCompare(String(a.t))).slice(0,9);

  return `
    ${toolbar("Financial overview",
      `<button class="btn btn--sm btn--solid" id="q-sell">Sell a vehicle</button>
       <button class="btn btn--sm" id="q-expense">Record expense</button>
       ${reg?`<button class="btn btn--sm" id="q-close">Close till</button>`
            :`<button class="btn btn--sm" id="q-open">Open till</button>`}`)}

    ${statGrid([
      ["Sales today", ksh(sumInv(todayInv)), todayInv.length + " invoice" + (todayInv.length===1?"":"s")],
      ["This week", ksh(sumInv(weekInv)), weekInv.length + " invoices"],
      ["This month", ksh(sumInv(monthInv)), monthInv.length + " invoices"],
      ["Gross profit (month)", ksh(grossProfit), "revenue less vehicle cost"],
      ["Outstanding", ksh(outstanding), overdueInvoices().length + " overdue"],
      ["Owed to suppliers", ksh(payable), DB.suppliers.size + " suppliers"],
      ["Cash in drawer", reg ? ksh(expectedCash(reg)) : "Till closed", reg ? "expected" : "open it to trade"],
      ["Vehicle stock at cost", ksh(vehicleStockValue), DB.available().length + " vehicles"],
      ["Parts stock at cost", ksh(partStockValue), DB.allParts().length + " parts"]
    ])}

    <div class="adm-split">
      <div>
        <h4 class="adm-h">Money in, by method</h4>
        ${tbl(["Method","Received","Share"],
          ["CASH","MPESA","CARD","BANK"].map(m=>{
            const v = byMethod(m), total = pays.reduce((s,p)=>s+(Number(p.amount)||0),0) || 1;
            return `<tr><td>${m === "MPESA" ? "Mobile money (M-PESA)" : m.charAt(0)+m.slice(1).toLowerCase()}</td>
              <td class="num">${ksh(v)}</td>
              <td><div class="meter"><i style="width:${((v/total)*100).toFixed(1)}%"></i></div></td></tr>`;
          }), "No payments recorded yet.")}

        <h4 class="adm-h" style="margin-top:30px">Recent activity</h4>
        ${tbl(["Event","When",""], recent.map(r=>`<tr>
          <td>${esc(r.s)}</td><td class="muted" style="white-space:nowrap">${dateLabel(r.t)}</td>
          <td><button class="mini" data-goto="${r.k}">Open</button></td></tr>`),
          "Nothing has been recorded yet. Start by selling a vehicle.")}
      </div>
      <div>
        <h4 class="adm-h">Position</h4>
        <dl class="specs" style="grid-template-columns:1fr">
          <div class="spec"><dt>Revenue this month</dt><dd class="num">${ksh(revenue)}</dd></div>
          <div class="spec"><dt>Cost of goods sold</dt><dd class="num">${ksh(cogs)}</dd></div>
          <div class="spec"><dt>Expenses this month</dt><dd class="num">${ksh(Ledger.totalBy("Expense", monthStart) - cogs)}</dd></div>
          <div class="spec"><dt>Refunds issued</dt><dd class="num">${ksh(refunded)}</dd></div>
          <div class="spec"><dt>Total expenses recorded</dt><dd class="num">${ksh(expenses)}</dd></div>
          <div class="spec"><dt>VAT payable</dt><dd class="num">${ksh(-Ledger.balance("2100"))}</dd></div>
        </dl>
        ${overdueInvoices().length?`<div class="notice notice--bad" style="margin-top:20px">
          ${overdueInvoices().length} invoice${overdueInvoices().length===1?" is":"s are"} past the due date,
          worth ${ksh(overdueInvoices().reduce((s,i)=>s+invoiceBalance(i),0))}.
          <div style="margin-top:12px"><button class="mini" data-goto="invoices">Review them</button></div></div>`:""}
        ${DB.available().filter(c=>!carCost(c.id)).length?`<div class="notice" style="margin-top:16px">
          ${DB.available().filter(c=>!carCost(c.id)).length} vehicles have no purchase cost recorded, so their
          profit cannot be calculated. Add it under Purchasing.</div>`:""}
        ${(lowParts.length||outParts.length)?`<div class="notice ${outParts.length?"notice--bad":""}" style="margin-top:16px">
          ${outParts.length?`${outParts.length} part${outParts.length===1?" is":"s are"} out of stock. `:""}
          ${lowParts.length?`${lowParts.length} part${lowParts.length===1?" has":"s have"} 3 or fewer left.`:""}
          <div style="margin-top:12px"><button class="mini" data-goto="parts">Review parts</button></div></div>`:""}
      </div>
    </div>`;
}

/* ---------- 26. SALES: ORDERS ---------- */

function admOrders(){
  const list = [...DB.orders.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return `${toolbar("Orders", `<button class="btn btn--sm btn--solid" id="q-sell">Sell a vehicle</button>`)}
    ${statGrid([
      ["All orders", list.length],
      ["Completed", list.filter(o=>o.status==="COMPLETED").length],
      ["Pending", list.filter(o=>o.status==="PENDING").length],
      ["Cancelled", list.filter(o=>o.status==="CANCELLED").length]
    ])}
    ${tbl(["Order","Customer","Vehicle","Total","Invoice","Status","Salesperson","Date",""],
      list.map(o=>{
        const inv = [...DB.invoices.values()].find(i=>i.orderId === o.id);
        return `<tr>
          <td style="color:var(--white)">${esc(o.no)}</td>
          <td>${esc(customerName(o.customerId))}</td>
          <td>${esc(o.vehicle||"—")}</td>
          <td class="num">${ksh(o.total)}</td>
          <td>${inv?`<button class="mini" data-inv="${esc(inv.id)}">${esc(inv.no)}</button>`:`<span class="muted">—</span>`}</td>
          <td><span class="pill ${o.status==="COMPLETED"?"pill--ok":o.status==="CANCELLED"?"":"pill--new"}">${esc(o.status)}</span></td>
          <td>${esc(o.salesperson||"—")}</td>
          <td class="muted" style="white-space:nowrap">${dateLabel(o.createdAt)}</td>
          <td><button class="mini" data-order="${esc(o.id)}">Details</button></td></tr>`;
      }), "No orders yet. Selling a vehicle creates the order, invoice and ledger entries together.")}`;
}

function orderDetail(id){
  const o = DB.orders.get(id); if(!o) return;
  const inv = [...DB.invoices.values()].find(i=>i.orderId === o.id);
  const pays = inv ? [...DB.payments.values()].filter(p=>p.invoiceId === inv.id) : [];
  const rcpts = [...DB.receipts.values()].filter(r=>r.orderId === o.id);
  const refs = inv ? [...DB.refunds.values()].filter(r=>r.invoiceId === inv.id) : [];
  const chain = [
    ["Customer", customerName(o.customerId)],
    ["Order", o.no],
    ["Invoice", inv ? inv.no : "not raised"],
    ["Payments", pays.length ? pays.map(p=>p.no).join(", ") : "none"],
    ["Receipts", rcpts.length ? rcpts.map(r=>r.no).join(", ") : "none"],
    ["Credit notes", refs.length ? refs.map(r=>r.no).join(", ") : "none"]
  ];
  openModal(`<div class="modal-head">
      <div><span class="tag">Order</span><h3 class="h-2" style="margin-top:10px">${esc(o.no)}</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="chain">${chain.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</div>
    <h4 class="adm-h" style="margin-top:26px">Items</h4>
    ${tbl(["Description","Qty","Unit price","Amount"],
      (o.items||[]).map(it=>`<tr><td>${esc(it.desc)}</td><td class="num">${it.qty}</td>
        <td class="num">${ksh(it.price)}</td><td class="num">${ksh(it.qty*it.price)}</td></tr>`))}
    <dl class="specs" style="grid-template-columns:1fr 1fr;margin-top:20px">
      <div class="spec"><dt>Subtotal</dt><dd class="num">${ksh(o.subtotal)}</dd></div>
      <div class="spec"><dt>Discount</dt><dd class="num">${ksh(o.discount)}</dd></div>
      <div class="spec"><dt>VAT</dt><dd class="num">${ksh(o.tax)}</dd></div>
      <div class="spec"><dt>Total</dt><dd class="num">${ksh(o.total)}</dd></div>
    </dl>
    <div class="btn-row" style="margin-top:22px">
      ${inv?`<button class="btn btn--sm btn--solid" data-inv="${esc(inv.id)}">Open invoice</button>`:""}
      <button class="btn btn--sm" onclick="closeModal()">Close</button>
    </div>`, true);
  $$("[data-inv]").forEach(b=>b.addEventListener("click", ()=>invoiceDetail(b.dataset.inv)));
}

/* ---------- 27. THE SELL FLOW ----------
   One action writes the whole chain: order → invoice → ledger, and
   takes the vehicle out of the published inventory.                  */

function sellForm(carId){
  const cars = DB.available();
  const parts = DB.activeParts();
  if(!cars.length && !parts.length) return toast("No vehicles or parts are available to sell.", true);
  CART_PARTS = [];
  const taxRate = Number(DB.s.vatRate || 16);
  openModal(`<div class="modal-head">
      <div><span class="tag">New sale</span><h3 class="h-2" style="margin-top:10px">Sell a vehicle and/or parts</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="sell-form" class="form-grid">
      ${selectField("sl-car","Vehicle", cars.map(c=>[c.id, `${c.year} Subaru ${c.model} ${c.variant||""} — ${ksh(c.price)}`]), carId||"", "No vehicle in this sale")}

      <div class="field full">
        <label>Add parts</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="sl-partpick" style="flex:2;min-width:200px">
            <option value="">Choose a part…</option>
            ${parts.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ${ksh(p.price)} (${p.stock} ${esc(p.unit||"")} in stock)</option>`).join("")}
          </select>
          <input id="sl-partqty" type="number" min="1" value="1" style="width:80px">
          <button type="button" class="mini" id="sl-addpart">Add to sale</button>
        </div>
        <div id="sl-cart" style="margin-top:12px"></div>
      </div>

      ${selectField("sl-cust","Customer", [...DB.customers.values()].map(c=>[c.id, `${c.name} · ${c.phone||""}`]), "", "New customer…")}
      <div class="field full" id="sl-new" style="display:none">
        <div class="form-grid" style="gap:12px">
          ${inputField("sl-name","Customer name","","text")}
          ${inputField("sl-phone","Phone","","tel")}
          ${inputField("sl-email","Email","","email")}
        </div>
      </div>
      ${inputField("sl-price","Vehicle price (KSh)","","number",'min="0" step="1000"')}
      ${inputField("sl-disc","Discount (KSh)","0","number",'min="0" step="500"')}
      ${inputField("sl-vat","VAT %",taxRate,"number",'min="0" max="30" step="0.5"')}
      ${selectField("sl-terms","Payment terms", ["Due on delivery","7 days","14 days","30 days","60 days"], "Due on delivery")}
      ${inputField("sl-due","Due date", dayKey(todayISO()), "date")}
      ${inputField("sl-sales","Salesperson", Auth.name, "text")}
      <div class="full totals" id="sl-totals"></div>
      <div class="full btn-row" style="justify-content:space-between">
        <button class="btn btn--solid" type="submit" id="sl-go">Create order and invoice</button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button>
      </div>
    </form>`, true);

  const carSel = $("#sl-car"), priceIn = $("#sl-price");

  const drawCart = () => {
    const box = $("#sl-cart"); if(!box) return;
    box.innerHTML = CART_PARTS.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>
      ${CART_PARTS.map((c,i)=>`<tr><td>${esc(c.name)}</td><td class="num">${c.qty} × ${ksh(c.price)}</td>
        <td class="num">${ksh(c.qty*c.price)}</td>
        <td><button type="button" class="mini mini--danger" data-cartrm="${i}">Remove</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted" style="font-size:.82rem;margin:0">No parts added.</p>`;
    $$("[data-cartrm]", box).forEach(b=>b.addEventListener("click", ()=>{
      CART_PARTS.splice(Number(b.dataset.cartrm),1); drawCart(); recalcSale();
    }));
  };
  const recalcSale = () => {
    const c = DB.car(carSel.value);
    const vehiclePrice = num("#sl-price");
    const partsSubtotal = CART_PARTS.reduce((s,i)=>s+i.qty*i.price,0);
    const subtotal = vehiclePrice + partsSubtotal;
    const disc = num("#sl-disc"), rate = num("#sl-vat");
    const net = Math.max(0, subtotal - disc), tax = net * rate/100, total = net + tax;
    const vCost = c ? carCost(c.id) : 0;
    const pCost = CART_PARTS.reduce((s,i)=>s+i.qty*partCost(i.partId),0);
    const totalCost = vCost + pCost;
    $("#sl-totals").innerHTML = `
      <div><span>Vehicle</span><b class="num">${ksh(vehiclePrice)}</b></div>
      <div><span>Parts (${CART_PARTS.length})</span><b class="num">${ksh(partsSubtotal)}</b></div>
      <div><span>Subtotal</span><b class="num">${ksh(subtotal)}</b></div>
      <div><span>Discount</span><b class="num">−${ksh(disc)}</b></div>
      <div><span>VAT ${rate}%</span><b class="num">${ksh(tax)}</b></div>
      <div class="grand"><span>Total</span><b class="num">${ksh(total)}</b></div>
      ${(vCost||pCost)?`<div class="muted-row"><span>Estimated margin</span><b class="num">${ksh(net - totalCost)}</b></div>`:
        `<div class="muted-row"><span>Margin</span><b class="muted">no cost recorded</b></div>`}`;
  };
  carSel.addEventListener("change", ()=>{
    const c = DB.car(carSel.value);
    if(c && !priceIn.dataset.touched) priceIn.value = c.price || "";
    if(!carSel.value && !priceIn.dataset.touched) priceIn.value = "";
    recalcSale();
  });
  priceIn.addEventListener("input", ()=>{ priceIn.dataset.touched = "1"; recalcSale(); });
  ["#sl-disc","#sl-vat"].forEach(s=>$(s).addEventListener("input", recalcSale));
  $("#sl-addpart").addEventListener("click", ()=>{
    const pid = val("#sl-partpick"); if(!pid) return;
    const p = DB.part(pid); if(!p) return;
    const qty = Math.max(1, num("#sl-partqty"));
    const already = CART_PARTS.find(c=>c.partId === pid);
    const existingQty = already ? already.qty : 0;
    if(qty + existingQty > (Number(p.stock)||0)) return toast(`Only ${p.stock} ${p.unit||"units"} of ${p.name} in stock.`, true);
    if(already) already.qty += qty; else CART_PARTS.push({partId:pid, qty, price:p.price, name:p.name});
    drawCart(); recalcSale();
  });
  $("#sl-cust").addEventListener("change", e=>{
    $("#sl-new").style.display = e.target.value ? "none" : "block";
  });
  $("#sl-new").style.display = "block";
  $("#sl-terms").addEventListener("change", e=>{
    const days = {"Due on delivery":0,"7 days":7,"14 days":14,"30 days":30,"60 days":60}[e.target.value] || 0;
    $("#sl-due").value = dayKey(new Date(Date.now() + days*86400000).toISOString());
  });
  drawCart(); recalcSale();

  $("#sell-form").addEventListener("submit", async e=>{
    e.preventDefault();
    if(!$("#sl-car").value && CART_PARTS.length === 0) return toast("Add a vehicle or at least one part.", true);
    const btn = $("#sl-go"); btn.disabled = true; btn.textContent = "Posting…";
    try{
      const car = $("#sl-car").value ? DB.car($("#sl-car").value) : null;
      if($("#sl-car").value && !car) throw new Error("That vehicle is no longer available.");
      for(const c of CART_PARTS){
        const p = DB.part(c.partId);
        if(!p || (Number(p.stock)||0) < c.qty) throw new Error(`Not enough stock of ${c.name}.`);
      }
      let custId = $("#sl-cust").value;
      if(!custId){
        const nm = val("#sl-name");
        if(!nm){ throw new Error("Enter the customer's name."); }
        custId = "cus-" + uid();
        await DB.put("customers", custId, {name:nm, phone:val("#sl-phone"), email:val("#sl-email"),
          address:"", creditLimit:0, createdAt:todayISO()});
        Audit.log("CREATE", "customer", custId, null, {name:nm}, "Created during a sale");
      }
      const vehiclePrice = num("#sl-price"), disc = num("#sl-disc"), rate = num("#sl-vat");
      const partsSubtotal = CART_PARTS.reduce((s,i)=>s+i.qty*i.price,0);
      const subtotal = vehiclePrice + partsSubtotal;
      const net = Math.max(0, subtotal - disc), tax = net * rate/100, total = net + tax;
      const vLabel = car ? `${car.year} Subaru ${car.model} ${car.variant||""}`.trim() : null;
      const partLines = CART_PARTS.map(c=>({partId:c.partId, qty:c.qty, price:c.price, name:c.name}));
      const items = [
        ...(car ? [{desc:`${vLabel} · ${km(car.mileage)}`, qty:1, price:vehiclePrice}] : []),
        ...partLines.map(c=>({desc:c.name, qty:c.qty, price:c.price}))
      ];

      const orderNo = await nextNo("order");
      const orderId = "ord-" + uid();
      await DB.put("orders", orderId, {no:orderNo, customerId:custId, carId:car?car.id:null, vehicle:vLabel||"",
        parts:partLines, items, subtotal, discount:disc, taxRate:rate, tax, total,
        status:"PENDING", salesperson:val("#sl-sales") || Auth.name, createdAt:todayISO()});

      const invNo = await nextNo("invoice");
      const invId = "inv-" + uid();
      await DB.put("invoices", invId, {no:invNo, orderId, customerId:custId, carId:car?car.id:null,
        parts:partLines, items, subtotal, discount:disc, taxRate:rate, tax, total, paid:0,
        issueDate:todayISO(), dueDate:new Date($("#sl-due").value || Date.now()).toISOString(),
        terms:val("#sl-terms"), status:"SENT", createdAt:todayISO(), by:Auth.name});

      // revenue splits proportionally between the vehicle and the parts on this invoice
      const vShare = subtotal > 0 ? vehiclePrice / subtotal : 0;
      const netVehicle = net * vShare, netParts = net - netVehicle;
      const lines = [{account:"1100", debit:total, credit:0}];
      if(netVehicle > 0.5) lines.push({account:"4000", debit:0, credit:netVehicle});
      if(netParts > 0.5) lines.push({account:"4010", debit:0, credit:netParts});
      if(tax > 0.5) lines.push({account:"2100", debit:0, credit:tax});
      await Ledger.post(`Invoice ${invNo}${vLabel?" — "+vLabel:""}`, invNo, lines);

      const vCost = car ? carCost(car.id) : 0;
      const pCost = CART_PARTS.reduce((s,i)=>s+i.qty*partCost(i.partId),0);
      if(vCost > 0) await Ledger.post(`Cost of vehicle sold ${invNo}`, invNo,
        [{account:"5000", debit:vCost, credit:0}, {account:"1200", debit:0, credit:vCost}]);
      if(pCost > 0) await Ledger.post(`Cost of parts sold ${invNo}`, invNo,
        [{account:"5010", debit:pCost, credit:0}, {account:"1210", debit:0, credit:pCost}]);

      if(car) await DB.patch("cars", car.id, {status:"SOLD", soldAt:todayISO(), featured:false});
      for(const c of CART_PARTS){
        const p = DB.part(c.partId);
        await DB.patch("parts", c.partId, {stock: Math.max(0, (Number(p.stock)||0) - c.qty)});
      }
      await DB.patch("orders", orderId, {status:"COMPLETED"});
      Audit.log("SALE", "invoice", invId, null, {no:invNo, total, vehicle:vLabel, parts:CART_PARTS.length}, "Sale completed");

      closeModal();
      toast(`${invNo} raised`);
      ADMIN_TAB = "invoices"; refreshAdmin();
      setTimeout(()=>invoiceDetail(invId), 200);
    }catch(err){
      btn.disabled = false; btn.textContent = "Create order and invoice";
      toast(err && err.message && err.message.length < 80 ? err.message : "The sale could not be posted.", true);
    }
  });
}

let CART_PARTS = [];

/* ---------- 28. INVOICES ---------- */

const carCost = carId => { const d = DB.carcost.get(carId); return d ? (Number(d.cost)||0) : 0; };

function admInvoices(){
  const list = [...DB.invoices.values()].sort((a,b)=>String(b.issueDate).localeCompare(String(a.issueDate)));
  const by = s => list.filter(i=>invoiceStatus(i) === s);
  const pillFor = s => s==="PAID"?"pill--ok":s==="OVERDUE"?"pill--bad":s==="PARTIAL"?"pill--new":"";
  return `${toolbar("Invoices", `<button class="btn btn--sm btn--solid" id="q-sell">New sale</button>`)}
    ${statGrid([
      ["All", list.length], ["Paid", by("PAID").length], ["Partially paid", by("PARTIAL").length],
      ["Overdue", by("OVERDUE").length], ["Outstanding", ksh(list.reduce((s,i)=>s+invoiceBalance(i),0))]
    ])}
    ${tbl(["Invoice","Customer","Issued","Due","Total","Paid","Balance","Status",""],
      list.map(i=>{
        const st = invoiceStatus(i);
        return `<tr>
          <td style="color:var(--white)">${esc(i.no)}</td>
          <td>${esc(customerName(i.customerId))}</td>
          <td class="muted" style="white-space:nowrap">${dateLabel(i.issueDate)}</td>
          <td class="muted" style="white-space:nowrap">${dateLabel(i.dueDate)}</td>
          <td class="num">${ksh(i.total)}</td>
          <td class="num">${ksh(i.paid)}</td>
          <td class="num">${ksh(invoiceBalance(i))}</td>
          <td><span class="pill ${pillFor(st)}">${st}</span></td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="mini" data-inv="${esc(i.id)}">Open</button>
            ${st!=="PAID"&&st!=="CANCELLED"?`<button class="mini" data-pay="${esc(i.id)}">Record payment</button>`:""}
          </div></td></tr>`;
      }), "No invoices yet. Sell a vehicle and the invoice is raised automatically.")}`;
}

function invoiceHTML(inv, forPrint){
  const s = DB.s, c = DB.customers.get(inv.customerId);
  const st = invoiceStatus(inv);
  const rows = (inv.items||[]).map(it=>`<tr>
    <td>${esc(it.desc)}</td><td class="num">${it.qty}</td>
    <td class="num">${ksh(it.price)}</td><td class="num">${ksh(it.qty*it.price)}</td></tr>`).join("");
  return `<div class="doc ${forPrint?"doc--print":""}">
    <div class="doc-head">
      <div><div class="doc-brand">${esc(s.dealership)}</div>
        <div class="doc-small">${esc(s.address)}<br>${esc(s.phone)} · ${esc(s.email)}
        ${s.pin?`<br>PIN: ${esc(s.pin)}`:""}</div></div>
      <div style="text-align:right">
        <div class="doc-type">Invoice</div>
        <div class="doc-no">${esc(inv.no)}</div>
        <div class="doc-small">Issued ${dateLabel(inv.issueDate)}<br>Due ${dateLabel(inv.dueDate)}</div>
      </div>
    </div>
    <div class="doc-to">
      <div class="doc-small">Billed to</div>
      <b>${esc(c ? c.name : "Walk-in customer")}</b>
      ${c && c.phone?`<div class="doc-small">${esc(c.phone)}</div>`:""}
      ${c && c.email?`<div class="doc-small">${esc(c.email)}</div>`:""}
      ${c && c.address?`<div class="doc-small">${esc(c.address)}</div>`:""}
    </div>
    <table class="doc-tbl">
      <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="doc-sum">
      <div><span>Subtotal</span><b class="num">${ksh(inv.subtotal)}</b></div>
      ${Number(inv.discount)>0?`<div><span>Discount</span><b class="num">−${ksh(inv.discount)}</b></div>`:""}
      <div><span>VAT ${inv.taxRate||0}%</span><b class="num">${ksh(inv.tax)}</b></div>
      <div class="grand"><span>Total</span><b class="num">${ksh(inv.total)}</b></div>
      <div><span>Paid</span><b class="num">${ksh(inv.paid)}</b></div>
      <div class="grand"><span>Balance</span><b class="num">${ksh(invoiceBalance(inv))}</b></div>
    </div>
    <div class="doc-foot">
      <div class="doc-stamp ${st==="PAID"?"ok":st==="OVERDUE"?"bad":""}">${st.replace("_"," ")}</div>
      <div class="doc-small">Payment terms: ${esc(inv.terms||"Due on delivery")}.
        ${esc(s.invoiceNote || "Thank you for your business.")}</div>
    </div>
  </div>`;
}

function invoiceDetail(id){
  const inv = DB.invoices.get(id); if(!inv) return;
  const st = invoiceStatus(inv);
  const pays = [...DB.payments.values()].filter(p=>p.invoiceId === id)
    .sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  const refs = [...DB.refunds.values()].filter(r=>r.invoiceId === id);
  openModal(`<div class="modal-head">
      <div><span class="tag">Invoice</span><h3 class="h-2" style="margin-top:10px">${esc(inv.no)}</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    ${invoiceHTML(inv)}
    ${pays.length?`<h4 class="adm-h" style="margin-top:26px">Payment history</h4>
      ${tbl(["Payment","Method","Reference","Amount","Receipt","Date"], pays.map(p=>{
        const r = [...DB.receipts.values()].find(x=>x.paymentId === p.id);
        return `<tr><td>${esc(p.no)}</td><td>${esc(p.method)}</td><td class="muted">${esc(p.reference||"—")}</td>
          <td class="num">${ksh(p.amount)}</td>
          <td>${r?`<button class="mini" data-rcpt="${esc(r.id)}">${esc(r.no)}</button>`:"—"}</td>
          <td class="muted">${dateLabel(p.createdAt)}</td></tr>`;
      }))}`:""}
    ${refs.length?`<h4 class="adm-h" style="margin-top:22px">Credit notes</h4>
      ${tbl(["Note","Amount","Reason","Date"], refs.map(r=>`<tr><td>${esc(r.no)}</td>
        <td class="num">${ksh(r.amount)}</td><td>${esc(r.reason)}</td>
        <td class="muted">${dateLabel(r.createdAt)}</td></tr>`))}`:""}
    <div class="btn-row" style="margin-top:24px">
      ${st!=="PAID"&&st!=="CANCELLED"?`<button class="btn btn--sm btn--solid" data-pay="${esc(inv.id)}">Record payment</button>`:""}
      <button class="btn btn--sm" id="inv-print">Print / save as PDF</button>
      <a class="btn btn--sm" href="${mailInvoice(inv)}">Email to customer</a>
      ${st!=="PAID"&&st!=="CANCELLED"?`<button class="mini mini--danger" data-cancel="${esc(inv.id)}">Cancel invoice</button>`:""}
      ${Number(inv.paid)>0?`<button class="mini" data-refund="${esc(inv.id)}">Refund / credit note</button>`:""}
    </div>`, true);

  $("#inv-print").addEventListener("click", ()=>printDoc(invoiceHTML(inv, true)));
  wireMoneyButtons();
}

function mailInvoice(inv){
  const c = DB.customers.get(inv.customerId);
  const body = `Dear ${c?c.name:"customer"},%0D%0A%0D%0APlease find invoice ${inv.no} for ${ksh(inv.total)}.`
    + `%0D%0ABalance due: ${ksh(invoiceBalance(inv))} by ${dateLabel(inv.dueDate)}.%0D%0A%0D%0A${DB.s.dealership}`;
  return `mailto:${c && c.email ? encodeURIComponent(c.email) : ""}?subject=${encodeURIComponent("Invoice " + inv.no)}&body=${body}`;
}

/* ---------- 29. PAYMENTS AND RECEIPTS ---------- */

const METHODS = [["CASH","Cash"],["MPESA","Mobile money (M-PESA)"],["CARD","Card"],["BANK","Bank transfer"]];

function paymentForm(invId){
  const inv = DB.invoices.get(invId); if(!inv) return;
  const bal = invoiceBalance(inv);
  const reg = openRegister();
  openModal(`<div class="modal-head">
      <div><span class="tag">Record payment</span>
        <h3 class="h-2" style="margin-top:10px">${esc(inv.no)}</h3>
        <div class="muted num" style="margin-top:6px">Balance ${ksh(bal)} · ${esc(customerName(inv.customerId))}</div></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="pay-form" class="form-grid">
      ${inputField("py-amt","Amount received (KSh)", bal, "number", 'min="1" step="100" required')}
      ${selectField("py-method","Method", METHODS, "CASH")}
      ${inputField("py-ref","Reference (M-PESA code, slip no.)","","text")}
      ${inputField("py-date","Date", dayKey(todayISO()), "date")}
      <div class="full totals" id="py-totals"></div>
      ${!reg?`<div class="full notice">No till is open, so a cash payment will not appear in the drawer count.
        Open the till from the dashboard first if you are taking cash.</div>`:""}
      <div class="full btn-row" style="justify-content:space-between">
        <button class="btn btn--solid" type="submit" id="py-go">Record payment and issue receipt</button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button>
      </div>
    </form>`, true);

  const recalc = () => {
    const amt = num("#py-amt");
    const applied = Math.min(amt, bal), change = Math.max(0, amt - bal);
    $("#py-totals").innerHTML = `
      <div><span>Balance before</span><b class="num">${ksh(bal)}</b></div>
      <div><span>Applied to invoice</span><b class="num">${ksh(applied)}</b></div>
      ${change>0?`<div><span>Change due</span><b class="num">${ksh(change)}</b></div>`:""}
      <div class="grand"><span>Balance after</span><b class="num">${ksh(bal - applied)}</b></div>`;
  };
  $("#py-amt").addEventListener("input", recalc); recalc();

  $("#pay-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const btn = $("#py-go"); btn.disabled = true; btn.textContent = "Posting…";
    try{
      const amt = num("#py-amt");
      if(amt <= 0) throw new Error("Enter an amount greater than zero.");
      const applied = Math.min(amt, bal), change = Math.max(0, amt - bal);
      const method = val("#py-method");
      const when = new Date(val("#py-date") || Date.now()).toISOString();

      const payNo = await nextNo("payment"), payId = "pay-" + uid();
      await DB.put("payments", payId, {no:payNo, invoiceId:inv.id, orderId:inv.orderId,
        customerId:inv.customerId, amount:applied, tendered:amt, change, method,
        reference:val("#py-ref"), registerId:reg?reg.id:null,
        createdAt:when, by:Auth.name, status:"COMPLETED"});

      const rcNo = await nextNo("receipt"), rcId = "rc-" + uid();
      await DB.put("receipts", rcId, {no:rcNo, paymentId:payId, invoiceId:inv.id, orderId:inv.orderId,
        customerId:inv.customerId, items:inv.items, subtotal:inv.subtotal, discount:inv.discount,
        tax:inv.tax, total:inv.total, paid:amt, applied, change, method,
        cashier:Auth.name, createdAt:when});

      const paidNow = (Number(inv.paid)||0) + applied;
      await DB.patch("invoices", inv.id, {paid:paidNow,
        status: paidNow >= (Number(inv.total)||0) - 0.5 ? "PAID" : "PARTIAL"});

      await Ledger.post(`Payment ${payNo} against ${inv.no}`, payNo, [
        {account:PAY_ACCOUNT[method] || "1000", debit:applied, credit:0},
        {account:"1100", debit:0, credit:applied}
      ]);
      Audit.log("PAYMENT", "invoice", inv.id, {paid:inv.paid}, {paid:paidNow}, method);

      closeModal();
      toast(`${ksh(applied)} received · receipt ${rcNo}`);
      refreshAdmin();
      setTimeout(()=>receiptDetail(rcId), 200);
    }catch(err){
      btn.disabled = false; btn.textContent = "Record payment and issue receipt";
      toast(err && err.message && err.message.length < 60 ? err.message : "The payment could not be posted.", true);
    }
  });
}

function receiptHTML(r, forPrint){
  const s = DB.s;
  const rows = (r.items||[]).map(it=>
    `<tr><td>${esc(it.desc)}</td><td class="num">${it.qty}</td><td class="num">${ksh(it.qty*it.price)}</td></tr>`).join("");
  return `<div class="till ${forPrint?"till--print":""}">
    <div class="till-head">
      <b>${esc(s.dealership).toUpperCase()}</b>
      <span>${esc(s.address)}</span><span>Tel: ${esc(s.phone)}</span>
      ${s.pin?`<span>PIN: ${esc(s.pin)}</span>`:""}
    </div>
    <div class="till-type">RECEIPT</div>
    <div class="till-no">${esc(r.no)}</div>
    <div class="till-rule"></div>
    <table class="till-tbl"><tbody>${rows}</tbody></table>
    <div class="till-rule"></div>
    <div class="till-row"><span>Subtotal</span><b>${ksh(r.subtotal)}</b></div>
    ${Number(r.discount)>0?`<div class="till-row"><span>Discount</span><b>−${ksh(r.discount)}</b></div>`:""}
    <div class="till-row"><span>VAT</span><b>${ksh(r.tax)}</b></div>
    <div class="till-row till-big"><span>TOTAL</span><b>${ksh(r.total)}</b></div>
    <div class="till-rule"></div>
    <div class="till-row"><span>Paid</span><b>${ksh(r.paid)}</b></div>
    ${Number(r.change)>0?`<div class="till-row"><span>Change</span><b>${ksh(r.change)}</b></div>`:""}
    <div class="till-row"><span>Payment</span><b>${esc(r.method === "MPESA" ? "M-PESA" : r.method)}</b></div>
    <div class="till-row"><span>Cashier</span><b>${esc(r.cashier)}</b></div>
    <div class="till-rule"></div>
    <div class="till-foot">${dateLabel(r.createdAt)} ${new Date(r.createdAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}
      <br>${esc(s.receiptNote || "Thank you for shopping with us.")}</div>
  </div>`;
}

function receiptDetail(id){
  const r = DB.receipts.get(id); if(!r) return;
  openModal(`<div class="modal-head">
      <div><span class="tag">Receipt</span><h3 class="h-2" style="margin-top:10px">${esc(r.no)}</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    ${receiptHTML(r)}
    <div class="btn-row" style="margin-top:22px">
      <button class="btn btn--sm btn--solid" id="rc-print">Print receipt</button>
      <button class="btn btn--sm" id="rc-invoice">Open invoice</button>
    </div>`);
  $("#rc-print").addEventListener("click", ()=>printDoc(receiptHTML(r, true), true));
  $("#rc-invoice").addEventListener("click", ()=>invoiceDetail(r.invoiceId));
}

function admReceipts(){
  const list = [...DB.receipts.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return `${toolbar("Receipts")}
    ${tbl(["Receipt","Invoice","Customer","Total","Paid","Change","Method","Cashier","Date",""],
      list.map(r=>`<tr>
        <td style="color:var(--white)">${esc(r.no)}</td>
        <td>${esc((DB.invoices.get(r.invoiceId)||{}).no || "—")}</td>
        <td>${esc(customerName(r.customerId))}</td>
        <td class="num">${ksh(r.total)}</td><td class="num">${ksh(r.paid)}</td>
        <td class="num">${ksh(r.change)}</td><td>${esc(r.method)}</td><td>${esc(r.cashier)}</td>
        <td class="muted" style="white-space:nowrap">${dateLabel(r.createdAt)}</td>
        <td><button class="mini" data-rcpt="${esc(r.id)}">Reprint</button></td></tr>`),
      "Receipts appear here as soon as a payment is recorded.")}`;
}

function admPayments(){
  const list = [...DB.payments.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const total = list.reduce((s,p)=>s+(Number(p.amount)||0),0);
  return `${toolbar("Payments")}
    ${statGrid(METHODS.map(([k,l])=>[l, ksh(list.filter(p=>p.method===k).reduce((s,p)=>s+(Number(p.amount)||0),0))])
      .concat([["Total received", ksh(total)]]))}
    ${tbl(["Payment","Invoice","Customer","Amount","Method","Reference","Till","Received by","Date"],
      list.map(p=>`<tr>
        <td style="color:var(--white)">${esc(p.no)}</td>
        <td><button class="mini" data-inv="${esc(p.invoiceId)}">${esc((DB.invoices.get(p.invoiceId)||{}).no||"—")}</button></td>
        <td>${esc(customerName(p.customerId))}</td>
        <td class="num">${ksh(p.amount)}</td><td>${esc(p.method)}</td>
        <td class="muted">${esc(p.reference||"—")}</td>
        <td class="muted">${esc((DB.registers.get(p.registerId)||{}).no || "—")}</td>
        <td>${esc(p.by||"—")}</td>
        <td class="muted" style="white-space:nowrap">${dateLabel(p.createdAt)}</td></tr>`),
      "No payments recorded yet.")}`;
}

/* ---------- 30. REFUNDS AND CREDIT NOTES ----------
   A paid invoice is never edited. It is credited, and the credit is
   its own document.                                                  */

function refundForm(invId){
  const inv = DB.invoices.get(invId); if(!inv) return;
  const maxAmt = Number(inv.paid)||0;
  const reg = openRegister();
  openModal(`<div class="modal-head">
      <div><span class="tag">Credit note</span><h3 class="h-2" style="margin-top:10px">Refund against ${esc(inv.no)}</h3>
      <div class="muted num" style="margin-top:6px">Paid to date ${ksh(maxAmt)}</div></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="ref-form" class="form-grid">
      ${inputField("rf-amt","Refund amount (KSh)", maxAmt, "number", `min="1" max="${maxAmt}" step="100" required`)}
      ${selectField("rf-method","Refund method", METHODS, "CASH")}
      ${selectField("rf-reason","Reason", ["Sale cancelled","Vehicle returned","Overpayment","Price correction","Damaged on delivery","Other"], "Sale cancelled")}
      <div class="field full"><label for="rf-note">Note</label><textarea id="rf-note" style="min-height:80px"></textarea></div>
      <label class="tick full"><input type="checkbox" id="rf-restock" checked> Return items to stock (vehicle and any parts on this invoice)</label>
      <div class="full notice">The original invoice stays exactly as it was. This raises a separate credit
        note and posts the reversal, so the audit trail survives.</div>
      <div class="full btn-row" style="justify-content:space-between">
        <button class="btn btn--solid" type="submit" id="rf-go">Issue credit note</button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button>
      </div>
    </form>`, true);

  $("#ref-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const btn = $("#rf-go"); btn.disabled = true; btn.textContent = "Posting…";
    try{
      const amt = Math.min(num("#rf-amt"), maxAmt);
      if(amt <= 0) throw new Error("Enter an amount greater than zero.");
      const method = val("#rf-method");
      const no = await nextNo("refund"), id = "ref-" + uid();
      const net = amt / (1 + (Number(inv.taxRate)||0)/100), tax = amt - net;

      await DB.put("refunds", id, {no, invoiceId:inv.id, orderId:inv.orderId, customerId:inv.customerId,
        carId:inv.carId, amount:amt, method, reason:val("#rf-reason"), note:val("#rf-note"),
        registerId:reg?reg.id:null, createdAt:todayISO(), by:Auth.name});

      await DB.patch("invoices", inv.id, {paid:Math.max(0, (Number(inv.paid)||0) - amt), credited:true});

      const lines = [{account:"4100", debit:net, credit:0}];
      if(tax > 0.5) lines.push({account:"2100", debit:tax, credit:0});
      lines.push({account:PAY_ACCOUNT[method] || "1000", debit:0, credit:amt});
      await Ledger.post(`Credit note ${no} against ${inv.no}`, no, lines);

      if($("#rf-restock").checked && inv.carId && DB.car(inv.carId)){
        await DB.patch("cars", inv.carId, {status:"AVAILABLE", soldAt:null});
        const cost = carCost(inv.carId);
        if(cost > 0) await Ledger.post(`Vehicle returned to stock — ${no}`, no,
          [{account:"1200", debit:cost, credit:0}, {account:"5000", debit:0, credit:cost}]);
      }
      if($("#rf-restock").checked && inv.parts && inv.parts.length){
        let pCostTotal = 0;
        for(const line of inv.parts){
          const p = DB.part(line.partId);
          if(p){
            await DB.patch("parts", line.partId, {stock:(Number(p.stock)||0) + line.qty});
            pCostTotal += partCost(line.partId) * line.qty;
          }
        }
        if(pCostTotal > 0) await Ledger.post(`Parts returned to stock — ${no}`, no,
          [{account:"1210", debit:pCostTotal, credit:0}, {account:"5010", debit:0, credit:pCostTotal}]);
      }
      Audit.log("REFUND", "invoice", inv.id, {paid:inv.paid}, {refunded:amt}, val("#rf-reason"));
      closeModal(); toast(`Credit note ${no} issued`); refreshAdmin();
    }catch(err){
      btn.disabled = false; btn.textContent = "Issue credit note";
      toast(err && err.message && err.message.length < 60 ? err.message : "The credit note could not be posted.", true);
    }
  });
}

function admRefunds(){
  const list = [...DB.refunds.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return `${toolbar("Refunds and credit notes")}
    ${statGrid([["Credit notes", list.length],
      ["Total refunded", ksh(list.reduce((s,r)=>s+(Number(r.amount)||0),0))]])}
    ${tbl(["Note","Invoice","Customer","Amount","Method","Reason","Issued by","Date"],
      list.map(r=>`<tr>
        <td style="color:var(--white)">${esc(r.no)}</td>
        <td><button class="mini" data-inv="${esc(r.invoiceId)}">${esc((DB.invoices.get(r.invoiceId)||{}).no||"—")}</button></td>
        <td>${esc(customerName(r.customerId))}</td>
        <td class="num">${ksh(r.amount)}</td><td>${esc(r.method)}</td>
        <td>${esc(r.reason)}</td><td>${esc(r.by||"—")}</td>
        <td class="muted" style="white-space:nowrap">${dateLabel(r.createdAt)}</td></tr>`),
      "No refunds have been issued.")}`;
}

/* ---------- 31. CUSTOMERS ---------- */

function customerStats(id){
  const invs = [...DB.invoices.values()].filter(i=>i.customerId === id && i.status !== "CANCELLED");
  const invoiced = invs.reduce((s,i)=>s+(Number(i.total)||0),0);
  const paid = invs.reduce((s,i)=>s+(Number(i.paid)||0),0);
  const refunded = [...DB.refunds.values()].filter(r=>r.customerId === id).reduce((s,r)=>s+(Number(r.amount)||0),0);
  return {invs, invoiced, paid, balance:Math.max(0, invoiced - paid), refunded};
}

function admCustomers(){
  const list = [...DB.customers.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const debt = list.reduce((s,c)=>s + customerStats(c.id).balance, 0);
  return `${toolbar("Customers", `<button class="btn btn--sm btn--solid" id="q-customer">Add customer</button>`)}
    ${statGrid([["Customers", list.length], ["Owed to us", ksh(debt)],
      ["Over credit limit", list.filter(c=>c.creditLimit && customerStats(c.id).balance > c.creditLimit).length]])}
    ${tbl(["Customer","Phone","Email","Invoices","Total purchases","Paid","Balance",""],
      list.map(c=>{
        const st = customerStats(c.id);
        const over = c.creditLimit && st.balance > c.creditLimit;
        return `<tr>
          <td style="color:var(--white)">${esc(c.name)}</td>
          <td>${esc(c.phone||"—")}</td><td class="muted">${esc(c.email||"—")}</td>
          <td class="num">${st.invs.length}</td>
          <td class="num">${ksh(st.invoiced)}</td><td class="num">${ksh(st.paid)}</td>
          <td class="num ${over?"bad":""}">${ksh(st.balance)}${over?` <span class="pill pill--bad">over limit</span>`:""}</td>
          <td><div style="display:flex;gap:6px">
            <button class="mini" data-cust="${esc(c.id)}">History</button>
            <button class="mini" data-custedit="${esc(c.id)}">Edit</button></div></td></tr>`;
      }), "No customers yet. One is created the first time you sell a vehicle.")}`;
}

function customerDetail(id){
  const c = DB.customers.get(id); if(!c) return;
  const st = customerStats(id);
  const pays = [...DB.payments.values()].filter(p=>p.customerId === id);
  openModal(`<div class="modal-head">
      <div><span class="tag">Customer</span><h3 class="h-2" style="margin-top:10px">${esc(c.name)}</h3>
        <div class="muted" style="margin-top:6px">${esc(c.phone||"")} ${c.email?" · "+esc(c.email):""}</div></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    ${statGrid([["Total purchases", ksh(st.invoiced)], ["Paid", ksh(st.paid)],
      ["Outstanding", ksh(st.balance)], ["Refunded", ksh(st.refunded)],
      ["Credit limit", c.creditLimit ? ksh(c.creditLimit) : "none"]])}
    <h4 class="adm-h" style="margin-top:24px">Invoices</h4>
    ${tbl(["Invoice","Vehicle","Total","Paid","Balance","Status",""], st.invs.map(i=>`<tr>
      <td>${esc(i.no)}</td><td>${esc((i.items||[{}])[0].desc||"—")}</td>
      <td class="num">${ksh(i.total)}</td><td class="num">${ksh(i.paid)}</td>
      <td class="num">${ksh(invoiceBalance(i))}</td>
      <td><span class="pill">${invoiceStatus(i)}</span></td>
      <td><button class="mini" data-inv="${esc(i.id)}">Open</button></td></tr>`), "No invoices.")}
    <h4 class="adm-h" style="margin-top:22px">Payment history</h4>
    ${tbl(["Payment","Amount","Method","Date"], pays.map(p=>`<tr><td>${esc(p.no)}</td>
      <td class="num">${ksh(p.amount)}</td><td>${esc(p.method)}</td>
      <td class="muted">${dateLabel(p.createdAt)}</td></tr>`), "No payments.")}`, true);
  wireMoneyButtons();
}

function customerForm(id){
  const c = id ? DB.customers.get(id) : null;
  const v = Object.assign({name:"",phone:"",email:"",address:"",creditLimit:0}, c||{});
  openModal(`<div class="modal-head">
      <div><span class="tag">${c?"Edit customer":"New customer"}</span>
        <h3 class="h-2" style="margin-top:10px">${c?esc(v.name):"Add a customer"}</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="cust-form" class="form-grid">
      ${inputField("cu-name","Name", v.name, "text", "required")}
      ${inputField("cu-phone","Phone", v.phone, "tel")}
      ${inputField("cu-email","Email", v.email, "email")}
      ${inputField("cu-addr","Address", v.address, "text")}
      ${inputField("cu-limit","Credit limit (KSh)", v.creditLimit, "number", 'min="0" step="10000"')}
      <div class="full btn-row" style="justify-content:space-between">
        <button class="btn btn--solid" type="submit">${c?"Save changes":"Add customer"}</button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button></div>
    </form>`);
  $("#cust-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const data = {name:val("#cu-name"), phone:val("#cu-phone"), email:val("#cu-email"),
      address:val("#cu-addr"), creditLimit:num("#cu-limit"), createdAt:(c&&c.createdAt)||todayISO()};
    await DB.put("customers", id || "cus-" + uid(), data);
    Audit.log(c?"UPDATE":"CREATE", "customer", id||data.name, c||null, data, "");
    closeModal(); toast(c?"Customer saved":"Customer added"); refreshAdmin();
  });
}

/* ---------- 32. TILL ---------- */

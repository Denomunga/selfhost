"use strict";
/* Admin: chart of accounts, ledger, receivable/payable, financial reports, audit log. */

function admAccounts(){
  const groups = ["Asset","Liability","Income","Expense"];
  return `${toolbar("Chart of accounts")}
    <p class="lede" style="max-width:62ch;margin-bottom:24px">Every sale, payment, expense and purchase posts
      a balanced entry against these accounts. The reports read the ledger, not the documents.</p>
    ${groups.map(g=>`<h4 class="adm-h">${g}s</h4>
      ${tbl(["Code","Account","Balance"], ACCOUNTS.filter(a=>a.type===g).map(a=>{
        const b = Ledger.balance(a.code);
        const shown = (g === "Income" || g === "Liability") ? -b : b;
        return `<tr><td class="num">${a.code}</td><td style="color:var(--white)">${esc(a.name)}</td>
          <td class="num">${ksh(Math.abs(shown))}${shown<0?" (cr)":""}</td></tr>`;
      }))}<div style="height:22px"></div>`).join("")}`;
}

function admJournal(){
  const list = [...DB.journal.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const rows = [];
  list.forEach(j=>{
    (j.lines||[]).forEach((l,i)=>{
      rows.push(`<tr>
        <td>${i===0?esc(j.no):""}</td>
        <td>${i===0?esc(j.memo):""}</td>
        <td class="num">${l.account} · ${esc(accountName(l.account))}</td>
        <td class="num">${Number(l.debit)?ksh(l.debit):""}</td>
        <td class="num">${Number(l.credit)?ksh(l.credit):""}</td>
        <td class="muted" style="white-space:nowrap">${i===0?dateLabel(j.date):""}</td></tr>`);
    });
  });
  const dr = list.reduce((s,j)=>s+(Number(j.debit)||0),0);
  const cr = list.reduce((s,j)=>s+(Number(j.credit)||0),0);
  return `${toolbar("General ledger")}
    ${statGrid([["Entries", list.length], ["Total debits", ksh(dr)], ["Total credits", ksh(cr)],
      ["Balanced", Math.abs(dr-cr) < 1 ? "Yes" : "No"]])}
    ${tbl(["Entry","Memo","Account","Debit","Credit","Date"], rows, "Nothing has been posted yet.")}`;
}

function admReceivable(){
  const list = [...DB.invoices.values()].filter(i=>invoiceBalance(i) > 0.5 && i.status !== "CANCELLED");
  const bucket = i => {
    const days = Math.floor((Date.now() - new Date(i.dueDate).getTime())/86400000);
    return days <= 0 ? "Not due" : days <= 30 ? "1–30 days" : days <= 60 ? "31–60 days" : "60+ days";
  };
  const buckets = ["Not due","1–30 days","31–60 days","60+ days"];
  return `${toolbar("Accounts receivable")}
    ${statGrid(buckets.map(b=>[b, ksh(list.filter(i=>bucket(i)===b).reduce((s,i)=>s+invoiceBalance(i),0))])
      .concat([["Total owed", ksh(list.reduce((s,i)=>s+invoiceBalance(i),0))]]))}
    ${tbl(["Invoice","Customer","Due","Age","Balance",""], list
      .sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)))
      .map(i=>`<tr><td>${esc(i.no)}</td><td>${esc(customerName(i.customerId))}</td>
        <td class="muted">${dateLabel(i.dueDate)}</td>
        <td><span class="pill ${bucket(i)==="60+ days"?"pill--bad":bucket(i)==="Not due"?"pill--ok":""}">${bucket(i)}</span></td>
        <td class="num">${ksh(invoiceBalance(i))}</td>
        <td><button class="mini" data-pay="${esc(i.id)}">Record payment</button></td></tr>`),
      "Nothing is owed to you.")}`;
}

function admPayable(){
  const list = [...DB.purchases.values()].filter(p=>(Number(p.cost)||0) - (Number(p.paid)||0) > 0.5);
  return `${toolbar("Accounts payable")}
    ${statGrid([["Open purchases", list.length],
      ["Owed to suppliers", ksh(list.reduce((s,p)=>s+((Number(p.cost)||0)-(Number(p.paid)||0)),0))]])}
    ${tbl(["Purchase","Supplier","Vehicle","Cost","Paid","Balance",""], list.map(p=>`<tr>
      <td>${esc(p.no)}</td><td>${esc(supplierName(p.supplierId))}</td><td>${esc(p.vehicle||"—")}</td>
      <td class="num">${ksh(p.cost)}</td><td class="num">${ksh(p.paid)}</td>
      <td class="num">${ksh((Number(p.cost)||0)-(Number(p.paid)||0))}</td>
      <td><button class="mini" data-paysup="${esc(p.id)}">Pay</button></td></tr>`),
      "You owe nothing.")}`;
}

/* ---------- 36. REPORTS ---------- */

let REPORT_RANGE = "month";
function rangeBounds(key){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const map = {
    today: [start, now],
    yesterday: [new Date(start.getTime()-86400000), start],
    week: [new Date(start.getTime()-6*86400000), now],
    month: [new Date(now.getFullYear(), now.getMonth(), 1), now],
    year: [new Date(now.getFullYear(), 0, 1), now],
    all: [new Date(2000,0,1), now]
  };
  const [a,b] = map[key] || map.month;
  return [a.toISOString(), b.toISOString()];
}

function admReports(){
  const [from, to] = rangeBounds(REPORT_RANGE);
  const invs = [...DB.invoices.values()].filter(i=>i.status!=="CANCELLED" && i.issueDate>=from && i.issueDate<=to);
  const pays = [...DB.payments.values()].filter(p=>p.createdAt>=from && p.createdAt<=to);
  const exps = [...DB.expenses.values()].filter(x=>x.date>=from && x.date<=to);
  const refs = [...DB.refunds.values()].filter(r=>r.createdAt>=from && r.createdAt<=to);

  const revenue = Ledger.totalBy("Income", from, to);
  const cogs = Ledger.balance("5000", from, to) + Ledger.balance("5010", from, to);
  const opex = Ledger.totalBy("Expense", from, to) - cogs;
  const net = revenue - cogs - opex;
  const vat = -Ledger.balance("2100", from, to);

  const profitRows = DB.sold().map(c=>{
    const inv = [...DB.invoices.values()].find(i=>i.carId === c.id);
    if(!inv || inv.issueDate < from || inv.issueDate > to) return null;
    const netSale = (Number(inv.total)||0) - (Number(inv.tax)||0);
    const cost = carCost(c.id);
    return {label:`${c.year} ${c.model} ${c.variant||""}`, sale:netSale, cost, margin:netSale-cost, inv};
  }).filter(Boolean);

  const partSales = {};
  invs.forEach(i => (i.parts||[]).forEach(line => {
    const k = line.partId;
    if(!partSales[k]) partSales[k] = {name:line.name, qty:0, revenue:0, cost:0};
    partSales[k].qty += line.qty;
    partSales[k].revenue += line.qty * line.price;
    partSales[k].cost += line.qty * partCost(line.partId);
  }));
  const partRows = Object.values(partSales).sort((a,b)=>b.revenue-a.revenue);

  const sellers = {};
  invs.forEach(i=>{
    const o = DB.orders.get(i.orderId);
    const who = (o && o.salesperson) || i.by || "—";
    sellers[who] = (sellers[who]||0) + (Number(i.total)||0);
  });

  const ranges = [["today","Today"],["yesterday","Yesterday"],["week","This week"],
                  ["month","This month"],["year","This year"],["all","All time"]];

  return `${toolbar("Financial reports",
    `<button class="btn btn--sm" id="rp-print">Print / save as PDF</button>
     <button class="btn btn--sm" id="rp-csv">Export CSV</button>`,
    `<div class="chip-row" style="margin-right:8px">${ranges.map(([k,l])=>
      `<button class="chip ${REPORT_RANGE===k?"on":""}" data-range="${k}">${l}</button>`).join("")}</div>`)}

    <div id="report-area">
    ${statGrid([
      ["Revenue", ksh(revenue)], ["Cost of goods sold", ksh(cogs)],
      ["Gross profit", ksh(revenue-cogs)], ["Operating expenses", ksh(opex)],
      ["Net profit", ksh(net)], ["VAT collected", ksh(vat)],
      ["Cash received", ksh(pays.reduce((s,p)=>s+(Number(p.amount)||0),0))],
      ["Refunds", ksh(refs.reduce((s,r)=>s+(Number(r.amount)||0),0))]
    ])}

    <div class="adm-split">
      <div>
        <h4 class="adm-h">Profit and loss</h4>
        ${tbl(["Line","Amount"], [
          `<tr><td>Sales (vehicles and parts)</td><td class="num">${ksh(revenue)}</td></tr>`,
          `<tr><td>Less cost of goods sold</td><td class="num">−${ksh(cogs)}</td></tr>`,
          `<tr class="strong"><td>Gross profit</td><td class="num">${ksh(revenue-cogs)}</td></tr>`,
          ...ACCOUNTS.filter(a=>a.type==="Expense" && a.code!=="5000" && a.code!=="5010").map(a=>{
            const v = Ledger.balance(a.code, from, to);
            return v ? `<tr><td>${esc(a.name)}</td><td class="num">−${ksh(v)}</td></tr>` : "";
          }).filter(Boolean),
          `<tr class="strong"><td>Net profit</td><td class="num">${ksh(net)}</td></tr>`
        ])}

        <h4 class="adm-h" style="margin-top:28px">Profit by vehicle</h4>
        ${tbl(["Vehicle","Sale (ex VAT)","Cost","Margin","%"], profitRows.map(r=>`<tr>
          <td>${esc(r.label)}</td><td class="num">${ksh(r.sale)}</td>
          <td class="num">${r.cost?ksh(r.cost):"<span class='muted'>not recorded</span>"}</td>
          <td class="num ${r.margin<0?"bad":"good"}">${r.cost?ksh(r.margin):"—"}</td>
          <td class="num">${r.cost&&r.sale?((r.margin/r.sale)*100).toFixed(1)+"%":"—"}</td></tr>`),
          "No vehicles sold in this period.")}

        <h4 class="adm-h" style="margin-top:28px">Parts sold</h4>
        ${tbl(["Part","Units","Revenue","Cost","Margin"], partRows.map(r=>`<tr>
          <td>${esc(r.name)}</td><td class="num">${r.qty}</td><td class="num">${ksh(r.revenue)}</td>
          <td class="num">${r.cost?ksh(r.cost):"—"}</td>
          <td class="num ${r.cost&&(r.revenue-r.cost)<0?"bad":"good"}">${r.cost?ksh(r.revenue-r.cost):"—"}</td></tr>`),
          "No parts sold in this period.")}
      </div>
      <div>
        <h4 class="adm-h">Payment methods</h4>
        ${tbl(["Method","Received"], METHODS.map(([k,l])=>`<tr><td>${esc(l)}</td>
          <td class="num">${ksh(pays.filter(p=>p.method===k).reduce((s,p)=>s+(Number(p.amount)||0),0))}</td></tr>`))}

        <h4 class="adm-h" style="margin-top:28px">Expenses by category</h4>
        ${tbl(["Category","Amount"], EXPENSE_CATS.map(c=>{
          const v = exps.filter(x=>x.category===c).reduce((s,x)=>s+(Number(x.amount)||0),0);
          return v ? `<tr><td>${esc(c)}</td><td class="num">${ksh(v)}</td></tr>` : "";
        }).filter(Boolean), "No expenses in this period.")}

        <h4 class="adm-h" style="margin-top:28px">Salesperson performance</h4>
        ${tbl(["Salesperson","Invoiced"], Object.entries(sellers).sort((a,b)=>b[1]-a[1])
          .map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${ksh(v)}</td></tr>`), "No sales in this period.")}

        <h4 class="adm-h" style="margin-top:28px">Cash flow</h4>
        ${tbl(["Movement","Amount"], [
          `<tr><td>Received from customers</td><td class="num">${ksh(pays.reduce((s,p)=>s+(Number(p.amount)||0),0))}</td></tr>`,
          `<tr><td>Paid for expenses</td><td class="num">−${ksh(exps.reduce((s,x)=>s+(Number(x.amount)||0),0))}</td></tr>`,
          `<tr><td>Refunded to customers</td><td class="num">−${ksh(refs.reduce((s,r)=>s+(Number(r.amount)||0),0))}</td></tr>`,
          `<tr class="strong"><td>Net movement</td><td class="num">${ksh(
            pays.reduce((s,p)=>s+(Number(p.amount)||0),0)
            - exps.reduce((s,x)=>s+(Number(x.amount)||0),0)
            - refs.reduce((s,r)=>s+(Number(r.amount)||0),0))}</td></tr>`
        ])}
      </div>
    </div></div>`;
}

/* ---------- 37. AUDIT ---------- */

function admAudit(){
  const list = [...DB.audit.values()].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,300);
  return `${toolbar("Audit log")}
    <p class="lede" style="max-width:64ch;margin-bottom:22px">Who did what, and what the value was before and after.
      Financial records are voided rather than deleted, so this trail stays intact.</p>
    ${tbl(["When","Who","Action","Record","Before","After","Reason"], list.map(a=>`<tr>
      <td class="muted" style="white-space:nowrap">${dateLabel(a.at)}
        ${new Date(a.at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</td>
      <td style="color:var(--white)">${esc(a.who)}</td>
      <td><span class="pill ${/FAIL/.test(a.action)?"pill--bad":""}">${esc(a.action)}</span></td>
      <td class="muted">${esc(a.entity)} ${esc(String(a.entityId||"").slice(0,12))}</td>
      <td class="muted mono">${esc(String(a.before||"—").slice(0,90))}</td>
      <td class="muted mono">${esc(String(a.after||"—").slice(0,90))}</td>
      <td>${esc(a.reason||"—")}</td></tr>`), "Nothing has been logged yet.")}`;
}

/* ---------- 38. USERS ---------- */

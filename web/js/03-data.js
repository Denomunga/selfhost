"use strict";
/* Data layer — API client, the DB store, and site-setting defaults. */
/* API_BASE comes from js/api-config.js, which loads first. */

async function api(path, opts){
  opts = opts || {};
  const res = await fetch(API_BASE + path, {
    method: opts.method || "GET",
    credentials: "include",
    headers: opts.body !== undefined ? {"Content-Type":"application/json"} : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  if(!res.ok){
    let msg = res.statusText, code;
    try{ const j = await res.json(); msg = j.error || msg; code = j.code; }catch(e){}
    const err = new Error(msg); err.status = res.status; err.code = code || ("http_"+res.status);
    throw err;
  }
  if(res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Every collection the server exposes; DB keeps one Map per name. */
const COLLECTIONS = ["cars","parts","stories","inquiries","customers","suppliers","orders","invoices",
  "receipts","payments","refunds","expenses","purchases","registers","cashmoves","journal",
  "audit","users","carcost","partcost"];

const DB = {
  mode:"server",
  canEdit:false, canWrite:true, uid:null, role:null, assets:true,
  cars:new Map(), parts:new Map(), stories:new Map(), inquiries:new Map(),
  customers:new Map(), suppliers:new Map(), orders:new Map(), invoices:new Map(),
  receipts:new Map(), payments:new Map(), refunds:new Map(), expenses:new Map(),
  purchases:new Map(), registers:new Map(), cashmoves:new Map(), journal:new Map(),
  audit:new Map(), users:new Map(), carcost:new Map(), partcost:new Map(),
  settings:null, listeners:[], ready:false, pollTimer:null, visibilityBound:false,
  es:null, live:false, lastRefreshAt:0, changeTimer:null,

  onChange(fn){ this.listeners.push(fn); },
  emit(){ this.listeners.forEach(f=>{ try{ f(); }catch(e){ console.error(e); } }); },

  async init(){
    await Auth.restore();
    if(Auth.session){ this.uid = Auth.session.uid; this.role = Auth.session.role; this.canEdit = true; }
    await this.refreshAll();
    this.ready = true;
    this.startPolling();
    this.connectEvents();
  },

  /** Live updates over Server-Sent Events: the server announces which
   *  collection changed and we refetch the snapshot this tab is allowed
   *  to see. EventSource reconnects on its own; if it can't connect at
   *  all (old browser, hostile proxy) the polling timer keeps the site
   *  working, just slower. */
  connectEvents(){
    if(typeof EventSource === "undefined") return; // pre-2017 browser, or the Node test harness
    try{
      const es = new EventSource(API_BASE + "/api/events");
      this.es = es;
      es.addEventListener("open", ()=>{ this.live = true; });
      es.addEventListener("error", ()=>{ this.live = false; });
      es.addEventListener("change", (ev)=>{
        let coll = "";
        try{ coll = (JSON.parse(ev.data)||{}).coll || ""; }catch(e){}
        // Public tabs only wake for content they can actually see, so
        // back-office money work doesn't stir every visitor on the site.
        if(!this.canEdit && !["cars","parts","stories","settings"].includes(coll)) return;
        this.scheduleRefresh();
      });
    }catch(e){ this.es = null; }
  },

  /** Coalesce a burst of change events (an invoice + its payment + the
   *  ledger rows are several writes in quick succession) into one refetch. */
  scheduleRefresh(){
    if(this.changeTimer) return;
    this.changeTimer = setTimeout(()=>{
      this.changeTimer = null;
      this.refreshAll().catch(()=>{});
    }, 500);
  },

  /** Safety net, not the main channel: while the event stream is
   *  connected, changes arrive within milliseconds, so a tick only
   *  refetches if it's been about a minute since the last refresh (an
   *  idle-looking stream can silently die). Without the stream, staff
   *  poll fast and public tabs poll slowly. */
  startPolling(){
    if(this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(()=>{
      if(this.live && Date.now() - this.lastRefreshAt < 55000) return;
      this.refreshAll().catch(()=>{});
    }, this.canEdit ? 4000 : 60000);
    if(typeof document === "undefined" || this.visibilityBound) return;
    this.visibilityBound = true;
    document.addEventListener("visibilitychange", ()=>{
      if(document.visibilityState === "visible" && (!this.canEdit || !this.live)) this.refreshAll().catch(()=>{});
    });
  },

  async refreshAll(){
    this.lastRefreshAt = Date.now();
    const data = this.canEdit
      ? await api("/api/admin/snapshot")
      : await api("/api/public/snapshot");
    COLLECTIONS.forEach(c => {
      this[c].clear();
      (data[c]||[]).forEach(doc => this[c].set(doc.id, doc));
    });
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings||{});
    this.emit();
  },

  async put(coll, id, data){
    const body = Object.assign({}, data); delete body.id;
    await api(`/api/collections/${coll}/${encodeURIComponent(id)}`, {method:"PUT", body});
    this[coll].set(id, Object.assign({id}, body));
    this.emit();
    return id;
  },
  async patch(coll, id, partial){
    const cur = this[coll].get(id) || {};
    return this.put(coll, id, Object.assign({}, cur, partial));
  },
  async remove(coll, id){
    await api(`/api/collections/${coll}/${encodeURIComponent(id)}`, {method:"DELETE"});
    this[coll].delete(id);
    this.emit();
  },
  async saveSettings(s){
    this.settings = Object.assign({}, DEFAULT_SETTINGS, s);
    await api("/api/settings", {method:"PUT", body:this.settings});
    this.emit();
  },
  async upload(file){
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(API_BASE + "/api/uploads", {method:"POST", credentials:"include", body:fd});
    if(!res.ok){
      let msg = "Upload failed. Try again.", code = "upload_failed";
      try{ const j = await res.json(); msg = j.error || msg; code = j.code || code; }catch(e){}
      const err = new Error(msg); err.code = code; throw err;
    }
    const json = await res.json();
    return json.id;
  },

  /* --- reads --- */
  allCars(){ return [...this.cars.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")); },
  available(){ return this.allCars().filter(c=>c.status === "AVAILABLE"); },
  sold(){ return this.allCars().filter(c=>c.status === "SOLD")
            .sort((a,b)=>(b.soldAt||"").localeCompare(a.soldAt||"")); },
  featured(){ return this.available().filter(c=>c.featured); },
  car(id){ return this.cars.get(id) || null; },
  allStories(){ return [...this.stories.values()].sort((a,b)=>(b.date||"").localeCompare(a.date||"")); },
  published(){ return this.allStories().filter(s=>s.published); },
  story(id){ return this.stories.get(id) || null; },
  allInquiries(){ return [...this.inquiries.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")); },
  get s(){ return this.settings || DEFAULT_SETTINGS; }
};

/* derived, private-cost-aware helpers for parts — mirrors carCost/carcost */
const partCost = id => { const d = DB.partcost.get(id); return d ? (Number(d.cost)||0) : 0; };
DB.allParts = function(){ return [...this.parts.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name))); };
DB.activeParts = function(){ return this.allParts().filter(p=>p.status !== "DISCONTINUED"); };
DB.part = function(id){ return this.parts.get(id) || null; };

const DEFAULT_SETTINGS = {
  dealership:"Sheriff Motors",
  tagline:"Carefully selected Subaru vehicles in Kenya.",
  whatsapp:"254700000000",
  phone:"+254 700 000 000",
  email:"hello@sheriffmotors.co.ke",
  address:"Kiambu Road, Runda, Nairobi",
  hours:"Mon–Fri 08:30–18:00 · Sat 09:00–16:00 · Sun by appointment",
  mapUrl:"https://maps.google.com/?q=Kiambu+Road+Nairobi",
  heroTitle:"Built for the journey.",
  heroSub:"Discover carefully selected Subaru vehicles in Kenya.",
  vatRate:16,
  pin:"",
  invoiceNote:"Thank you for your business. Vehicles remain the property of the dealership until paid in full.",
  receiptNote:"Thank you. Keep this receipt for your records.",
  aboutLead:"We are a small Nairobi dealership that sells one make, because one make is enough when it is the right one."
};

/* ---------- 4. DEMO CONTENT ----------
   Demonstration data only — prices are illustrative, not market
   quotes, and every field is editable from the dashboard.           */

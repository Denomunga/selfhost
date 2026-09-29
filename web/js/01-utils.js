"use strict";
/* Utilities — formatting (KSh, KM, dates), DOM helpers, toast and modal. */

/* ===========================================================
   SHERIFF MOTORS — Subaru dealership application
   Layers:  art  ·  data  ·  views  ·  admin  ·  router
   =========================================================== */

/* ---------- 1. UTILITIES ---------- */
const $  = (s,r)=>(r||document).querySelector(s);
const $$ = (s,r)=>Array.from((r||document).querySelectorAll(s));
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/** The single source of truth for money in this application. */
function ksh(n){
  const v = Number(n);
  if(!isFinite(v) || v<=0) return "Price on request";
  return "KSh " + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function km(n){
  const v = Number(n);
  if(!isFinite(v) || v<0) return "—";
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g,",") + " KM";
}
function slugify(s){
  return String(s||"").toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70) || "item";
}
function dateLabel(iso){
  if(!iso) return "—";
  const d = new Date(iso); if(isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function mulberry(seed){
  let a = seed>>>0;
  return function(){ a|=0;a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
}
function hashStr(s){ let h=2166136261; for(let i=0;i<String(s).length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);} return h>>>0; }

let toastTimer;
function toast(msg, bad){
  const t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove("on"), 3200);
}
function openModal(html, wide){
  const box = $("#modal-box");
  box.classList.toggle("wide", !!wide);
  box.innerHTML = html;
  $("#modal").classList.add("open");
  document.body.style.overflow = "hidden";
  const f = box.querySelector("input,select,textarea,button");
  if(f) setTimeout(()=>f.focus(),60);
}
function closeModal(){
  $("#modal").classList.remove("open");
  $("#modal-box").innerHTML = "";
  document.body.style.overflow = "";
}
$("#modal").addEventListener("click", e => { if(e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if(e.key === "Escape") closeModal(); });

/* ---------- 2. CINEMATOGRAPHY ----------
   This server has no internet access by default, and inventing
   photos of real vehicles would be dishonest. So every demo frame is
   drawn here: depth-separated layers, anamorphic flare, volumetric
   shafts, headlight bloom and wet-tarmac reflection. Layers are
   returned separately where the scroll engine needs to move them at
   different rates. Admin uploads replace all of it with real photos. */

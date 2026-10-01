"use strict";
/* Router, SEO metadata, page mounting, and application boot. */


COLLECTIONS.forEach(c => { if(!DB[c]) DB[c] = new Map(); });



/* ---------- 15. SEO ---------- */

function setMeta(title, desc, jsonld){
  document.title = title;
  let m = document.querySelector('meta[name="description"]');
  if(!m){ m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); }
  m.content = desc;
  const og = (prop, val) => {
    let t = document.querySelector(`meta[property="${prop}"]`);
    if(!t){ t = document.createElement("meta"); t.setAttribute("property", prop); document.head.appendChild(t); }
    t.content = val;
  };
  og("og:title", title); og("og:description", desc); og("og:type", "website");
  og("og:site_name", DB.s.dealership); og("og:url", location.href);
  let s = document.getElementById("ld");
  if(s) s.remove();
  if(jsonld){
    s = document.createElement("script");
    s.type = "application/ld+json"; s.id = "ld";
    s.textContent = JSON.stringify(jsonld);
    document.head.appendChild(s);
  }
}

function seoFor(route, id){
  const s = DB.s;
  if(route === "/cars" && id){
    const c = DB.car(id);
    if(c) return setMeta(
      `${c.year} Subaru ${c.model}${c.variant?" "+c.variant:""} for Sale in Kenya | ${ksh(c.price)}`,
      `${c.year} Subaru ${c.model} ${c.variant||""}, ${km(c.mileage)}, ${c.transmission||""}, ${c.drive||""}. ${ksh(c.price)} at ${s.dealership}, Nairobi.`,
      {"@context":"https://schema.org","@type":"Car","name":`${c.year} Subaru ${c.model} ${c.variant||""}`.trim(),
       "brand":{"@type":"Brand","name":"Subaru"},"model":c.model,"vehicleModelDate":String(c.year),
       "mileageFromOdometer":{"@type":"QuantitativeValue","value":c.mileage,"unitCode":"KMT"},
       "fuelType":c.fuel,"vehicleTransmission":c.transmission,"driveWheelConfiguration":c.drive,
       "color":c.extColor,"bodyType":c.body,
       "offers":{"@type":"Offer","price":c.price,"priceCurrency":"KES",
         "availability":c.status==="SOLD"?"https://schema.org/SoldOut":"https://schema.org/InStock",
         "seller":{"@type":"AutoDealer","name":s.dealership,"address":s.address,"telephone":s.phone}}});
  }
  if(route === "/parts" && id){
    const p = DB.part(id);
    if(p) return setMeta(`${p.name} — Genuine Subaru Part | ${ksh(p.price)}`,
      `${p.name} (SKU ${p.sku}), ${p.category}. ${ksh(p.price)} at ${s.dealership}, Nairobi.`,
      {"@context":"https://schema.org","@type":"Product","name":p.name,"sku":p.sku,"category":p.category,
       "offers":{"@type":"Offer","price":p.price,"priceCurrency":"KES",
         "availability":(Number(p.stock)||0)>0?"https://schema.org/InStock":"https://schema.org/OutOfStock",
         "seller":{"@type":"AutoDealer","name":s.dealership}}});
  }
  if(route === "/stories" && id){
    const a = DB.story(id);
    if(a) return setMeta(`${a.title} | ${s.dealership} Journal`, a.excerpt || s.tagline,
      {"@context":"https://schema.org","@type":"Article","headline":a.title,
       "author":{"@type":"Person","name":a.author},"datePublished":a.date,
       "articleSection":a.category,"publisher":{"@type":"Organization","name":s.dealership}});
  }
  const map = {
    "/":       [`${s.dealership} | Subaru for Sale in Kenya`, s.tagline],
    "/cars":   [`The Subaru Collection | Subaru for Sale in Kenya | ${s.dealership}`,
                `Browse ${DB.available().length} Subaru available in Nairobi, priced in Kenyan Shillings.`],
    "/parts":  [`Genuine Subaru Parts in Kenya | ${s.dealership}`,
                `Browse ${DB.activeParts().length} genuine and premium aftermarket Subaru parts, priced in Kenyan Shillings.`],
    "/sold":   [`Sold Subaru | ${s.dealership}`, "Subaru we have sold in Kenya."],
    "/stories":[`The Journal | ${s.dealership}`, "Subaru ownership, Kenyan road trips, technology and buying guides."],
    "/about":  [`About ${s.dealership} | Subaru specialists in Nairobi`, s.aboutLead],
    "/contact":[`Contact ${s.dealership} | Nairobi`, `${s.address}. ${s.hours}`],
    "/admin":  [`Dashboard | ${s.dealership}`, "Manage inventory, stories and inquiries."]
  };
  const [t, d] = map[route] || map["/"];
  setMeta(t, d, route === "/" ? {"@context":"https://schema.org","@type":"AutoDealer",
    "name":s.dealership,"description":s.tagline,"telephone":s.phone,"email":s.email,
    "address":{"@type":"PostalAddress","streetAddress":s.address,"addressLocality":"Nairobi","addressCountry":"KE"},
    "brand":{"@type":"Brand","name":"Subaru"},"priceRange":"KSh"} : null);
}

/* ---------- 16. ROUTER ---------- */

const timers = [], scrollHandlers = [], keyHandlers = [], observers = [];

function cleanup(){
  FX.clear();
  observers.splice(0).forEach(o => { try{ o.disconnect(); }catch(e){} });
  timers.splice(0).forEach(clearInterval);
  scrollHandlers.splice(0).forEach(h=>window.removeEventListener("scroll", h));
  keyHandlers.splice(0).forEach(h=>document.removeEventListener("keydown", h));
  document.body.classList.remove("has-bar");
}

function parseHash(){
  const raw = (location.hash || "#/").slice(1);
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const query = {};
  (qs||"").split("&").filter(Boolean).forEach(p=>{
    const [k,v] = p.split("="); query[decodeURIComponent(k)] = decodeURIComponent(v||"");
  });
  return {seg: parts, query};
}

function revealAll(root){
  const els = $$(".rv", root || document);
  if(!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    els.forEach(e=>e.classList.add("in")); return;
  }
  const io = new IntersectionObserver(entries=>{
    entries.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); } });
  }, {rootMargin:"0px 0px -8% 0px", threshold:0.08});
  els.forEach(e=>io.observe(e));
  observers.push(io);
}

function mountChrome(){
  const nav = $("#nav"), menu = $("#menu"), burger = $("#burger"), menuClose = $("#menu-close");
  const onScroll = ()=>{ if(nav) nav.classList.toggle("solid", window.scrollY > 40); };
  onScroll();
  window.addEventListener("scroll", onScroll, {passive:true});
  scrollHandlers.push(onScroll);
  if(burger && menu){
    burger.addEventListener("click", ()=>{
      const open = menu.classList.toggle("open");
      burger.classList.toggle("x", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
      if(open) $$("#menu a").forEach((a,i)=>a.style.transitionDelay = (0.06*i + 0.1) + "s");
    });
    if(menuClose) menuClose.addEventListener("click", ()=>{
      menu.classList.remove("open"); burger.classList.remove("x");
      burger.setAttribute("aria-expanded", "false"); document.body.style.overflow = "";
    });
    $$("#menu a").forEach(a=>a.addEventListener("click", ()=>{
      menu.classList.remove("open"); burger.classList.remove("x");
      burger.setAttribute("aria-expanded","false"); document.body.style.overflow = "";
    }));
  }
}

let LAST_KEY = "";
function render(){
  if(!DB.ready){
    $("#app").innerHTML = `<div class="loading">Loading the collection…</div>`;
    return;
  }
  cleanup();
  const {seg, query} = parseHash();
  const root = "/" + (seg[0] || "");
  const id = seg[1] ? decodeURIComponent(seg[1]) : null;
  const app = $("#app");

  if(query.model) FILTER.model = query.model;
  if(query.status) FILTER.status = query.status.toUpperCase();

  let html;
  if(root === "/cars")         html = id ? viewCar(id) : viewCars();
  else if(root === "/parts")   html = id ? viewPart(id) : viewParts();
  else if(root === "/sold")    html = viewSold();
  else if(root === "/stories") html = id ? viewStory(id) : viewStories();
  else if(root === "/about")   html = viewAbout();
  else if(root === "/contact") html = viewContact();
  else if(root === "/admin")   {
    if((seg[1] === "marketing" && seg[2] === "meta") || seg[1] === "meta") ADMIN_TAB = "meta_ads";
    else if(query.tab) ADMIN_TAB = query.tab;
    html = viewAdmin();
  }
  else if(root === "/login")   {
    html = Auth.session ? viewAdmin() : viewLogin();
  }
  else                         html = viewHome();

  app.innerHTML = html;
  mountChrome();

  if(root === "/cars" && id) mountCar(id);
  else if(root === "/cars")  mountCars();
  else if(root === "/parts" && id) mountPart(id);
  else if(root === "/parts") mountParts();
  else if(root === "/stories" && !id) mountStories();
  else if(root === "/contact") mountContact();
  else if(root === "/admin" || root === "/login"){
    if(Auth.session) mountAdmin(); else mountLogin();
  }
  else if(root === "/") mountHome();

  mountCinema();
  revealOn();
  mountCounters();
  mountCursor();
  seoFor(root === "/" ? "/" : root, id);

  const key = root + "/" + (id||"");
  if(key !== LAST_KEY){ Smooth.jump(0); LAST_KEY = key; }
}

window.addEventListener("hashchange", () => {
  render();
});
// Make render globally available for manual triggering
window.render = render;

/* ---------- 17. BOOT ---------- */

(async function boot(){
  runPreloader();
  Smooth.init();
  $("#app").innerHTML = `<div class="loading">Sheriff Motors</div>`;
  DB.onChange(()=>{
    // Live updates from other viewers, and confirmation of our own writes.
    // Never redraw under someone who is typing or mid-task.
    const a = document.activeElement;
    if(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    if($("#modal").classList.contains("open")) return;
    const {seg} = parseHash();
    if("/" + (seg[0]||"") === "/admin"){ if($("#adm-body")) refreshAdmin(); }
    else render();
  });
  try{ await DB.init(); }
  catch(e){ console.error("init failed", e); DB.ready = true; }
  DB.settings = DB.settings || Object.assign({}, DEFAULT_SETTINGS);
  document.addEventListener("click", ()=>Auth.touch(), {passive:true});
  document.addEventListener("keydown", ()=>Auth.touch(), {passive:true});
  render();
})();

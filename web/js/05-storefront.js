"use strict";
/* Public storefront — navigation, home, collection, parts, vehicle pages, stories, about, contact, inquiries. */

const NAV = [["#/","Home"],["#/cars","Subaru"],["#/parts","Parts"],
             ["#/sold","Sold"],["#/stories","Stories"],["#/about","About"],["#/contact","Contact"]];

function markSubaru(size){
  const s = size || 34;
  return `<svg width="${s}" height="${s}" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="19" fill="none" stroke="#C8A253" stroke-width="1.4"/>
    <path d="M9 19.5 L17 17.6 L20 12.5 L23 17.6 L31 19.5 L23 21.4 L20 26.5 L17 21.4 Z" fill="#C8A253" opacity=".92"/>
    <circle cx="20" cy="19.5" r="2.1" fill="#05070A"/>
  </svg>`;
}

function navHTML(route){
  const links = NAV.map(([h,l])=>{
    const on = (h === "#/" ? route === "/" : route.indexOf(h.slice(1).split("?")[0]) === 0);
    return `<a href="${h}" class="${on?"on":""}">${l}</a>`;
  }).join("");
  return `<header class="nav" id="nav"><div class="nav-in">
    <a class="brand" href="#/">${markSubaru(30)}<span><b>${esc(DB.s.dealership)}</b><small>Subaru · Kenya</small></span></a>
    <nav class="nav-links">${links}</nav>
    <div class="nav-cta">
      <a class="btn btn--sm btn--solid" href="#/cars">View Subaru collection</a>
      <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false"><i></i><i></i><i></i></button>
    </div>
  </div></header>
  <div class="menu" id="menu">
    ${NAV.map(([h,l])=>`<a href="${h}">${l}</a>`).join("")}
    <div class="menu-foot">
      <a class="btn btn--solid" href="#/cars">View Subaru collection</a>
      <a class="btn btn--wa" href="${waLink()}" target="_blank" rel="noopener">Chat on WhatsApp</a>
    </div>
  </div>`;
}

function footHTML(){
  const s = DB.s;
  return `<footer class="foot"><div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="brand" href="#/" style="margin-bottom:16px">${markSubaru(32)}<span><b>${esc(s.dealership)}</b><small>Subaru · Kenya</small></span></a>
        <p class="muted" style="max-width:38ch;font-size:.9rem">${esc(s.tagline)}</p>
      </div>
      <div><h4>Collection</h4><ul>
        <li><a href="#/cars">Available Subaru</a></li>
        <li><a href="#/parts">Genuine parts</a></li>
        <li><a href="#/sold">Sold</a></li>
        <li><a href="#/stories">The Journal</a></li>
      </ul></div>
      <div><h4>Dealership</h4><ul>
        <li><a href="#/about">About us</a></li>
        <li><a href="#/contact">Contact</a></li>
        <li><a href="#/admin">Dashboard</a></li>
      </ul></div>
      <div><h4>Visit</h4><ul>
        <li>${esc(s.address)}</li>
        <li><a href="tel:${esc(s.phone.replace(/\s/g,""))}">${esc(s.phone)}</a></li>
        <li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>
      </ul></div>
    </div>
    <div class="foot-base">
      <span>© ${new Date().getFullYear()} ${esc(s.dealership)}. Demonstration inventory — prices are illustrative.</span>
      <span>All prices in Kenyan Shillings (KSh).</span>
    </div>
  </div></footer>`;
}

function waLink(item){
  const num = String(DB.s.whatsapp || "").replace(/[^0-9]/g,"");
  let msg;
  if(item && item.sku){
    msg = `Hello ${DB.s.dealership}, I'd like to order the ${item.name} (SKU ${item.sku}) — ${ksh(item.price)}.`;
  }else if(item){
    msg = `Hello ${DB.s.dealership}, I'm interested in the ${item.year} Subaru ${item.model}${item.variant?" "+item.variant:""} listed at ${ksh(item.price)}.`;
  }else{
    msg = `Hello ${DB.s.dealership}, I'd like to know what Subaru you have available.`;
  }
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

/* ---------- 6. CARDS ---------- */

function carCard(c){
  const sold = c.status === "SOLD";
  return `<article class="card rv">
    <a class="card-media" href="#/cars/${esc(c.id)}" aria-label="${esc(c.year+" Subaru "+c.model)}">
      ${media(coverOf(c), `${c.year} Subaru ${c.model} ${c.variant||""}`, c.body, c.id)}
      ${sold?`<span class="badge badge--sold">Sold</span>`:``}
      ${(!sold&&c.featured)?`<span class="badge badge--feat">Featured</span>`:``}
      ${(!sold&&!c.featured)?`<span class="badge">Available</span>`:``}
    </a>
    <div class="card-body">
      <span class="card-make">Subaru</span>
      <h3 class="card-title">${esc(c.model)}${c.variant?" "+esc(c.variant):""}</h3>
      <span class="card-year num">${esc(c.year)}${c.body?" · "+esc(c.body):""}</span>
      <div class="card-specs">
        <span class="num">${km(c.mileage)}</span>
        <span>${esc(c.transmission||"—").split(" ")[0]}</span>
        <span>${esc(c.fuel||"—")}</span>
        <span>${esc((c.drive||"").indexOf("Symmetrical")===0?"AWD":(c.drive||"—"))}</span>
      </div>
      <div class="card-price num ${sold?"sold-price":""}">${ksh(c.price)}</div>
      <div class="card-foot"><a class="btn btn--sm ${sold?"btn--ghost":""}" href="#/cars/${esc(c.id)}">${sold?"View details":"View vehicle"}</a></div>
    </div>
  </article>`;
}

function storyCard(s){
  return `<article class="story-card rv">
    <a class="story-media" href="#/stories/${esc(s.id)}" aria-label="${esc(s.title)}">
      ${media(s.cover, s.title, "SUV", s.id)}
    </a>
    <div class="story-body">
      <span class="tag">${esc(s.category||"Journal")}</span>
      <h3 class="h-3" style="margin:10px 0 8px">${esc(s.title)}</h3>
      <p class="muted" style="font-size:.92rem;margin:0">${esc(s.excerpt||"")}</p>
      <div class="story-meta">${esc(s.author||"Sheriff Motors")} · ${dateLabel(s.date)}</div>
    </div>
  </article>`;
}

/* ---------- 7. HOME — the film ---------- */

// Choose homepage photos here. Use filenames from the root public/ folder.
const HOME_PHOTOS = {
  hero: "outback-wilderness.jpg", // Main homepage hero.
  machine: "outback-front.jpg", // Chapter 01: The machine.
  collection: "outback-bs.jpg", // Chapter 02: The collection.
  roads: "subaru-story.jpg", // Chapter 03: Kenyan roads.
  zoom: [ // Seven images, in order, for the zoom montage.
    "Subaru-Crosstrek-XV-Crawford-CDR-Series-Lift-Kit-Tuning-1.jpg", "outback-wilderness.jpg", "outback-bs.jpg",
    "outback-front.jpg", "IMG_1460-22443-08448.jpg", "subaru-story.jpg", "subaru-hero.jpg"
  ],
  about: "subaru-story.jpg", // Dealership/about strip.
  closing: "IMG_1460-22443-08448.jpg" // Final homepage image.
};

function homePhoto(file, alt, eager){
  return `<img src="/public/${file}" alt="${esc(alt||"")}" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async">`;
}

function chapter(num, title, sub, photo){
  return `<section class="chap">
    <div class="veil"></div>
    <div class="chap-bg has-photo">${homePhoto(photo, "")}</div>
    <div class="chap-in">
      <div class="chap-num num">${num}</div>
      <h2 class="chap-ttl">${esc(title)}</h2>
      <p class="chap-sub">${esc(sub)}</p>
    </div>
  </section>`;
}

function railCard(c){
  return `<a class="rail-card" href="#/cars/${esc(c.id)}" aria-label="${esc(c.year+" Subaru "+c.model)}">
    ${media(coverOf(c), `${c.year} Subaru ${c.model}`, c.body, c.id)}
    <span class="rail-tag"><b>${esc(c.model)} ${esc(c.variant||"")}</b>
      <span class="num">${esc(c.year)} · ${ksh(c.price)}</span></span></a>`;
}

function viewHome(){
  const s = DB.s;
  const avail = DB.available();
  const feat = DB.featured()[0] || avail[0];
  const sold = DB.sold().slice(0,3);
  const stories = DB.published().slice(0,3);
  const lowest = avail.length ? Math.min(...avail.map(c=>c.price||0)) : 0;

  // models, derived from live inventory — nothing hardcoded
  const models = [...new Set(avail.map(c=>c.model))].map(m=>{
    const list = avail.filter(c=>c.model === m);
    return {m, n:list.length, low:Math.min(...list.map(c=>c.price||0)), car:list[0]};
  }).sort((a,b)=>b.n - a.n).slice(0,6);

  // three counter-running rails, padded so each row spans wider than the viewport
  const pool = avail.length ? avail : DB.allCars();
  const railOf = off => {
    const out = [];
    for(let i=0;i<7 && pool.length;i++) out.push(pool[(i + off) % pool.length]);
    return out.map(railCard).join("");
  };

  return `${navHTML("/")}
  <main>

    <!-- ================= HERO ================= -->
    <section class="cine">
      <div class="cine-pin">
        <div class="planes"><div class="plane" data-depth="0.32">${homePhoto(HOME_PHOTOS.hero, "", true)}</div></div>
        <div class="cine-scrim"></div>
        <div class="cine-copy">
          <span class="tag fade-up">Subaru · Kenya</span>
          <h1 class="h-hero" data-split data-stagger="0.085">${esc(s.heroTitle)}</h1>
          <p class="lede fade-up" style="margin:24px 0 32px">${esc(s.heroSub)}</p>
          <div class="btn-row fade-up">
            <a class="btn btn--solid" href="#/cars">Explore Subaru</a>
            <a class="btn" href="#/sold">View collection</a>
          </div>
          <div class="cine-stat">
            <div><b class="num" data-count="${avail.length}">0</b><span>Available now</span></div>
            <div><b class="num" data-count="${DB.sold().length}">0</b><span>Found owners</span></div>
            <div><b class="num" data-count="${Math.round(lowest/1000)}" data-prefix="KSh " data-suffix=",000">KSh 0</b><span>From</span></div>
          </div>
        </div>
        <span class="cue">Scroll</span>
      </div>
    </section>

    ${chapter("01","The machine","One featured Subaru, shown the way it deserves to be shown.",HOME_PHOTOS.machine)}

    <!-- ========== FRAME TO FULLSCREEN ========== -->
    ${feat?`
    <section class="stage">
      <div class="stage-pin">
        <div class="shot" style="width:38vw;height:42svh">
          ${media(coverOf(feat), `${feat.year} Subaru ${feat.model}`, feat.body, feat.id)}
          <div class="shot-scrim"></div>
          <div class="shot-cap">
            <div style="max-width:var(--maxw);margin:0 auto">
              <span class="tag">Featured</span>
              <h2 class="h-1" style="margin:12px 0 0">${esc(feat.model)} ${esc(feat.variant||"")}</h2>
              <dl class="shot-meta">
                <div><dt>Year</dt><dd>${esc(feat.year)}</dd></div>
                <div><dt>Price</dt><dd>${ksh(feat.price)}</dd></div>
                <div><dt>Odometer</dt><dd>${km(feat.mileage)}</dd></div>
                <div><dt>Drive</dt><dd>${esc((feat.drive||"").indexOf("Symmetrical")===0?"AWD":(feat.drive||"—"))}</dd></div>
              </dl>
              <div class="btn-row" style="margin-top:28px">
                <a class="btn btn--solid" href="#/cars/${esc(feat.id)}">View vehicle</a>
                <a class="btn btn--wa" href="${waLink(feat)}" target="_blank" rel="noopener">Chat on WhatsApp</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>`:""}

    ${chapter("02","The collection","Every Subaru on our floor in Nairobi, priced in Kenyan Shillings.",HOME_PHOTOS.collection)}

    <!-- ========== COUNTER-RUNNING RAILS ========== -->
    <section class="rails">
      <div class="rail" data-dir="1"  data-span="340">${railOf(0)}</div>
      <div class="rail" data-dir="-1" data-span="420" style="margin-left:-12vw">${railOf(3)}</div>
      <div class="rail" data-dir="1"  data-span="260">${railOf(5)}</div>
      <div class="wrap" style="text-align:center;margin-top:clamp(34px,5vw,62px)">
        <a class="btn btn--solid fade-up" href="#/cars">All ${avail.length} vehicles</a>
      </div>
    </section>

    <!-- ========== MARQUEE ========== -->
    <div class="marq">
      <div class="marq-in">
        ${[...models.map(x=>x.m), ...models.map(x=>x.m), "Symmetrical AWD", "Boxer", "Symmetrical AWD", "Boxer"]
          .map((m,i)=>`<span class="${i%3===1?"solid":""}">${esc(m)}</span><i></i>`).join("")}
      </div>
    </div>

    <!-- ========== TILTED GRID ========== -->
    ${models.length?`
    <section class="section">
      <div class="wrap">
        <div class="sec-head">
          <div><span class="tag">By model</span>
            <h2 class="h-1" style="margin-top:12px" data-split>Choose your Subaru</h2></div>
          <a class="btn btn--sm fade-up" href="#/cars">Browse everything</a>
        </div>
        <div class="tgrid">
          ${models.map(x=>`<a class="tile" href="#/cars?model=${encodeURIComponent(x.m)}">
            ${media(coverOf(x.car), x.m, x.car?x.car.body:"SUV", x.m)}
            <span class="tile-in"><b>${esc(x.m)}</b>
              <span>${x.n} available</span>
              <em>From ${ksh(x.low)}</em></span></a>`).join("")}
        </div>
      </div>
    </section>`:""}

    ${(() => { const featParts = DB.activeParts().slice(0,8); return featParts.length ? `
    <section class="section section--tight" style="background:var(--charcoal);border-block:1px solid var(--rule)">
      <div class="wrap">
        <div class="sec-head">
          <div><span class="tag">Genuine parts</span>
            <h2 class="h-1" style="margin-top:12px" data-split>Keep it running right</h2>
            <p class="lede">Filters, brakes, fluids and the parts we stock ourselves — same Kenyan Shilling pricing, same honesty about condition.</p></div>
          <a class="btn btn--sm fade-up" href="#/parts">Shop all parts</a>
        </div>
        <div class="cards">${featParts.map(partCard).join("")}</div>
      </div>
    </section>` : ""; })()}

    ${chapter("03","Kenyan roads","Tarmac ends. The journey does not.",HOME_PHOTOS.roads)}

    <!-- ========== ZOOM PARALLAX ========== -->
    <section class="zoom">
      <div class="zoom-pin">
        ${HOME_PHOTOS.zoom.map(photo=>`<div class="zf"><div>${homePhoto(photo, "")}</div></div>`).join("")}
        <div class="zoom-cap">
          <div class="fade-up">
            <span class="tag">From Waiyaki Way to Loiyangalani</span>
            <p class="lede" style="color:var(--white);max-width:44ch;margin-top:12px">The same drivetrain handles a wet Nairobi lane and volcanic gravel above Lake Baringo without being asked twice.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== SOLD ========== -->
    ${sold.length?`
    <section class="section section--tight">
      <div class="wrap">
        <div class="sec-head">
          <div><span class="tag">Recently sold</span>
            <h2 class="h-1" style="margin-top:12px" data-split>Subaru that found their owners</h2></div>
          <a class="btn btn--sm fade-up" href="#/sold">View the archive</a>
        </div>
        <div class="cards">${sold.map(carCard).join("")}</div>
      </div>
    </section>`:""}

    <!-- ========== JOURNAL ========== -->
    ${stories.length?`
    <section class="section section--tight">
      <div class="wrap">
        <div class="sec-head">
          <div><span class="tag">The Journal</span>
            <h2 class="h-1" style="margin-top:12px" data-split>Stories from the road</h2></div>
          <a class="btn btn--sm fade-up" href="#/stories">Read the Journal</a>
        </div>
        <div class="cards">${stories.map(storyCard).join("")}</div>
      </div>
    </section>`:""}

    <!-- ========== ABOUT STRIP ========== -->
    <section class="section" style="background:var(--charcoal);border-block:1px solid var(--rule);overflow:hidden">
      <div class="wrap split">
        <div>
          <span class="tag fade-up">The dealership</span>
          <h2 class="h-1" style="margin:14px 0 20px" data-split>One make, done properly</h2>
          <p class="lede fade-up">${esc(s.aboutLead)}</p>
          <p class="lede fade-up">Every car goes on the lift before it reaches this website. Anything that fails never gets listed.</p>
          <div class="btn-row fade-up"><a class="btn" href="#/about">Our selection process</a></div>
        </div>
        <div class="split-media" data-par="80">${homePhoto(HOME_PHOTOS.about, "")}</div>
      </div>
    </section>

    <!-- ========== CLOSING FRAME ========== -->
    <section class="outro">
      <div class="outro-pin">
        <div class="outro-bg">${homePhoto(HOME_PHOTOS.closing, "")}</div>
        <div class="cine-scrim"></div>
        <div class="outro-in">
          <h2 class="h-1" data-split data-stagger="0.07">Where will your Subaru take you?</h2>
          <div class="btn-row fade-up" style="justify-content:center;margin-top:32px">
            <a class="btn btn--solid" href="#/cars">Explore Subaru</a>
            <a class="btn" href="#/contact">Contact us</a>
          </div>
        </div>
      </div>
    </section>
  </main>${footHTML()}`;
}

function mountHome(){ /* all choreography is wired by mountCinema() */ }

/* ---------- 8. COLLECTION + FILTERS ---------- */

const FILTER = {
  model:"", year:"", body:"", transmission:"", fuel:"", engine:"", drive:"",
  status:"AVAILABLE", minPrice:0, maxPrice:0, maxMileage:0, sort:"newest", q:""
};

function priceBounds(list){
  const p = list.map(c=>Number(c.price)||0).filter(Boolean);
  return p.length ? [Math.min(...p), Math.max(...p)] : [0, 10000000];
}

function applyFilters(){
  let list = DB.allCars();
  if(FILTER.status === "AVAILABLE") list = list.filter(c=>c.status === "AVAILABLE");
  else if(FILTER.status === "SOLD") list = list.filter(c=>c.status === "SOLD");
  if(FILTER.model) list = list.filter(c=>c.model === FILTER.model);
  if(FILTER.year) list = list.filter(c=>String(c.year) === String(FILTER.year));
  if(FILTER.body) list = list.filter(c=>c.body === FILTER.body);
  if(FILTER.transmission) list = list.filter(c=>c.transmission === FILTER.transmission);
  if(FILTER.fuel) list = list.filter(c=>c.fuel === FILTER.fuel);
  if(FILTER.engine) list = list.filter(c=>c.engine === FILTER.engine);
  if(FILTER.drive === "AWD") list = list.filter(c=>/AWD|All-Wheel/i.test(c.drive||""));
  if(FILTER.minPrice) list = list.filter(c=>(Number(c.price)||0) >= FILTER.minPrice);
  if(FILTER.maxPrice) list = list.filter(c=>(Number(c.price)||0) <= FILTER.maxPrice);
  if(FILTER.maxMileage) list = list.filter(c=>(Number(c.mileage)||0) <= FILTER.maxMileage);
  if(FILTER.q){
    const q = FILTER.q.toLowerCase();
    list = list.filter(c => [c.model,c.variant,c.year,c.body,c.extColor,c.engine,c.description]
      .join(" ").toLowerCase().includes(q));
  }
  const s = FILTER.sort;
  if(s === "price-asc")   list.sort((a,b)=>(a.price||0)-(b.price||0));
  if(s === "price-desc")  list.sort((a,b)=>(b.price||0)-(a.price||0));
  if(s === "mileage")     list.sort((a,b)=>(a.mileage||0)-(b.mileage||0));
  if(s === "featured")    list.sort((a,b)=>(b.featured?1:0)-(a.featured?1:0));
  if(s === "newest")      list.sort((a,b)=>(b.year||0)-(a.year||0));
  return list;
}

function opts(values, current, label){
  return `<option value="">${label}</option>` + values.map(v =>
    `<option value="${esc(v)}" ${String(current)===String(v)?"selected":""}>${esc(v)}</option>`).join("");
}

function viewCars(){
  return `${navHTML("/cars")}
  <main class="page-top">
    <div class="wrap">
      <span class="tag">Inventory</span>
      <h1 class="h-1" style="margin:14px 0 16px" data-split>The Subaru collection</h1>
      <p class="lede" style="margin-bottom:38px">Every vehicle on our floor, priced in Kenyan Shillings.</p>

      <div class="srch-wrap" style="margin-bottom:34px">
        <div class="srch-bar">
          <svg class="srch-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input id="f-q" class="srch-input" type="search" autocomplete="off" placeholder="Search cars and parts — Forester, WRX, brake pads…" value="${esc(FILTER.q)}">
          <button class="srch-clear" id="srch-clear" aria-label="Clear" style="${FILTER.q?"":"display:none"}">✕</button>
        </div>
        <div class="srch-drop" id="srch-drop" hidden></div>
      </div>

      <div class="cards" id="car-grid"></div>
      <div id="car-also-like"></div>
      <div style="height:clamp(60px,9vw,120px)"></div>
    </div>
  </main>${footHTML()}`;
}

function renderGrid(){
  const grid = $("#car-grid"); if(!grid) return;
  const list = applyFilters();
  const shownIds = new Set(list.map(c=>c.id));
  grid.innerHTML = list.length ? list.map(carCard).join("")
    : `<div class="empty" style="grid-column:1/-1">No Subaru matches these filters. Try a different search or clear the filters to see the whole collection.</div>`;
  const c = $("#f-count");
  if(c) c.textContent = `${list.length} vehicle${list.length===1?"":"s"}`;
  revealAll(grid);
  youMayAlsoLike("car-also-like", shownIds, "cars");
}

function youMayAlsoLike(targetId, shownIds, currentType){
  const container = $(typeof targetId === "string" ? (targetId.startsWith("#") ? targetId : "#" + targetId) : targetId);
  if(!container) return;

  const shown = shownIds instanceof Set ? shownIds : new Set(shownIds || []);

  // Pick up to 2 cars not already shown
  let recCars = DB.available().filter(c => !shown.has(c.id)).slice(0, 2);
  if(recCars.length < 2){
    const more = DB.allCars().filter(c => !shown.has(c.id) && !recCars.some(rc=>rc.id===c.id)).slice(0, 2 - recCars.length);
    recCars.push(...more);
  }

  // Pick up to 2 parts not already shown
  let recParts = DB.activeParts().filter(p => !shown.has(p.id) && (Number(p.stock)||0) > 0).slice(0, 2);
  if(recParts.length < 2){
    const more = DB.activeParts().filter(p => !shown.has(p.id) && !recParts.some(rp=>rp.id===p.id)).slice(0, 2 - recParts.length);
    recParts.push(...more);
  }

  if(!recCars.length && !recParts.length){
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="also-like-box">
      <div class="sec-head" style="margin-bottom:24px">
        <div>
          <span class="tag">Recommendations</span>
          <h2 class="h-2" style="margin-top:8px">You may also like</h2>
        </div>
        <div class="count">${recCars.length} vehicle${recCars.length===1?"":"s"} · ${recParts.length} spare${recParts.length===1?"":"s"}</div>
      </div>
      <div class="cards">
        ${recCars.map(carCard).join("")}
        ${recParts.map(partCard).join("")}
      </div>
    </div>`;
  revealAll(container);
}

function setupLiveSearch(opts){
  const input = $(opts.inputId);
  const drop = $(opts.dropId);
  const clear = $(opts.clearId);
  if(!input || !drop) return;

  function closeDrop(){
    drop.hidden = true;
    drop.innerHTML = "";
  }

  function handleSearch(){
    const q = input.value.trim();
    if(clear) clear.style.display = q ? "flex" : "none";
    if(opts.onFilter) opts.onFilter(q);

    if(!q){
      closeDrop();
      return;
    }

    const ql = q.toLowerCase();
    const matchedCars = DB.allCars().filter(c =>
      [c.year, c.model, c.variant, c.body, c.engine, c.extColor, c.description].join(" ").toLowerCase().includes(ql)
    ).slice(0, 4);

    const matchedParts = DB.activeParts().filter(p =>
      [p.name, p.sku, p.brand, p.category, p.description, ...(p.compatible||[])].join(" ").toLowerCase().includes(ql)
    ).slice(0, 4);

    if(!matchedCars.length && !matchedParts.length){
      drop.innerHTML = `<div class="srch-empty">No vehicles or parts found matching "<b>${esc(q)}</b>"</div>`;
      drop.hidden = false;
      return;
    }

    let html = "";
    if(matchedCars.length){
      html += `<div class="srch-group-label">Vehicles</div>`;
      html += matchedCars.map(c => {
        const isSold = c.status === "SOLD";
        const badge = isSold ? `<span class="pill pill--bad">Sold</span>` : `<span class="pill pill--ok">Available</span>`;
        return `
          <a class="srch-item" href="#/cars/${esc(c.id)}">
            <span class="srch-tag">CAR</span>
            <div class="srch-info">
              <div class="srch-name">${esc(c.year)} Subaru ${esc(c.model)} ${esc(c.variant||"")}</div>
              <div class="srch-sub">${esc(c.body||"")} · ${km(c.mileage)} · ${esc(c.transmission||"").split(" ")[0]}</div>
            </div>
            <div class="srch-right">
              ${badge}
              <div class="srch-price num">${ksh(c.price)}</div>
            </div>
          </a>`;
      }).join("");
    }

    if(matchedParts.length){
      html += `<div class="srch-group-label">Spares &amp; Parts</div>`;
      html += matchedParts.map(p => {
        const st = partStock(p);
        return `
          <a class="srch-item" href="#/parts/${esc(p.id)}">
            <span class="srch-tag srch-tag--part">SPARE</span>
            <div class="srch-info">
              <div class="srch-name">${esc(p.name)}</div>
              <div class="srch-sub">SKU: ${esc(p.sku)} · ${esc(p.category||"")} · ${esc(p.brand||"Genuine")}</div>
            </div>
            <div class="srch-right">
              <span class="pill ${st.cls}">${st.label}</span>
              <div class="srch-price num">${ksh(p.price)}</div>
            </div>
          </a>`;
      }).join("");
    }

    drop.innerHTML = html;
    drop.hidden = false;
  }

  input.addEventListener("input", handleSearch);
  input.addEventListener("focus", () => {
    if(input.value.trim().length >= 1) handleSearch();
  });
  input.addEventListener("keydown", e => {
    if(e.key === "Escape"){
      closeDrop();
    }
  });

  if(clear){
    clear.addEventListener("click", () => {
      input.value = "";
      clear.style.display = "none";
      closeDrop();
      if(opts.onFilter) opts.onFilter("");
      input.focus();
    });
  }

  document.addEventListener("click", e => {
    if(!input.contains(e.target) && !drop.contains(e.target) && (!clear || !clear.contains(e.target))){
      closeDrop();
    }
  });
}

function mountCars(){
  setupLiveSearch({
    inputId: "#f-q",
    dropId: "#srch-drop",
    clearId: "#srch-clear",
    onFilter: (q) => {
      FILTER.q = q;
      renderGrid();
    }
  });
  renderGrid();
}

/* ---------- 8b. PARTS COUNTER ---------- */

function partCard(p){
  const st = partStock(p);
  return `<article class="card rv">
    <a class="card-media" href="#/parts/${esc(p.id)}" aria-label="${esc(p.name)}">
      ${partMedia(p, p.id)}
      <span class="badge">${esc(p.category)}</span>
    </a>
    <div class="card-body">
      <span class="card-make">${esc(p.brand||"Genuine")}</span>
      <h3 class="card-title" style="text-transform:none;font-size:1.05rem">${esc(p.name)}</h3>
      <span class="card-year" style="text-transform:none">SKU ${esc(p.sku)}</span>
      <div class="card-specs"><span class="pill ${st.cls}" style="margin-top:2px">${st.label}</span></div>
      <div class="card-price num">${ksh(p.price)}</div>
      <div class="card-foot"><a class="btn btn--sm" href="#/parts/${esc(p.id)}">View part</a></div>
    </div>
  </article>`;
}

const PFILTER = {category:"", model:"", inStockOnly:false, q:"", sort:"name"};
function applyPartFilters(){
  let list = DB.activeParts();
  if(PFILTER.category) list = list.filter(p=>p.category === PFILTER.category);
  if(PFILTER.model) list = list.filter(p=>(p.compatible||[]).includes(PFILTER.model));
  if(PFILTER.inStockOnly) list = list.filter(p=>(Number(p.stock)||0) > 0);
  if(PFILTER.q){
    const q = PFILTER.q.toLowerCase();
    list = list.filter(p=>[p.name,p.sku,p.brand,p.category,p.description].join(" ").toLowerCase().includes(q));
  }
  const s = PFILTER.sort;
  if(s === "price-asc")  list.sort((a,b)=>(a.price||0)-(b.price||0));
  if(s === "price-desc") list.sort((a,b)=>(b.price||0)-(a.price||0));
  if(s === "newest")     list.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  if(s === "name")       list.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  return list;
}

function viewParts(){
  return `${navHTML("/parts")}
  <main class="page-top">
    <div class="wrap">
      <span class="tag">Genuine parts</span>
      <h1 class="h-1" style="margin:14px 0 16px" data-split>Keep it running right</h1>
      <p class="lede" style="margin-bottom:38px">Filters, brakes, suspension and the fluids we use ourselves. Priced in Kenyan Shillings, stock shown honestly.</p>

      <div class="srch-wrap" style="margin-bottom:34px">
        <div class="srch-bar">
          <svg class="srch-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input id="pf-q" class="srch-input" type="search" autocomplete="off" placeholder="Search spares and cars — Brake pads, oil filter, Forester…" value="${esc(PFILTER.q)}">
          <button class="srch-clear" id="psrch-clear" aria-label="Clear" style="${PFILTER.q?"":"display:none"}">✕</button>
        </div>
        <div class="srch-drop" id="psrch-drop" hidden></div>
      </div>

      <div class="cards" id="part-grid"></div>
      <div id="part-also-like"></div>
      <div style="height:clamp(60px,9vw,120px)"></div>
    </div>
  </main>${footHTML()}`;
}

function renderPartGrid(){
  const grid = $("#part-grid"); if(!grid) return;
  const list = applyPartFilters();
  const shownIds = new Set(list.map(p=>p.id));
  grid.innerHTML = list.length ? list.map(partCard).join("")
    : `<div class="empty" style="grid-column:1/-1">No parts match these filters. Try a different search.</div>`;
  const c = $("#pf-count");
  if(c) c.textContent = `${list.length} part${list.length===1?"":"s"}`;
  revealAll(grid);
  youMayAlsoLike("part-also-like", shownIds, "parts");
}

function mountParts(){
  setupLiveSearch({
    inputId: "#pf-q",
    dropId: "#psrch-drop",
    clearId: "#psrch-clear",
    onFilter: (q) => {
      PFILTER.q = q;
      renderPartGrid();
    }
  });
  renderPartGrid();
}

function viewPart(id){
  const p = DB.part(id);
  if(!p) return `${navHTML("/parts")}<main class="page-top"><div class="wrap">
    <h1 class="h-1">This part is no longer listed</h1>
    <p class="lede">It may have been removed or discontinued. The rest of the parts counter is still here.</p>
    <a class="btn btn--solid" href="#/parts">Browse parts</a>
    <div style="height:140px"></div></div></main>${footHTML()}`;

  const st = partStock(p);
  const specs = [["SKU", p.sku], ["Category", p.category], ["Brand", p.brand], ["Unit", p.unit],
    ["Compatible with", (p.compatible||[]).join(", ") || "—"], ["Availability", st.label]];

  return `${navHTML("/parts")}
  <main class="page-top"><div class="wrap">
    <a class="crumb" href="#/parts">← Back to parts</a>
    <div class="v-layout">
      <div>
        <div class="gal-main" style="aspect-ratio:4/3">${partMedia(p, p.id)}</div>
        <h1 class="h-1" style="margin:clamp(28px,4vw,44px) 0 6px">${esc(p.name)}</h1>
        <div class="muted" style="letter-spacing:.06em">${esc(p.brand||"")}</div>
        <p class="lede" style="max-width:64ch;margin-top:20px">${esc(p.description||"")}</p>
        <h2 class="h-2" style="margin:clamp(30px,4vw,50px) 0 16px">Specification</h2>
        <dl class="specs">${specs.map(([k,v])=>`<div class="spec"><dt>${esc(k)}</dt><dd>${esc(v||"—")}</dd></div>`).join("")}</dl>
      </div>
      <aside class="v-aside">
        <span class="tag">${esc(p.category)}</span>
        <h3 class="h-3" style="margin:12px 0 6px">${esc(p.name)}</h3>
        <div class="num" style="font-family:var(--display);font-size:1.5rem;font-weight:800;color:var(--brass);margin:6px 0 14px">${ksh(p.price)}</div>
        <span class="pill ${st.cls}">${st.label}</span>
        <div class="btn-row" style="margin-top:22px;flex-direction:column">
          <button class="btn btn--solid" id="inq-btn" style="width:100%" ${st.cls==="pill--bad"?"disabled":""}>Order this part</button>
          <a class="btn btn--wa" href="${waLink(p)}" target="_blank" rel="noopener" style="width:100%">Chat on WhatsApp</a>
          <a class="btn btn--ghost" href="tel:${esc(DB.s.phone.replace(/\\s/g,""))}" style="width:100%">Call ${esc(DB.s.phone)}</a>
        </div>
      </aside>
    </div>
    <div style="height:clamp(60px,9vw,120px)"></div>
  </div></main>${footHTML()}`;
}
function mountPart(id){
  const p = DB.part(id); if(!p) return;
  const b = $("#inq-btn"); if(b) b.addEventListener("click", ()=>inquiryForm(p));
}

/* ---------- 9. VEHICLE PAGE ---------- */

function viewCar(id){
  const c = DB.car(id);
  if(!c) return `${navHTML("/cars")}<main class="page-top"><div class="wrap">
    <h1 class="h-1">This vehicle is no longer listed</h1>
    <p class="lede">It may have been sold or removed. The rest of the collection is still here.</p>
    <a class="btn btn--solid" href="#/cars">View the collection</a>
    <div style="height:140px"></div></div></main>${footHTML()}`;

  const sold = c.status === "SOLD";
  const images = (c.images && c.images.length) ? c.images : [null];
  const title = `${c.year} Subaru ${c.model}${c.variant?" "+c.variant:""}`;
  const specs = [
    ["Engine", c.engine], ["Transmission", c.transmission], ["Fuel", c.fuel],
    ["Drive type", c.drive], ["Mileage", km(c.mileage)], ["Body type", c.body],
    ["Exterior colour", c.extColor], ["Interior colour", c.intColor],
    ["Year of manufacture", c.year], ["Registered", c.regYear]
  ].filter(x=>x[1]);

  return `${navHTML("/cars")}
  <main>
    <section class="vcine">
      <div class="vcine-pin">
      <div class="vcine-media">${media(coverOf(c), title, c.body, c.id)}</div>
      <div class="v-hero-scrim"></div>
      <div class="v-hero-in vcine-copy">
        <div style="max-width:var(--maxw);margin:0 auto">
          <span class="tag">Subaru${sold?" · Sold":""}</span>
          <h1 class="h-1" style="margin:12px 0 6px">${esc(c.model)} ${esc(c.variant||"")}</h1>
          <div class="muted num" style="letter-spacing:.14em">${esc(c.year)} · ${km(c.mileage)}</div>
          <div class="v-price num">${ksh(c.price)}${sold?` <span class="muted" style="font-size:.5em;letter-spacing:.2em">SOLD</span>`:""}</div>
        </div>
      </div>
      </div>
    </section>

    <div class="wrap section--tight">
      <a class="crumb" href="#/cars">← Back to the collection</a>
      <div class="v-layout">
        <div>
          <div class="gal-main" id="gal">
            ${images.map((im,i)=>`<div class="gal-frame${i===0?" on":""}">${media(im, title+" — image "+(i+1), c.body, c.id+i)}</div>`).join("")}
            <span class="gal-count num" id="gal-count">01 / ${String(images.length).padStart(2,"0")}</span>
            ${images.length>1?`<div class="gal-nav">
              <button id="gal-prev" aria-label="Previous image">‹</button>
              <button id="gal-next" aria-label="Next image">›</button></div>`:""}
          </div>
          ${images.length>1?`<div class="gal-strip" id="gal-strip">
            ${images.map((im,i)=>`<button class="${i===0?"on":""}" data-i="${i}" aria-label="Image ${i+1}">${media(im, "", c.body, c.id+i)}</button>`).join("")}
          </div>`:""}

          <h2 class="h-2" style="margin:clamp(38px,5vw,64px) 0 18px">About this Subaru</h2>
          <p class="lede" style="max-width:68ch">${esc(c.description||"")}</p>

          <h2 class="h-2" style="margin:clamp(38px,5vw,64px) 0 18px">Specification</h2>
          <dl class="specs">
            ${specs.map(([k,v])=>`<div class="spec"><dt>${esc(k)}</dt><dd${/Mileage|Year|Registered/.test(k)?' class="num"':''}>${esc(v)}</dd></div>`).join("")}
          </dl>

          ${(c.features&&c.features.length)?`
          <h2 class="h-2" style="margin:clamp(38px,5vw,64px) 0 18px">Equipment</h2>
          <ul class="feat-list">${c.features.map(f=>`<li>${esc(f)}</li>`).join("")}</ul>`:""}
        </div>

        <aside class="v-aside">
          <span class="tag">${sold?"This one sold":"Enquire"}</span>
          <h3 class="h-3" style="margin:12px 0 6px">${esc(c.model)} ${esc(c.variant||"")}</h3>
          <div class="num" style="font-family:var(--display);font-size:1.5rem;font-weight:800;color:var(--brass);margin:6px 0 18px">${ksh(c.price)}</div>
          <dl class="specs" style="grid-template-columns:1fr 1fr">
            <div class="spec"><dt>Year</dt><dd class="num">${esc(c.year)}</dd></div>
            <div class="spec"><dt>Mileage</dt><dd class="num">${km(c.mileage)}</dd></div>
            <div class="spec"><dt>Drive</dt><dd>${esc((c.drive||"").indexOf("Symmetrical")===0?"AWD":(c.drive||"—"))}</dd></div>
            <div class="spec"><dt>Status</dt><dd>${sold?"Sold":"Available"}</dd></div>
          </dl>
          ${sold?`<p class="muted" style="margin-top:18px;font-size:.9rem">This Subaru has found its owner. Tell us what you are looking for and we will call you when the next one lands.</p>
            <div class="btn-row" style="margin-top:8px"><a class="btn" href="#/contact" style="width:100%">Tell us what you want</a></div>`
          :`<div class="btn-row" style="margin-top:22px;flex-direction:column">
              <button class="btn btn--solid" id="inq-btn" style="width:100%">Inquire about this Subaru</button>
              <a class="btn btn--wa" href="${waLink(c)}" target="_blank" rel="noopener" style="width:100%">Chat on WhatsApp</a>
              <a class="btn btn--ghost" href="tel:${esc(DB.s.phone.replace(/\s/g,""))}" style="width:100%">Call ${esc(DB.s.phone)}</a>
            </div>`}
        </aside>
      </div>
      <div style="height:clamp(60px,9vw,120px)"></div>
    </div>
  </main>
  ${sold?"":`<div class="sticky-bar">
    <button class="btn btn--solid" id="inq-bar">Inquire</button>
    <a class="btn btn--wa" href="${waLink(c)}" target="_blank" rel="noopener">WhatsApp</a>
  </div>`}
  ${footHTML()}`;
}

function mountCar(id){
  const c = DB.car(id); if(!c) return;
  if(c.status !== "SOLD") document.body.classList.add("has-bar");
  const frames = $$(".gal-frame"), thumbs = $$("#gal-strip button");
  let i = 0;
  const show = n => {
    i = (n + frames.length) % frames.length;
    frames.forEach((f,k)=>f.classList.toggle("on", k===i));
    thumbs.forEach((t,k)=>t.classList.toggle("on", k===i));
    const cnt = $("#gal-count");
    if(cnt) cnt.textContent = `${String(i+1).padStart(2,"0")} / ${String(frames.length).padStart(2,"0")}`;
    if(thumbs[i]) thumbs[i].scrollIntoView({block:"nearest", inline:"nearest", behavior:"smooth"});
  };
  const prev = $("#gal-prev"), next = $("#gal-next");
  if(prev) prev.addEventListener("click", ()=>show(i-1));
  if(next) next.addEventListener("click", ()=>show(i+1));
  thumbs.forEach(t=>t.addEventListener("click", ()=>show(Number(t.dataset.i))));

  // swipe on touch
  const gal = $("#gal");
  if(gal && frames.length > 1){
    let x0 = null;
    gal.addEventListener("touchstart", e=>{ x0 = e.touches[0].clientX; }, {passive:true});
    gal.addEventListener("touchend", e=>{
      if(x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if(Math.abs(dx) > 42) show(dx < 0 ? i+1 : i-1);
      x0 = null;
    }, {passive:true});
  }
  const keyNav = e=>{
    if(e.key === "ArrowRight") show(i+1);
    if(e.key === "ArrowLeft") show(i-1);
  };
  if(frames.length>1){ document.addEventListener("keydown", keyNav); keyHandlers.push(keyNav); }

  const open = ()=>inquiryForm(c);
  const b1 = $("#inq-btn"), b2 = $("#inq-bar");
  if(b1) b1.addEventListener("click", open);
  if(b2) b2.addEventListener("click", open);
}

/* ---------- 10. INQUIRY ---------- */

function inquiryForm(item){
  const isPart = !!(item && item.sku);
  openModal(`
    <div class="modal-head">
      <div><span class="tag">Inquiry</span>
        <h3 class="h-2" style="margin-top:10px">${item?esc(isPart?item.name:(item.year+" Subaru "+item.model+" "+(item.variant||""))):"Talk to us"}</h3>
        ${item?`<div class="muted num" style="margin-top:6px">${ksh(item.price)}</div>`:""}</div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button>
    </div>
    <form id="inq-form" class="form-grid">
      <div class="field"><label for="i-name">Your name</label><input id="i-name" required autocomplete="name"></div>
      <div class="field"><label for="i-phone">Phone</label><input id="i-phone" required type="tel" placeholder="07xx xxx xxx" autocomplete="tel"></div>
      ${isPart?`<div class="field"><label for="i-qty">Quantity</label><input id="i-qty" type="number" min="1" value="1"></div>`:""}
      <div class="field full"><label for="i-email">Email</label><input id="i-email" type="email" autocomplete="email"></div>
      <div class="field full"><label for="i-msg">Message</label><textarea id="i-msg" placeholder="${isPart?"When do you need it by?":"When could I come and see it?"}"></textarea></div>
      <div class="full btn-row" style="margin-top:6px">
        <button class="btn btn--solid" type="submit" id="i-send">Send inquiry</button>
        ${item?`<a class="btn btn--wa" href="${waLink(item)}" target="_blank" rel="noopener">Chat on WhatsApp instead</a>`:""}
      </div>
      <p class="muted full" style="font-size:.8rem;margin:0">We reply during business hours: ${esc(DB.s.hours)}</p>
    </form>`);

  $("#inq-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const btn = $("#i-send"); btn.disabled = true; btn.textContent = "Sending…";
    const qty = isPart ? Math.max(1, Number(($("#i-qty")&&$("#i-qty").value)||1)) : null;
    const rec = {
      name: $("#i-name").value.trim(), phone: $("#i-phone").value.trim(),
      email: $("#i-email").value.trim(), message: $("#i-msg").value.trim(),
      carId: (!isPart && item) ? item.id : null,
      partId: isPart ? item.id : null, qty,
      carLabel: item ? (isPart ? `${item.name} × ${qty} (SKU ${item.sku})` : `${item.year} Subaru ${item.model} ${item.variant||""}`.trim()) : "General enquiry",
      price: item ? item.price : null, status:"NEW", createdAt: new Date().toISOString()
    };
    try{
      await DB.put("inquiries", "inq-" + uid(), rec);
      closeModal();
      toast("Inquiry sent — we'll be in touch");
    }catch(err){
      btn.disabled = false; btn.textContent = "Send inquiry";
      toast(err && err.code === "invalid_argument"
        ? "This account can't submit inquiries. Use WhatsApp instead."
        : "Inquiry didn't send. Try WhatsApp or call us.", true);
    }
  });
}

/* ---------- 11. SOLD ---------- */

function viewSold(){
  const list = DB.sold();
  return `${navHTML("/sold")}
  <main class="page-top"><div class="wrap">
    <span class="tag">Archive</span>
    <h1 class="h-1" style="margin:14px 0 16px" data-split>Subaru that found their owners</h1>
    <p class="lede" style="margin-bottom:38px">Cars we have sold. They stay here because the archive tells you what we buy, what we price, and how quickly it moves.</p>
    <div class="cards">${list.length?list.map(carCard).join(""):`<div class="empty" style="grid-column:1/-1">No sold vehicles in the archive yet.</div>`}</div>
    <div class="notice rv" style="margin-top:44px">Looking for something similar? Tell us the model and budget and we will call you when the next one lands.
      <div class="btn-row" style="margin-top:16px"><a class="btn btn--sm btn--solid" href="#/contact">Register your interest</a></div></div>
    <div style="height:clamp(60px,9vw,120px)"></div>
  </div></main>${footHTML()}`;
}

/* ---------- 12. STORIES ---------- */

function viewStories(){
  const list = DB.published();
  const cats = [...new Set(list.map(s=>s.category).filter(Boolean))];
  return `${navHTML("/stories")}
  <main class="page-top"><div class="wrap">
    <span class="tag">The Journal</span>
    <h1 class="h-1" style="margin:14px 0 16px" data-split>Subaru stories</h1>
    <p class="lede" style="margin-bottom:30px">Ownership, road trips, technology and the occasional argument about gearboxes.</p>
    <div class="chip-row" style="margin-bottom:34px" id="cat-row">
      <button class="chip on" data-cat="">All</button>
      ${cats.map(c=>`<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}
    </div>
    <div class="cards" id="story-grid">${list.length?list.map(storyCard).join(""):`<div class="empty" style="grid-column:1/-1">No stories published yet.</div>`}</div>
    <div style="height:clamp(60px,9vw,120px)"></div>
  </div></main>${footHTML()}`;
}

function mountStories(){
  $$("#cat-row .chip").forEach(b=>b.addEventListener("click", ()=>{
    $$("#cat-row .chip").forEach(x=>x.classList.remove("on"));
    b.classList.add("on");
    const cat = b.dataset.cat;
    const list = DB.published().filter(s=>!cat || s.category === cat);
    const grid = $("#story-grid");
    grid.innerHTML = list.length?list.map(storyCard).join(""):`<div class="empty" style="grid-column:1/-1">Nothing in this category yet.</div>`;
    revealAll(grid);
  }));
}

function viewStory(id){
  const s = DB.story(id);
  if(!s || !s.published) return `${navHTML("/stories")}<main class="page-top"><div class="wrap">
    <h1 class="h-1">This story isn't available</h1>
    <p class="lede">It may have been unpublished. The rest of the Journal is still here.</p>
    <a class="btn btn--solid" href="#/stories">Read the Journal</a><div style="height:140px"></div>
  </div></main>${footHTML()}`;

  const body = (s.body||[]).map(p => p.startsWith("## ")
    ? `<h2>${esc(p.slice(3))}</h2>`
    : `<p>${esc(p)}</p>`).join("");
  const more = DB.published().filter(x=>x.id !== s.id).slice(0,3);

  return `${navHTML("/stories")}
  <main>
    <section class="v-hero" style="height:clamp(44vh,58vh,620px)">
      <div data-par="110">${media(s.cover, s.title, "SUV", s.id)}</div>
      <div class="v-hero-scrim"></div>
      <div class="v-hero-in"><div style="max-width:var(--maxw);margin:0 auto">
        <span class="tag">${esc(s.category||"Journal")}</span>
        <h1 class="h-1" style="margin:12px 0 10px;max-width:22ch">${esc(s.title)}</h1>
        <div class="muted" style="letter-spacing:.1em">${esc(s.author||"Sheriff Motors")} · ${dateLabel(s.date)}</div>
      </div></div>
    </section>
    <div class="wrap section--tight">
      <a class="crumb" href="#/stories">← Back to the Journal</a>
      <article class="article">
        <p class="lede" style="font-size:1.25rem;color:var(--white);margin-bottom:1.6em">${esc(s.excerpt||"")}</p>
        ${body}
      </article>
      ${more.length?`<div style="margin-top:clamp(56px,8vw,110px)">
        <div class="sec-head"><div><span class="tag">Keep reading</span></div></div>
        <div class="cards">${more.map(storyCard).join("")}</div></div>`:""}
      <div style="height:clamp(60px,9vw,120px)"></div>
    </div>
  </main>${footHTML()}`;
}

/* ---------- 13. ABOUT + CONTACT ---------- */

function viewAbout(){
  const s = DB.s;
  return `${navHTML("/about")}
  <main>
    <section class="v-hero" style="height:clamp(52vh,66vh,700px)">
      <div data-par="110">${frameSVG({kind:"side",env:"mtkenya",body:"Wagon",seed:"about",alt:"Mount Kenya road"})}</div>
      <div class="v-hero-scrim"></div>
      <div class="v-hero-in"><div style="max-width:var(--maxw);margin:0 auto">
        <span class="tag">About ${esc(s.dealership)}</span>
        <h1 class="h-1" style="margin:12px 0 0;max-width:16ch" data-split data-stagger="0.08">More than a car. It's the journey.</h1>
      </div></div>
    </section>

    <section class="section"><div class="wrap split">
      <div class="rv"><span class="tag">Who we are</span>
        <h2 class="h-2" style="margin:14px 0 18px">One make, done properly</h2>
        <p class="lede">${esc(s.aboutLead)}</p>
        <p class="lede">We are a small team on ${esc(s.address)}. We buy, inspect, prepare and sell Subaru — nothing else — and we have done it long enough to know which cars to walk away from.</p>
      </div>
      <div class="split-media rv">${frameSVG({kind:"detail",env:"ngong",seed:"about2",alt:"Body detail"})}</div>
    </div></section>

    <section class="section section--tight" style="background:var(--charcoal);border-block:1px solid var(--rule)">
      <div class="wrap">
        <div class="sec-head rv"><div><span class="tag">How a car reaches this website</span>
          <h2 class="h-1" style="margin-top:12px">The selection process</h2></div></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(250px,1fr))">
          ${[["Sourced","We buy from importers we have used for years, and we reject more cars than we accept. Auction sheets are read before anything is shipped."],
             ["Inspected","Every car goes on the lift. Compression, underbody, subframes, CVT behaviour from cold, and a full electronics scan."],
             ["Prepared","Service brought up to date, tyres assessed honestly, and anything we would fix for ourselves fixed before listing."],
             ["Listed","Photographed, specified and priced in Kenyan Shillings. What you read on the page is what the car is."]
            ].map((x,i)=>`<div class="rv" style="border-top:1px solid var(--rule-strong);padding-top:20px">
              <div class="tag num">Step ${i+1}</div>
              <h3 class="h-3" style="margin:12px 0 10px">${x[0]}</h3>
              <p class="muted" style="font-size:.94rem;margin:0">${x[1]}</p></div>`).join("")}
        </div>
      </div>
    </section>

    <section class="section"><div class="wrap split">
      <div class="split-media rv" style="order:2">${frameSVG({kind:"interior",env:"sheriff",seed:"about3",alt:"Interior"})}</div>
      <div class="rv"><span class="tag">Why Subaru</span>
        <h2 class="h-2" style="margin:14px 0 18px">Because the road here is not consistent</h2>
        <p class="lede">A flat engine sitting low and a driveshaft running straight down the centre is not marketing. It is a layout that keeps a car composed when the surface changes underneath it — which, between Nairobi and almost anywhere, it will.</p>
        <p class="lede">Add a boxer's service record when it is kept, a boot that takes a family's worth of luggage, and parts that are genuinely available in Kenya, and the argument makes itself.</p>
        <div class="btn-row"><a class="btn btn--solid" href="#/cars">Explore the collection</a></div>
      </div>
    </div></section>
  </main>${footHTML()}`;
}

function viewContact(){
  const s = DB.s;
  return `${navHTML("/contact")}
  <main class="page-top"><div class="wrap">
    <span class="tag">Contact</span>
    <h1 class="h-1" style="margin:14px 0 16px" data-split>Come and see the cars</h1>
    <p class="lede" style="margin-bottom:44px">Call, message on WhatsApp, or send the form. We answer WhatsApp fastest.</p>
    <div class="split" style="align-items:start">
      <div class="rv">
        <dl class="specs" style="grid-template-columns:1fr 1fr">
          <div class="spec"><dt>Phone</dt><dd><a href="tel:${esc(s.phone.replace(/\s/g,""))}">${esc(s.phone)}</a></dd></div>
          <div class="spec"><dt>WhatsApp</dt><dd><a href="${waLink()}" target="_blank" rel="noopener">+${esc(String(s.whatsapp).replace(/[^0-9]/g,""))}</a></dd></div>
          <div class="spec"><dt>Email</dt><dd><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></dd></div>
          <div class="spec"><dt>Location</dt><dd>${esc(s.address)}</dd></div>
        </dl>
        <div class="spec" style="border-bottom:1px solid var(--rule)"><dt>Business hours</dt><dd>${esc(s.hours)}</dd></div>
        <div class="btn-row" style="margin-top:28px">
          <a class="btn btn--wa" href="${waLink()}" target="_blank" rel="noopener">Chat on WhatsApp</a>
          ${s.mapUrl?`<a class="btn" href="${esc(s.mapUrl)}" target="_blank" rel="noopener">Open in Maps</a>`:""}
        </div>
        <div class="split-media rv" style="margin-top:34px;aspect-ratio:16/9">
          ${frameSVG({kind:"landscape",env:"nairobi",seed:"contactmap",alt:"Nairobi"})}
        </div>
      </div>
      <div class="rv" style="background:var(--charcoal);border:1px solid var(--rule);padding:clamp(20px,3vw,32px)">
        <span class="tag">Send a message</span>
        <h2 class="h-3" style="margin:12px 0 20px">Tell us what you're looking for</h2>
        <form id="c-form" class="form-grid">
          <div class="field full"><label for="c-name">Your name</label><input id="c-name" required autocomplete="name"></div>
          <div class="field"><label for="c-phone">Phone</label><input id="c-phone" required type="tel" autocomplete="tel"></div>
          <div class="field"><label for="c-email">Email</label><input id="c-email" type="email" autocomplete="email"></div>
          <div class="field full"><label for="c-car">Vehicle of interest</label>
            <select id="c-car"><option value="">General enquiry</option>
              ${DB.available().map(c=>`<option value="${esc(c.id)}">${esc(c.year+" Subaru "+c.model+" "+(c.variant||""))} — ${ksh(c.price)}</option>`).join("")}
            </select></div>
          <div class="field full"><label for="c-msg">Message</label><textarea id="c-msg" required></textarea></div>
          <div class="full"><button class="btn btn--solid" type="submit" id="c-send" style="width:100%">Send message</button></div>
        </form>
      </div>
    </div>
    <div style="height:clamp(60px,9vw,120px)"></div>
  </div></main>${footHTML()}`;
}

function mountContact(){
  const f = $("#c-form"); if(!f) return;
  f.addEventListener("submit", async e=>{
    e.preventDefault();
    const btn = $("#c-send"); btn.disabled = true; btn.textContent = "Sending…";
    const carId = $("#c-car").value;
    const car = carId ? DB.car(carId) : null;
    try{
      await DB.put("inquiries", "inq-" + uid(), {
        name:$("#c-name").value.trim(), phone:$("#c-phone").value.trim(),
        email:$("#c-email").value.trim(), message:$("#c-msg").value.trim(),
        carId: car?car.id:null,
        carLabel: car?`${car.year} Subaru ${car.model} ${car.variant||""}`.trim():"General enquiry",
        price: car?car.price:null, status:"NEW", createdAt:new Date().toISOString()
      });
      f.reset(); btn.disabled = false; btn.textContent = "Send message";
      toast("Message sent — we'll be in touch");
    }catch(err){
      btn.disabled = false; btn.textContent = "Send message";
      toast("Message didn't send. Try WhatsApp or call us.", true);
    }
  });
}

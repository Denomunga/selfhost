"use strict";
/* Scroll engine — smooth scroll, pinned chapters, parallax, cursor, preloader. */

const REDUCED = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const COARSE  = () => window.matchMedia("(pointer: coarse)").matches;
const clamp   = (v,a,b) => v < a ? a : v > b ? b : v;
const lerp    = (a,b,t) => a + (b-a)*t;

/* --- smooth scroll: the page still scrolls natively, we just weight it --- */
const Smooth = {
  on:false, target:0, cur:0,
  init(){
    if(REDUCED() || COARSE()) return;
    this.on = true; this.target = this.cur = window.scrollY;
    window.addEventListener("wheel", e => {
      if(e.ctrlKey) return;
      const t = e.target;
      // never fight a scrollable panel the user is actually inside
      if(t && t.closest && t.closest(".modal,.gal-strip,.tbl-wrap,.feat-picker,.menu,.srch-drop,.sb,.sb-nav,.adm-shell,#sb")) return;
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      this.target = clamp(this.target + d, 0, this.max());
    }, {passive:false});
    window.addEventListener("scroll", () => {
      // something other than us moved the page (keyboard, scrollbar, anchor)
      if(Math.abs(window.scrollY - this.cur) > 3){ this.target = this.cur = window.scrollY; }
    }, {passive:true});
    window.addEventListener("resize", () => { this.target = clamp(this.target, 0, this.max()); });
  },
  max(){ return Math.max(0, document.documentElement.scrollHeight - window.innerHeight); },
  jump(y){ this.target = this.cur = y; window.scrollTo(0, y); },
  tick(){
    if(!this.on) return;
    const d = this.target - this.cur;
    if(Math.abs(d) < 0.35){ if(this.cur !== this.target){ this.cur = this.target; window.scrollTo(0, this.cur); } return; }
    const factor = clamp(0.088 + Math.abs(d) * 0.000035, 0.088, 0.125);
    this.cur = lerp(this.cur, this.target, factor);
    window.scrollTo(0, this.cur);
  }
};

/* --- the timeline --- */
const FX = {
  items:[], raf:0, vh:window.innerHeight, scoped:0,
  add(el, fn){ if(el) this.items.push({el, fn}); },
  clear(){ this.items.length = 0; this.scoped = 0; document.body.classList.remove("scope"); },
  start(){
    if(this.raf) return;
    const loop = () => {
      Smooth.tick();
      this.vh = window.innerHeight;
      let scoped = 0;
      for(let i = 0; i < this.items.length; i++){
        const it = this.items[i];
        if(!it.el.isConnected) continue;
        const r = it.el.getBoundingClientRect();
        if(r.bottom < -600 || r.top > this.vh + 600) continue;   // off-screen: skip the work
        if(it.fn(r, this.vh) === "scope") scoped++;
      }
      if(scoped !== this.scoped){
        this.scoped = scoped;
        document.body.classList.toggle("scope", scoped > 0);
      }
      const p = $("#prog");
      if(p){
        const m = Math.max(1, document.documentElement.scrollHeight - this.vh);
        p.style.width = (clamp(window.scrollY / m, 0, 1) * 100).toFixed(2) + "%";
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
};

/** Progress through a pinned stage: 0 as it locks, 1 as it releases. */
const stageP = (r, vh) => clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
/** Progress across the viewport: 0 entering from below, 1 leaving the top. */
const viewP  = (r, vh) => clamp((vh - r.top) / (vh + r.height), 0, 1);

/* --- split text into per-word masks --- */
function splitWords(el, stagger){
  if(!el || el.dataset.split) return;
  el.dataset.split = "1";
  const words = (el.textContent || "").trim().split(/\s+/);
  el.textContent = "";
  words.forEach((w, i) => {
    const outer = document.createElement("span");
    outer.className = "ln";
    const inner = document.createElement("span");
    inner.textContent = w;
    inner.style.transitionDelay = ((stagger == null ? 0.065 : stagger) * i).toFixed(3) + "s";
    outer.appendChild(inner);
    el.appendChild(outer);
    el.appendChild(document.createTextNode(" "));
  });
}

function revealOn(root){
  const els = $$(".ln,.fade-up,.rv", root || document);
  if(!("IntersectionObserver" in window)){
    els.forEach(e => e.classList.add("in")); return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); } });
  }, {rootMargin:"0px 0px -10% 0px", threshold:0.12});
  els.forEach(e => io.observe(e));
  observers.push(io);
}

/* --- odometer counters --- */
function countUp(el){
  const to = Number(el.dataset.count || 0), dur = 1500, t0 = performance.now();
  const prefix = el.dataset.prefix || "", suffix = el.dataset.suffix || "";
  const step = now => {
    const p = clamp((now - t0) / dur, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + Math.round(to * eased).toLocaleString("en-KE") + suffix;
    if(p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function mountCounters(root){
  const els = $$("[data-count]", root || document);
  if(!("IntersectionObserver" in window)){ els.forEach(countUp); return; }
  const io = new IntersectionObserver(en => {
    en.forEach(e => { if(e.isIntersecting){ countUp(e.target); io.unobserve(e.target); } });
  }, {threshold:0.4});
  els.forEach(e => io.observe(e));
  observers.push(io);
}

/* --- procedural mechanical audio ambiance (default off) --- */
const AudioFX = {
  ctx: null, on: false, humGain: null, droneOscs: null,
  init(){
    const pill = $("#sound-pill"), state = $("#sound-state");
    if(!pill || pill.dataset.wired) return;
    pill.dataset.wired = "1";
    pill.addEventListener("click", () => this.toggle());
    document.addEventListener("click", e => {
      if(this.on && e.target && e.target.closest && e.target.closest("a,button,.tile,.rail-card,.card,.model-chip,.cat-chip")) {
        this.click();
      }
    });
  },
  ensure(){
    if(!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC) this.ctx = new AC();
    }
    if(this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  toggle(){
    this.ensure();
    this.on = !this.on;
    const pill = $("#sound-pill"), state = $("#sound-state");
    if(pill) pill.classList.toggle("on", this.on);
    if(state) state.textContent = this.on ? "SOUND ON" : "SOUND OFF";
    if(this.on) {
      this.click();
      this.startDrone();
    } else {
      this.stopDrone();
    }
  },
  click(){
    if(!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, this.ctx.currentTime + 0.024);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.024);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.026);
    } catch(e){}
  },
  startDrone(){
    if(!this.ctx || this.humGain) return;
    try {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      this.humGain = this.ctx.createGain();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(42, this.ctx.currentTime);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(84, this.ctx.currentTime);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(120, this.ctx.currentTime);
      this.humGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      this.humGain.gain.linearRampToValueAtTime(0.022, this.ctx.currentTime + 1.2);
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(this.humGain);
      this.humGain.connect(this.ctx.destination);
      osc1.start();
      osc2.start();
      this.droneOscs = [osc1, osc2];
    } catch(e){}
  },
  stopDrone(){
    if(this.humGain && this.ctx) {
      try {
        this.humGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.35);
        setTimeout(() => {
          if(this.droneOscs) this.droneOscs.forEach(o => { try{ o.stop(); }catch(e){} });
          this.humGain = null;
          this.droneOscs = null;
        }, 400);
      } catch(e){ this.humGain = null; }
    }
  }
};

/* --- custom cursor with contextual HUD labels --- */
let CUR = null;
const HOT = "a,button,.tile,.rail-card,.card,.story-card,.model-chip,.cat-chip,input,select,textarea,[role=button]";
function mountCursor(){
  if(COARSE() || REDUCED()) return;
  const ring = $("#cur"), dot = $("#cur-dot");
  if(!ring || !dot) return;
  if(!CUR){
    CUR = {mx:innerWidth/2, my:innerHeight/2, rx:innerWidth/2, ry:innerHeight/2, nx:0, ny:0, tnx:0, tny:0};
    document.body.classList.add("has-cursor");
    window.addEventListener("mousemove", e => {
      CUR.mx = e.clientX; CUR.my = e.clientY;
      CUR.tnx = ((e.clientX / window.innerWidth) - 0.5) * 2;
      CUR.tny = ((e.clientY / window.innerHeight) - 0.5) * 2;
      dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    }, {passive:true});
    document.addEventListener("mouseover", e => {
      const t = e.target;
      if(!t || !t.closest) return;
      if(t.closest(HOT)) document.body.classList.add("cur-hot");
      const label = $("#cur-label");
      if(!label) return;
      if(t.closest(".shot,.viewfinder")){
        label.textContent = "SPEC";
        document.body.classList.add("cur-labeled");
      } else if(t.closest(".rail-card,.tile,.card")){
        label.textContent = "EXPLORE";
        document.body.classList.add("cur-labeled");
      } else if(t.closest(".btn--wa")){
        label.textContent = "CHAT";
        document.body.classList.add("cur-labeled");
      } else {
        document.body.classList.remove("cur-labeled");
      }
    });
    document.addEventListener("mouseout", e => {
      if(e.target.closest && e.target.closest(HOT)){
        document.body.classList.remove("cur-hot", "cur-labeled");
      }
    });
    AudioFX.init();
    mountHoloTilt();
  }
  FX.add(ring, () => {
    CUR.rx = lerp(CUR.rx, CUR.mx, 0.16); CUR.ry = lerp(CUR.ry, CUR.my, 0.16);
    CUR.nx = lerp(CUR.nx, CUR.tnx, 0.08); CUR.ny = lerp(CUR.ny, CUR.tny, 0.08);
    ring.style.transform = `translate(${CUR.rx.toFixed(1)}px,${CUR.ry.toFixed(1)}px)`;
  });
}

/* --- holographic specular glare & 3D tilt --- */
let TILT_MOUNTED = false;
function mountHoloTilt(){
  if(TILT_MOUNTED) return;
  TILT_MOUNTED = true;
  let activeCard = null;

  document.addEventListener("mousemove", e => {
    if(COARSE() || REDUCED()) return;
    const card = e.target && e.target.closest && e.target.closest(".card, .tile, .morph-card, .shot");
    if(!card){
      if(activeCard){
        activeCard.style.transform = "";
        activeCard.style.setProperty("--ga", "0");
        activeCard = null;
      }
      return;
    }
    activeCard = card;
    const r = card.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width, 0, 1);
    const py = clamp((e.clientY - r.top) / r.height, 0, 1);
    const rx = (-(py - 0.5) * 12).toFixed(2);
    const ry = ((px - 0.5) * 12).toFixed(2);
    
    // Do not override .shot or .morph-card's own scroll transform
    if(!card.classList.contains("shot") && !card.classList.contains("morph-card")){
      card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(6px)`;
    }
    card.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
    card.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
    card.style.setProperty("--ga", "0.65");
  }, {passive:true});

  document.addEventListener("mouseleave", () => {
    if(activeCard){
      activeCard.style.transform = "";
      activeCard.style.setProperty("--ga", "0");
      activeCard = null;
    }
  });
}

/* --- precision specification ruler --- */
const SPEC_METRICS = {
  clearance: { title: "Ground Clearance", val: 220, unit: " mm", min: 160, max: 260, step: 2, totalTicks: 51 },
  power: { title: "Boxer Turbo Power", val: 260, unit: " HP", min: 140, max: 320, step: 5, totalTicks: 37 },
  awd: { title: "AWD Torque Split", val: 60, unit: " % Front", min: 40, max: 80, step: 1, totalTicks: 41 },
  cargo: { title: "Boot Cargo Volume", val: 522, unit: " Litres", min: 380, max: 1800, step: 25, totalTicks: 58 },
  economy: { title: "Highway Fuel Economy", val: 7.3, unit: " L / 100km", min: 5.5, max: 12.0, step: 0.1, totalTicks: 66 }
};
let currentMetricKey = "clearance";

function renderRulerTicks(metricKey) {
  const container = $("#ruler-ticks");
  if(!container) return;
  const cfg = SPEC_METRICS[metricKey] || SPEC_METRICS.clearance;
  let html = "";
  for(let i = 0; i < cfg.totalTicks; i++){
    const isFifth = (i % 5 === 0);
    const isTenth = (i % 10 === 0);
    const cls = isTenth ? "l" : (isFifth ? "m" : "s");
    html += `<span class="ruler-tick ${cls}"></span>`;
  }
  container.innerHTML = html;
}

function mountSpecRuler() {
  const wrap = $("#ruler-tape-wrap");
  const ticks = $("#ruler-ticks");
  const valEl = $("#ruler-metric-val");
  const titleEl = $("#ruler-metric-title");
  if(!wrap || !ticks) return;

  renderRulerTicks(currentMetricKey);

  let isDragging = false, startX = 0, currentOffset = 0, targetOffset = 0;
  const cfg = () => SPEC_METRICS[currentMetricKey] || SPEC_METRICS.clearance;

  const updateReadout = () => {
    const c = cfg();
    const maxOffset = Math.max(1, ticks.scrollWidth - wrap.clientWidth);
    const p = clamp(-targetOffset / maxOffset, 0, 1);
    const range = c.max - c.min;
    const computedVal = c.min + p * range;
    const displayVal = c.step < 1 ? computedVal.toFixed(1) : Math.round(computedVal);
    if(valEl) valEl.textContent = displayVal + c.unit;
    if(titleEl) titleEl.textContent = c.title;
  };

  const setMetric = (key) => {
    currentMetricKey = key;
    renderRulerTicks(key);
    const c = cfg();
    const p = clamp((c.val - c.min) / (c.max - c.min), 0, 1);
    const maxOffset = Math.max(1, ticks.scrollWidth - wrap.clientWidth);
    targetOffset = currentOffset = -p * maxOffset;
    ticks.style.transform = `translate3d(${currentOffset.toFixed(1)}px,0,0)`;
    updateReadout();
    $$(".ruler-tab").forEach(tab => tab.classList.toggle("on", tab.dataset.metric === key));
  };

  $$(".ruler-tab").forEach(tab => {
    tab.onclick = () => setMetric(tab.dataset.metric);
  });

  const onDragStart = (cx) => {
    isDragging = true;
    startX = cx - targetOffset;
  };
  const onDragMove = (cx) => {
    if(!isDragging) return;
    const maxOffset = Math.max(1, ticks.scrollWidth - wrap.clientWidth);
    targetOffset = clamp(cx - startX, -maxOffset, 0);
    currentOffset = targetOffset;
    ticks.style.transform = `translate3d(${currentOffset.toFixed(1)}px,0,0)`;
    updateReadout();
  };
  const onDragEnd = () => { isDragging = false; };

  wrap.onmousedown = (e) => onDragStart(e.clientX);
  window.addEventListener("mousemove", (e) => onDragMove(e.clientX), {passive:true});
  window.addEventListener("mouseup", onDragEnd);

  wrap.ontouchstart = (e) => { if(e.touches && e.touches[0]) onDragStart(e.touches[0].clientX); };
  wrap.ontouchmove = (e) => { if(e.touches && e.touches[0]) onDragMove(e.touches[0].clientX); };
  wrap.ontouchend = onDragEnd;

  setMetric(currentMetricKey);
}

/* --- page reveal --- */
function runPreloader(){
  const pre = $("#pre"), fill = $("#pre-fill"), pct = $("#pre-pct"), mark = $("#pre-mark");
  if(!pre) return;
  if(mark) mark.innerHTML = markSubaru(54);
  if(REDUCED()){
    pre.classList.add("done"); document.body.classList.add("shutters-open"); return;
  }
  let v = 0;
  const t = setInterval(() => {
    v = Math.min(100, v + 9 + Math.random()*16);
    if(fill) fill.style.width = v + "%";
    if(pct) pct.textContent = String(Math.round(v)).padStart(2,"0");
    if(v >= 100){
      clearInterval(t);
      setTimeout(() => {
        pre.classList.add("done");
        document.body.classList.add("shutters-open");
      }, 420);
    }
  }, 165);
}

/* --- per-section wiring, called after each render --- */
function mountCinema(){
  // hero — depth planes + volumetric rays + embers
  $$(".cine").forEach(stage => {
    const planes   = $$(".plane",     stage);
    const beams    = $$(".ray-beam",  stage);
    const raysWrap = $(".hero-rays",  stage);
    const copy     = $(".cine-copy",  stage);
    const cue      = $(".cue",        stage);

    FX.add(stage, (r, vh) => {
      const p    = stageP(r, vh);
      const nx   = CUR ? CUR.nx : 0;   // -1 … +1 normalised cursor X
      const ny   = CUR ? CUR.ny : 0;   // -1 … +1 normalised cursor Y
      const rotY = (nx * 2.8).toFixed(2);
      const rotX = (-ny * 2.0).toFixed(2);

      // 3-plane depth parallax with gyroscopic tilt
      planes.forEach(pl => {
        const d = parseFloat(pl.dataset.depth || 0.2);
        pl.style.transform = `translate3d(${(nx * d * 18).toFixed(1)}px,${(-p * vh * d * 0.85 + ny * d * 12).toFixed(1)}px,0) rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${(1 + p * d * 0.22).toFixed(4)})`;
      });

      // Volumetric ray canopy — cursor sway + scroll fade
      if(raysWrap){
        const rayOpacity = clamp(0.82 - p * 1.6, 0, 0.82);
        raysWrap.style.opacity = rayOpacity.toFixed(3);
      }
      beams.forEach((beam, i) => {
        // Each beam gets its own spin so they splay naturally
        const baseRot  = parseFloat(beam.style.transform.match(/rotate\(([^)]+)deg\)/)?.[1] || "0");
        const sway     = (nx * (i % 2 === 0 ? 4.5 : -3.8)).toFixed(2);
        beam.style.transform = `rotate(${(baseRot + parseFloat(sway)).toFixed(2)}deg)`;
        beam.style.opacity   = clamp(0.35 + nx * (i % 2 === 0 ? 0.18 : -0.12), 0.1, 0.7).toFixed(3);
      });

      // Copy drift + fade
      if(copy){
        copy.style.transform = `translate3d(0,${(-p * 180).toFixed(1)}px,0)`;
        copy.style.opacity   = String(clamp(1 - p * 1.9, 0, 1));
      }
      if(cue) cue.style.opacity = String(clamp(1 - p * 4, 0, 1));

      return p > 0.02 && p < 0.99 ? "scope" : null;
    });
  });

  // chapter curtains — the veil peels up, the plate drifts
  $$(".chap").forEach(ch => {
    const veil = $(".veil", ch), inn = $(".chap-in", ch), bg = $(".chap-bg", ch);
    FX.add(ch, (r, vh) => {
      const p = viewP(r, vh);
      if(veil) veil.style.transform = `translate3d(0,${(-clamp((p - 0.18) * 2.6, 0, 1) * 100).toFixed(2)}%,0)`;
      if(bg)  bg.style.transform  = `translate3d(0,${((p - 0.5) * -110).toFixed(1)}px,0) scale(1.08)`;
      if(inn){
        inn.style.transform = `translate3d(0,${((p - 0.5) * -80).toFixed(1)}px,0)`;
        inn.style.opacity = String(clamp(1 - Math.abs(p - 0.5) * 2.4, 0, 1));
      }
    });
  });

  // Chapter 01 page turns: dossier sheet, chapter still, featured car.
  $$(".stage").forEach(stage => {
    const titlePage = $(".book-sheet--title", stage);
    const imagePage = $(".book-sheet--image", stage);
    if(!titlePage || !imagePage) return;

    FX.add(stage, (r, vh) => {
      const p = stageP(r, vh);

      const turn = (start, end) => {
        const t = clamp((p - start) / (end - start), 0, 1);
        return t * t * (3 - 2 * t);
      };
      const setTurn = (page, amount) => {
        if(!page) return;
        const angle = -154 * amount;
        const lift = 42 * amount;
        page.style.transform = `rotateY(${angle.toFixed(2)}deg) rotateX(${lift.toFixed(2)}deg) translateZ(${(amount * -70).toFixed(1)}px)`;
      };
      setTurn(titlePage, turn(0.06, 0.24));
      setTurn(imagePage, turn(0.50, 0.94));

      return p > 0.04 && p < 0.98 ? "scope" : null;
    });
  });

  // warp depth tunnel: concentric 3D frames surge towards camera
  $$(".warp-portal").forEach(portal => {
    const halo = $(".warp-halo", portal);
    const flash = $(".warp-flash", portal);
    const label = $(".warp-label", portal);
    const frames = $$(".warp-frame", portal);
    const beams = $$(".warp-beam", portal);
    FX.add(portal, (r, vh) => {
      const p = stageP(r, vh);
      if(halo){
        const hs = lerp(0.4, 2.2, p);
        const ho = clamp(Math.sin(p * Math.PI) * 0.85, 0, 0.85);
        halo.style.transform = `translate(-50%, -50%) scale(${hs.toFixed(3)})`;
        halo.style.opacity = String(ho.toFixed(3));
      }
      if(label){
        const ls = lerp(0.7, 1.25, p);
        const lo = p < 0.2 ? p / 0.2 : (p > 0.78 ? clamp(1 - (p - 0.78) / 0.16, 0, 1) : 1);
        label.style.transform = `scale(${ls.toFixed(3)})`;
        label.style.opacity = String(lo.toFixed(3));
      }
      frames.forEach((f, i) => {
        const offset = i * 0.11;
        const progress = clamp((p - offset) / 0.65, 0, 1);
        const s = lerp(0.12, 3.4, Math.pow(progress, 2.2));
        const o = progress <= 0 ? 0 : (progress < 0.4 ? progress / 0.4 : (progress > 0.85 ? clamp(1 - (progress - 0.85) / 0.15, 0, 1) : 0.95 - i * 0.08));
        f.style.transform = `scale(${s.toFixed(4)})`;
        f.style.opacity = String(o.toFixed(3));
      });
      beams.forEach((b, i) => {
        const bo = clamp(Math.sin((p + i * 0.15) * Math.PI) * 0.45, 0, 0.45);
        b.style.opacity = String(bo.toFixed(3));
      });
      if(flash){
        const fo = p > 0.82 && p < 0.96 ? clamp((p - 0.82) / 0.07, 0, 1) * (p > 0.89 ? clamp(1 - (p - 0.89) / 0.07, 0, 1) : 1) : 0;
        flash.style.opacity = String(fo.toFixed(3));
      }
      return p > 0.02 && p < 0.98 ? "scope" : null;
    });
  });

  // 4-phase morphing fleet carousel: scatter -> line -> 3D cylindrical orbit -> dock
  $$(".fleet-morph").forEach(morph => {
    const cards = $$(".morph-card", morph);
    const dots = $$(".mph-dot", morph);
    const n = cards.length;
    if(!n) return;

    const scatter = cards.map((_, i) => ({
      x: ((i % 2 === 0 ? 1 : -1) * (180 + (i * 73) % 260)),
      y: ((i % 3 === 0 ? -1 : 1) * (80 + (i * 59) % 180)),
      z: -120 + (i * 45) % 180,
      rotX: -15 + (i * 12) % 30,
      rotY: -25 + (i * 19) % 50,
      rotZ: -8 + (i * 7) % 16,
    }));

    FX.add(morph, (r, vh) => {
      const p = stageP(r, vh);

      let activePhase = 0;
      if(p > 0.82) activePhase = 3;
      else if(p > 0.44) activePhase = 2;
      else if(p > 0.22) activePhase = 1;
      dots.forEach((d, i) => d.classList.toggle("on", i === activePhase));

      const orbitRot = ((p - 0.44) / 0.38) * 360;

      cards.forEach((card, i) => {
        let x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, op = 1;

        if(p <= 0.22){
          const t = clamp(p / 0.22, 0, 1);
          const ease = t * t;
          const sc = scatter[i];
          const lineX = (i - (n - 1) / 2) * clamp(vh * 0.24, 180, 280);
          x = lerp(sc.x, lineX, ease);
          y = lerp(sc.y, 0, ease);
          z = lerp(sc.z, 0, ease);
          rx = lerp(sc.rotX, 0, ease);
          ry = lerp(sc.rotY, 0, ease);
          rz = lerp(sc.rotZ, 0, ease);
          s = lerp(0.82, 0.95, ease);
          op = lerp(0.65, 1, ease);
        } else if(p <= 0.44){
          const t = clamp((p - 0.22) / 0.22, 0, 1);
          const ease = t * t * (3 - 2 * t);
          const lineX = (i - (n - 1) / 2) * clamp(vh * 0.24, 180, 280);
          const angle = (i / n) * Math.PI * 2;
          const radius = clamp(window.innerWidth * 0.34, 250, 460);
          const circleX = Math.sin(angle) * radius;
          const circleZ = Math.cos(angle) * radius - radius * 0.4;
          const circleRY = (angle * 180) / Math.PI;

          x = lerp(lineX, circleX, ease);
          y = 0;
          z = lerp(0, circleZ, ease);
          rx = 0;
          ry = lerp(0, circleRY, ease);
          rz = 0;
          s = 0.95;
        } else if(p <= 0.82){
          const radius = clamp(window.innerWidth * 0.34, 250, 460);
          const baseAngle = (i / n) * Math.PI * 2;
          const currentAngle = baseAngle + (orbitRot * Math.PI) / 180;
          x = Math.sin(currentAngle) * radius;
          z = Math.cos(currentAngle) * radius - radius * 0.3;
          ry = (currentAngle * 180) / Math.PI;
          y = Math.sin(currentAngle * 2) * 16;
          const depthNorm = (z + radius) / (radius * 2);
          s = lerp(0.8, 1.08, clamp(depthNorm, 0, 1));
          op = lerp(0.45, 1, clamp(depthNorm, 0, 1));
        } else {
          const t = clamp((p - 0.82) / 0.18, 0, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          const dockSpacing = clamp(window.innerWidth * 0.14, 110, 170);
          const dockX = (i - (n - 1) / 2) * dockSpacing;
          const dockY = lerp(0, vh * 0.24, ease);
          const dockS = lerp(0.95, 0.65, ease);
          const radius = clamp(window.innerWidth * 0.34, 250, 460);
          const baseAngle = (i / n) * Math.PI * 2;
          const endAngle = baseAngle + 2 * Math.PI;
          const startX = Math.sin(endAngle) * radius;
          const startZ = Math.cos(endAngle) * radius - radius * 0.3;

          x = lerp(startX, dockX, ease);
          y = dockY;
          z = lerp(startZ, 0, ease);
          rx = 0;
          ry = lerp(0, 0, ease);
          rz = 0;
          s = dockS;
          op = 1;
        }

        card.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg) scale(${s.toFixed(3)})`;
        card.style.opacity = String(op.toFixed(2));
      });

      return p > 0.04 && p < 0.96 ? "scope" : null;
    });

    cards.forEach(c => {
      c.addEventListener("click", () => c.classList.toggle("flipped"));
    });
  });

  // horizontal rails, counter-running
  $$(".rail").forEach(rail => {
    const dir = Number(rail.dataset.dir || 1), span = Number(rail.dataset.span || 320);
    FX.add(rail, (r, vh) => {
      const p = viewP(r, vh) - 0.5;
      rail.style.transform = `translate3d(${(-p * span * dir).toFixed(1)}px,0,0)`;
    });
  });

  // camera focus-pull grid: optical lens blur when far from center, snapping into tack-sharp clarity at screen center
  $$(".tile").forEach((tile, i) => {
    const odd = i % 3;
    FX.add(tile, (r, vh) => {
      const c = (r.top + r.height/2 - vh/2) / (vh * 0.55);
      const k = clamp(c, -1, 1);
      const absK = Math.abs(k);
      const tilt = k * (8 + odd * 2);
      const blur = clamp((absK - 0.16) * 6.5, 0, 5.5);
      const bright = clamp(1 - absK * 0.42, 0.58, 1);
      const contrast = clamp(1 + absK * 0.28, 1, 1.28);
      const tz = clamp(absK * 90, 0, 90);

      tile.style.transform = `translate3d(0,${(k * (odd - 1) * 28).toFixed(1)}px,${(-tz).toFixed(1)}px) rotateX(${tilt.toFixed(2)}deg) rotateY(${(k * (odd - 1) * 3.5).toFixed(2)}deg)`;
      tile.style.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px) brightness(${bright.toFixed(3)}) contrast(${contrast.toFixed(3)})` : "";
    });
  });

  // specification ruler gauge
  mountSpecRuler();

  // cinematic theater split reveal (Chapter 03 — Kenyan Roads)
  $$(".roads-reveal").forEach(rr => {
    const left = $(".roads-shutter.left", rr);
    const right = $(".roads-shutter.right", rr);
    const bg = $(".roads-bg", rr);
    const content = $(".roads-content", rr);
    FX.add(rr, (r, vh) => {
      const p = stageP(r, vh);

      // Shutters part like monolithic theater doors
      if(left && right){
        const sp = clamp((p - 0.1) / 0.62, 0, 1);
        const ease = sp < 0.5 ? 2 * sp * sp : 1 - Math.pow(-2 * sp + 2, 2) / 2;
        left.style.transform = `translate3d(${(-ease * 101).toFixed(2)}%,0,0)`;
        right.style.transform = `translate3d(${(ease * 101).toFixed(2)}%,0,0)`;
      }

      // Background terrain drifts and scales down to focus
      if(bg){
        const bs = lerp(1.18, 1.04, p);
        const by = lerp(35, -45, p);
        bg.style.transform = `translate3d(0,${by.toFixed(1)}px,0) scale(${bs.toFixed(3)})`;
      }

      // Centerpiece content with route telemetry
      if(content){
        const cp = clamp((p - 0.16) / 0.48, 0, 1);
        const ease = 1 - Math.pow(1 - cp, 3);
        const s = lerp(0.88, 1.04, ease);
        const op = p < 0.16 ? 0 : (p > 0.82 ? clamp(1 - (p - 0.82) / 0.16, 0, 1) : ease);
        content.style.transform = `scale(${s.toFixed(3)})`;
        content.style.opacity = String(op.toFixed(2));
      }

      return p > 0.04 && p < 0.96 ? "scope" : null;
    });
  });

  // zoom parallax: seven plates, dynamic depth of field
  $$(".zoom").forEach(z => {
    const frames = $$(".zf", z);
    const rates = [4.2, 5.4, 6.4, 5.0, 6.9, 8.2, 7.4];
    FX.add(z, (r, vh) => {
      const p = stageP(r, vh);
      const ease = p * p;
      frames.forEach((f, i) => {
        const s = 1 + ease * (rates[i % rates.length] - 1);
        const b = clamp((s - 2.2) * 1.6, 0, 7);
        f.style.transform = `scale(${s.toFixed(4)})`;
        f.style.filter = b > 0.3 ? `blur(${b.toFixed(1)}px)` : "";
      });
      return p > 0.04 && p < 0.96 ? "scope" : null;
    });
  });

  // marquee, driven by scroll position rather than a timer
  $$(".marq").forEach(m => {
    const inner = $(".marq-in", m);
    if(!inner) return;
    FX.add(m, (r, vh) => {
      const p = viewP(r, vh);
      inner.style.transform = `translate3d(${(-p * (inner.scrollWidth / 2)).toFixed(1)}px,0,0)`;
    });
  });

  // closing frame
  $$(".outro").forEach(o => {
    const bg = $(".outro-bg", o), inn = $(".outro-in", o);
    FX.add(o, (r, vh) => {
      const p = stageP(r, vh);
      if(bg) bg.style.transform = `translate3d(0,${(-p * 90).toFixed(1)}px,0) scale(${(1.06 + p * 0.14).toFixed(4)})`;
      if(inn) inn.style.transform = `translate3d(0,${((0.5 - p) * 70).toFixed(1)}px,0)`;
    });
  });

  // vehicle page hero
  $$(".vcine").forEach(v => {
    const m = $(".vcine-media", v), c = $(".vcine-copy", v);
    FX.add(v, (r, vh) => {
      const p = stageP(r, vh);
      if(m) m.style.transform = `translate3d(0,${(p * 90).toFixed(1)}px,0) scale(${(1 + p * 0.12).toFixed(4)})`;
      if(c){
        c.style.transform = `translate3d(0,${(-p * 70).toFixed(1)}px,0)`;
        c.style.opacity = String(clamp(1 - p * 1.6, 0, 1));
      }
      return p > 0.05 && p < 0.9 ? "scope" : null;
    });
  });

  // generic parallax plate
  $$("[data-par]").forEach(el => {
    const amt = Number(el.dataset.par || 60);
    FX.add(el, (r, vh) => {
      const p = viewP(r, vh) - 0.5;
      el.style.transform = `translate3d(0,${(-p * amt).toFixed(1)}px,0) scale(1.08)`;
    });
  });

  // headlines split into masked words
  $$("[data-split]").forEach(h => splitWords(h, Number(h.dataset.stagger || 0.065)));

  FX.start();
}


/* ---------- 18. IDENTITY ----------
   Two locks, deliberately.

   LOCK 1 (the real one) is the platform's: the db rules published with
   this page say write:"admin" on every financial path, so the SERVER
   refuses a write from anyone who is not signed in with an authorized account.
   Nothing this file does can loosen that, and nothing a visitor edits
   in the page can get past it.

   LOCK 2 (this file) is the staff credential: a username and a
   PBKDF2-SHA256 password hash, so a shop terminal left open on the
   counter does not hand the dashboard to whoever walks past. It is a
   second lock on an already-locked door, never the only one.        */

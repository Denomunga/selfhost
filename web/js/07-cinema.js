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
      if(t && t.closest && t.closest(".modal,.gal-strip,.tbl-wrap,.feat-picker,.menu,.srch-drop")) return;
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
    this.cur = lerp(this.cur, this.target, 0.098);
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

/* --- custom cursor --- */
let CUR = null;
const HOT = "a,button,.tile,.rail-card,.card,.story-card,input,select,textarea,[role=button]";
function mountCursor(){
  if(COARSE() || REDUCED()) return;
  const ring = $("#cur"), dot = $("#cur-dot");
  if(!ring || !dot) return;
  if(!CUR){
    // listeners bind once for the life of the page; delegation means
    // anything rendered later gets the hover treatment for free
    CUR = {mx:innerWidth/2, my:innerHeight/2, rx:innerWidth/2, ry:innerHeight/2};
    document.body.classList.add("has-cursor");
    window.addEventListener("mousemove", e => {
      CUR.mx = e.clientX; CUR.my = e.clientY;
      dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    }, {passive:true});
    document.addEventListener("mouseover", e => {
      if(e.target.closest && e.target.closest(HOT)) document.body.classList.add("cur-hot");
    });
    document.addEventListener("mouseout", e => {
      if(e.target.closest && e.target.closest(HOT)) document.body.classList.remove("cur-hot");
    });
  }
  // the ring trails the dot on its own spring, inside the one loop.
  // re-registered every render because FX.clear() empties the timeline.
  FX.add(ring, () => {
    CUR.rx = lerp(CUR.rx, CUR.mx, 0.16); CUR.ry = lerp(CUR.ry, CUR.my, 0.16);
    ring.style.transform = `translate(${CUR.rx.toFixed(1)}px,${CUR.ry.toFixed(1)}px)`;
  });
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
  // hero depth planes
  $$(".cine").forEach(stage => {
    const planes = $$(".plane", stage), copy = $(".cine-copy", stage), cue = $(".cue", stage);
    FX.add(stage, (r, vh) => {
      const p = stageP(r, vh);
      planes.forEach(pl => {
        const d = parseFloat(pl.dataset.depth || 0.2);
        pl.style.transform = `translate3d(0,${(-p * vh * d * 0.85).toFixed(1)}px,0) scale(${(1 + p * d * 0.22).toFixed(4)})`;
      });
      if(copy){
        copy.style.transform = `translate3d(0,${(-p * 180).toFixed(1)}px,0)`;
        copy.style.opacity = String(clamp(1 - p * 1.9, 0, 1));
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

  // frame → fullscreen: a framed plate flattens out of perspective and fills the screen
  $$(".stage").forEach(stage => {
    const shot = $(".shot", stage), cap = $(".shot-cap", stage);
    FX.add(stage, (r, vh) => {
      const p = stageP(r, vh);
      const e = p < 0.72 ? p / 0.72 : 1;                       // growth finishes early, then holds
      const ease = 1 - Math.pow(1 - e, 3);
      if(shot){
        const w = lerp(38, 100, ease), h = lerp(42, 100, ease);
        shot.style.width = w.toFixed(2) + "vw";
        shot.style.height = h.toFixed(2) + "svh";
        shot.style.transform = `perspective(1400px) rotateX(${lerp(14, 0, ease).toFixed(2)}deg) translateY(${lerp(30, 0, ease).toFixed(1)}px)`;
        shot.style.borderColor = `rgba(255,255,255,${lerp(0.22, 0.02, ease).toFixed(3)})`;
      }
      if(cap){
        const o = clamp((p - 0.6) / 0.22, 0, 1);
        cap.style.opacity = String(o);
        cap.style.transform = `translate3d(0,${((1 - o) * 40).toFixed(1)}px,0)`;
      }
      return p > 0.06 && p < 0.97 ? "scope" : null;
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

  // tilted grid: each tile carries its own depth of field
  $$(".tile").forEach((tile, i) => {
    const odd = i % 3;
    FX.add(tile, (r, vh) => {
      const c = (r.top + r.height/2 - vh/2) / vh;             // -1 above, +1 below
      const k = clamp(c, -1, 1);
      const tilt = k * (7 + odd * 2.5);
      const blur = clamp(Math.abs(k) * 4.5 - 0.6, 0, 4.5);
      const bright = clamp(1 - Math.abs(k) * 0.52, 0.42, 1);
      tile.style.transform = `translate3d(0,${(k * (odd - 1) * 34).toFixed(1)}px,0) rotateX(${tilt.toFixed(2)}deg) rotateY(${(k * (odd - 1) * 4).toFixed(2)}deg)`;
      tile.style.filter = `blur(${blur.toFixed(2)}px) brightness(${bright.toFixed(3)})`;
    });
  });

  // zoom parallax: seven plates, one scroll arc, independent rates
  $$(".zoom").forEach(z => {
    const frames = $$(".zf", z);
    const rates = [4.2, 5.4, 6.4, 5.0, 6.9, 8.2, 7.4];
    FX.add(z, (r, vh) => {
      const p = stageP(r, vh);
      const ease = p * p;
      frames.forEach((f, i) => {
        f.style.transform = `scale(${(1 + ease * (rates[i % rates.length] - 1)).toFixed(4)})`;
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

"use strict";
/* Cinematography — generated Kenyan landscapes, vehicle and part artwork. */

const ENVS = {
  ngong:   {name:"Ngong Hills",       sky:["#0A0F1C","#3B2E4E","#A8543C","#F0A657"], ridge:["#2A2135","#17131F","#090810"],
            sun:[.74,.72,"#FFD8A0"], road:"#0B0D12", haze:"rgba(240,166,87,.34)", night:false, key:"#FFB463"},
  sheriff:    {name:"Great Rift Valley", sky:["#0A1622","#25485E","#6E8A82","#E4C489"], ridge:["#1C3038","#112026","#070F13"],
            sun:[.26,.70,"#F4DFB0"], road:"#10131A", haze:"rgba(228,196,137,.30)", night:false, key:"#F0D9A8"},
  nairobi: {name:"Nairobi",           sky:["#03050A","#0A1322","#16253F","#2E4670"], ridge:["#0E1728","#080E18","#04070C"],
            sun:[.60,.84,"#5C7FB8"], road:"#07090E", haze:"rgba(52,82,136,.34)", night:true,  key:"#7FA6E0"},
  highway: {name:"Kenyan Highway",    sky:["#1E4A70","#5B86A4","#9CB8C6","#E2EAEE"], ridge:["#3A5260","#26363F","#141F26"],
            sun:[.82,.66,"#FFFFFF"], road:"#13161B", haze:"rgba(226,234,238,.38)", night:false, key:"#FFFFFF"},
  mtkenya: {name:"Mount Kenya",       sky:["#061428","#1C4467","#5E92AE","#CFE4EC"], ridge:["#2B4A5E","#182F3E","#0A1720"],
            sun:[.32,.62,"#E8F3F8"], road:"#111722", haze:"rgba(207,228,236,.32)", night:false, key:"#DCEDF5"},
  coast:   {name:"Coastal Road",      sky:["#07222E","#165A66","#5AA79A","#FFD79B"], ridge:["#123B45","#0A272E","#041216"],
            sun:[.70,.74,"#FFE7B8"], road:"#0F1418", haze:"rgba(255,215,155,.32)", night:false, key:"#FFD79B"}
};
const ENV_KEYS = Object.keys(ENVS);

/* Vehicle side profiles, drawn in a 0 0 200 72 box, front facing right. */
const PROFILES = {
  SUV:{
    body:"M6,64 L6,34 C6,29 9,27 16,26 L40,24 L62,11 C66,8 71,7 78,7 L126,7 C134,7 139,9 143,13 L156,25 L182,29 C190,30 194,34 194,41 L194,64 Z",
    glass:"M60,24 L74,13 C77,10.5 81,10 86,10 L122,10 C128,10 132,11.5 135,15 L145,25 Z",
    crown:"M16,26 L40,24 L62,11 C66,8 71,7 78,7 L126,7 C134,7 139,9 143,13 L156,25",
    wheels:[[48,64,16],[152,64,16]], lamp:[188,38], roof:7
  },
  Wagon:{
    body:"M6,64 L6,38 C6,33 9,31 16,30 L36,28 L58,15 C62,12 67,11 74,11 L128,11 C136,11 141,13 145,17 L158,28 L184,32 C192,33 196,37 196,43 L196,64 Z",
    glass:"M56,28 L70,17 C73,14.5 77,14 82,14 L124,14 C130,14 134,15.5 137,19 L147,28 Z",
    crown:"M16,30 L36,28 L58,15 C62,12 67,11 74,11 L128,11 C136,11 141,13 145,17 L158,28",
    wheels:[[48,64,15],[154,64,15]], lamp:[190,40], roof:11
  },
  Sedan:{
    body:"M6,63 L6,45 C6,41 10,39 18,38 L44,35 L70,19 C75,16 80,15 88,15 L124,15 C132,15 137,17 141,21 L156,33 L182,37 C190,38 194,42 194,48 L194,63 Z",
    glass:"M68,34 L82,21 C85,18.5 89,18 94,18 L122,18 C128,18 132,19.5 135,23 L144,33 Z",
    crown:"M18,38 L44,35 L70,19 C75,16 80,15 88,15 L124,15 C132,15 137,17 141,21 L156,33",
    wheels:[[50,63,14],[152,63,14]], lamp:[188,45], roof:15
  },
  Hatchback:{
    body:"M8,63 L8,42 C8,37 11,35 18,34 L36,32 L58,18 C62,15 67,14 74,14 L120,14 C128,14 133,16 137,20 L152,32 L180,36 C188,37 192,41 192,47 L192,63 Z",
    glass:"M56,32 L70,20 C73,17.5 77,17 82,17 L116,17 C122,17 126,18.5 129,22 L139,32 Z",
    crown:"M18,34 L36,32 L58,18 C62,15 67,14 74,14 L120,14 C128,14 133,16 137,20 L152,32",
    wheels:[[48,63,14],[150,63,14]], lamp:[186,44], roof:14
  },
  Coupe:{
    body:"M6,63 L6,46 C6,42 10,40 18,39 L46,36 L76,22 C81,19 86,18 94,18 L120,18 C128,18 133,20 137,24 L154,35 L182,39 C190,40 194,44 194,50 L194,63 Z",
    glass:"M74,35 L88,24 C91,21.5 95,21 100,21 L118,21 C124,21 128,22.5 131,26 L140,35 Z",
    crown:"M18,39 L46,36 L76,22 C81,19 86,18 94,18 L120,18 C128,18 133,20 137,24 L154,35",
    wheels:[[50,63,14],[152,63,14]], lamp:[188,47], roof:18
  }
};
const profileFor = body => PROFILES[body] || PROFILES.SUV;

function ridgePath(rand, baseY, amp, W, H){
  const steps = 11, pts = [];
  for(let i=0;i<=steps;i++){
    const x = (W/steps)*i;
    const y = baseY - Math.sin(i*0.9 + rand()*2.6)*amp*(0.4+rand()*0.8);
    pts.push([x, y]);
  }
  let d = `M-40,${H+40} L-40,${pts[0][1].toFixed(1)}`;
  for(let i=1;i<pts.length;i++){
    const p = pts[i-1], c = pts[i], mx = (p[0]+c[0])/2;
    d += ` Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${mx.toFixed(1)},${((p[1]+c[1])/2).toFixed(1)}`;
  }
  d += ` L${W+40},${pts[pts.length-1][1].toFixed(1)} L${W+40},${H+40} Z`;
  return d;
}

/* Anamorphic lens flare — the single most "filmic" cue available in flat vector. */
function flare(cx, cy, colour, strength){
  const s = strength == null ? 1 : strength;
  const dots = [[-0.42,.30,26],[-0.2,.16,13],[0.26,.2,17],[0.5,.13,30],[0.72,.09,11]].map(([o,a,r])=>
    `<circle cx="${(cx + (900-cx)*o*1.5).toFixed(0)}" cy="${(cy + (450-cy)*o*1.5).toFixed(0)}" r="${r*s}"
       fill="${colour}" opacity="${(a*s*0.5).toFixed(3)}"/>`).join("");
  return `<g class="flare">
    <ellipse cx="${cx}" cy="${cy}" rx="${520*s}" ry="${2.4*s}" fill="${colour}" opacity="${.5*s}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${300*s}" ry="${8*s}" fill="${colour}" opacity="${.22*s}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${70*s}" ry="${70*s}" fill="${colour}" opacity="${.20*s}"/>
    ${dots}</g>`;
}

/* Volumetric light shafts falling from the key light. */
function shafts(cx, cy, colour, n, H){
  return `<g opacity=".30">` + Array.from({length:n||5},(_,i)=>{
    const spread = (i - (n||5)/2) * 130, w = 34 + i*17;
    return `<path d="M${cx-8},${cy} L${cx+spread-w},${H+60} L${cx+spread+w},${H+60} Z"
      fill="${colour}" opacity="${(0.16 - i*0.02).toFixed(3)}"/>`;
  }).join("") + `</g>`;
}

function carGroup(body, x, y, scale, flip, tone, env){
  const p = profileFor(body);
  const night = env && env.night;
  const wheels = p.wheels.map(([cx,cy,r]) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#020305"/>
     <circle cx="${cx}" cy="${cy}" r="${r*0.54}" fill="none" stroke="${tone.rim}" stroke-width="1.7" opacity=".9"/>
     <circle cx="${cx}" cy="${cy}" r="${r*0.22}" fill="${tone.rim}" opacity=".55"/>
     <path d="M${cx-r*0.5},${cy-r*0.5} A${r*0.7},${r*0.7} 0 0,1 ${cx+r*0.3},${cy-r*0.62}"
       stroke="${tone.rim}" stroke-width="1.1" fill="none" opacity=".8"/>`).join("");
  const lamp = p.lamp;
  const head = night
    ? `<ellipse cx="${lamp[0]}" cy="${lamp[1]}" rx="7" ry="3.4" fill="#FFF3D0"/>
       <path d="M${lamp[0]},${lamp[1]-5} L${lamp[0]+150},${lamp[1]-34} L${lamp[0]+150},${lamp[1]+40} L${lamp[0]},${lamp[1]+5} Z"
         fill="#FFE9B8" opacity=".17"/>`
    : `<ellipse cx="${lamp[0]}" cy="${lamp[1]}" rx="6" ry="3" fill="${tone.rim}" opacity=".75"/>`;
  return `<g transform="translate(${x},${y}) scale(${flip?-scale:scale},${scale})${flip?` translate(-200,0)`:""}">
    <ellipse cx="100" cy="70" rx="106" ry="6" fill="#000" opacity=".62"/>
    <g opacity=".20" transform="translate(0,142) scale(1,-1)">
      <path d="${p.body}" fill="${tone.body}"/></g>
    <path d="${p.body}" fill="${tone.body}"/>
    <path d="${p.glass}" fill="${tone.glass}" opacity=".92"/>
    <path d="${p.glass}" fill="none" stroke="${tone.rim}" stroke-width="0.8" opacity=".45"/>
    <path d="${p.crown}" fill="none" stroke="${tone.crownLight}" stroke-width="2.1" opacity=".95" stroke-linecap="round"/>
    <path d="M12,52 C60,49 140,49 190,52" stroke="${tone.rim}" stroke-width="1.1" fill="none" opacity=".4"/>
    ${head}${wheels}
    <path d="${p.body}" fill="none" stroke="${tone.edge}" stroke-width="1.2" opacity=".55"/>
  </g>`;
}

function skyDefs(id, env, W, H){
  return `<defs>
    <linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${env.sky[0]}"/><stop offset="36%" stop-color="${env.sky[1]}"/>
      <stop offset="70%" stop-color="${env.sky[2]}"/><stop offset="100%" stop-color="${env.sky[3]}"/>
    </linearGradient>
    <radialGradient id="glow${id}" cx="${env.sun[0]*100}%" cy="${env.sun[1]*100}%" r="52%">
      <stop offset="0%" stop-color="${env.sun[2]}" stop-opacity=".92"/>
      <stop offset="42%" stop-color="${env.sun[2]}" stop-opacity=".22"/>
      <stop offset="100%" stop-color="${env.sun[2]}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vig${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#05070A" stop-opacity=".72"/>
      <stop offset="40%" stop-color="#05070A" stop-opacity="0"/>
      <stop offset="78%" stop-color="#05070A" stop-opacity=".18"/>
      <stop offset="100%" stop-color="#05070A" stop-opacity=".88"/>
    </linearGradient>
    <radialGradient id="edge${id}" cx="50%" cy="50%" r="72%">
      <stop offset="52%" stop-color="#05070A" stop-opacity="0"/>
      <stop offset="100%" stop-color="#05070A" stop-opacity=".72"/>
    </radialGradient>
    <linearGradient id="road${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${env.sun[2]}" stop-opacity=".16"/>
      <stop offset="22%" stop-color="${env.road}" stop-opacity=".82"/>
      <stop offset="100%" stop-color="${env.road}"/>
    </linearGradient>
  </defs>`;
}

/**
 * Draw one cinematic frame.
 * kind: side | front | rear | interior | wheel | detail | landscape
 */
function frameSVG(opts){
  const env = ENVS[opts.env] || ENVS.ngong;
  const kind = opts.kind || "side";
  const body = opts.body || "SUV";
  const rand = mulberry(hashStr((opts.seed||"x") + kind));
  const W = 1600, H = 900, id = "g" + hashStr((opts.seed||"") + kind).toString(36);
  const horizon = 556;
  const sunX = env.sun[0]*W, sunY = env.sun[1]*H;
  const tone = {body:"#05070B", glass:"#16202E", rim:"#A8B6C6", edge:"rgba(255,255,255,.28)", crownLight:env.key};
  const open = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(opts.alt||env.name)}">`;

  if(kind === "interior"){
    return `${open}${skyDefs(id, env, W, H)}
      <rect width="${W}" height="${H}" fill="#07090D"/>
      <path d="M210,110 L1390,110 C1432,184 1452,300 1452,384 L148,384 C148,300 168,184 210,110 Z" fill="url(#sky${id})"/>
      <path d="M148,330 C420,264 700,296 900,274 C1120,250 1300,296 1452,330 L1452,384 L148,384 Z" fill="${env.ridge[1]}"/>
      <g opacity=".5">${flare(sunX*0.78, 250, env.sun[2], .5)}</g>
      <rect x="148" y="384" width="1304" height="22" fill="#04060A"/>
      <path d="M0,404 L1600,404 C1600,562 1518,642 1438,662 L162,662 C82,642 0,562 0,404 Z" fill="#0E1218"/>
      <rect x="0" y="642" width="1600" height="258" fill="#070910"/>
      <rect x="516" y="436" width="568" height="126" rx="7" fill="#04060A" stroke="rgba(255,255,255,.07)"/>
      <circle cx="656" cy="500" r="44" fill="none" stroke="${env.key}" stroke-width="2" opacity=".5"/>
      <circle cx="944" cy="500" r="44" fill="none" stroke="${env.key}" stroke-width="2" opacity=".5"/>
      <path d="M656,500 L686,476" stroke="#C8A253" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M944,500 L918,472" stroke="#C8A253" stroke-width="3.4" stroke-linecap="round"/>
      <rect x="722" y="470" width="156" height="60" rx="4" fill="#0C1117" stroke="rgba(255,255,255,.07)"/>
      <path d="M800,604 m-152,0 a152,152 0 1,0 304,0 a152,152 0 1,0 -304,0" fill="none" stroke="#161B23" stroke-width="32"/>
      <path d="M800,604 m-152,0 a152,152 0 1,0 304,0 a152,152 0 1,0 -304,0" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="1.6"/>
      <path d="M690,500 a152,152 0 0,1 66,-38" stroke="${env.key}" stroke-width="3" fill="none" opacity=".45"/>
      <rect x="768" y="562" width="64" height="46" rx="6" fill="#141922" stroke="rgba(255,255,255,.09)"/>
      <path d="M648,604 L768,590 M952,604 L832,590 M800,756 L800,644" stroke="#161B23" stroke-width="23" stroke-linecap="round"/>
      <rect width="${W}" height="${H}" fill="url(#vig${id})"/>
      <rect width="${W}" height="${H}" fill="url(#edge${id})"/>
    </svg>`;
  }

  if(kind === "wheel"){
    const spokes = Array.from({length:5},(_,i)=>{
      const a = (i/5)*Math.PI*2 - Math.PI/2;
      return `<path d="M800,556 L${(800+Math.cos(a)*232).toFixed(0)},${(556+Math.sin(a)*232).toFixed(0)}"
        stroke="#AEBAC8" stroke-width="36" stroke-linecap="round" opacity=".92"/>
        <path d="M800,556 L${(800+Math.cos(a)*232).toFixed(0)},${(556+Math.sin(a)*232).toFixed(0)}"
        stroke="${env.key}" stroke-width="5" stroke-linecap="round" opacity=".5"/>`;
    }).join("");
    return `${open}${skyDefs(id, env, W, H)}
      <rect width="${W}" height="${H}" fill="${env.ridge[2]}"/>
      <rect y="0" width="${W}" height="400" fill="url(#sky${id})" opacity=".42"/>
      <rect y="400" width="${W}" height="500" fill="url(#road${id})"/>
      <g opacity=".5">${flare(1290, 250, env.sun[2], .7)}</g>
      <circle cx="800" cy="556" r="336" fill="#020305"/>
      <circle cx="800" cy="556" r="252" fill="#080B10" stroke="#7C8896" stroke-width="5"/>
      ${spokes}
      <circle cx="800" cy="556" r="72" fill="#10141A" stroke="#C8A253" stroke-width="3"/>
      <circle cx="800" cy="556" r="21" fill="#C8A253" opacity=".85"/>
      <path d="M464,556 a336,336 0 0,1 184,-291" stroke="${env.key}" stroke-width="7" fill="none" opacity=".55"/>
      <path d="M1136,556 a336,336 0 0,1 -120,258" stroke="${env.key}" stroke-width="4" fill="none" opacity=".3"/>
      <rect width="${W}" height="${H}" fill="url(#vig${id})"/>
      <rect width="${W}" height="${H}" fill="url(#edge${id})"/>
    </svg>`;
  }

  if(kind === "detail"){
    return `${open}${skyDefs(id, env, W, H)}
      <rect width="${W}" height="${H}" fill="#06080C"/>
      <path d="M0,780 C420,612 900,528 1600,300 L1600,900 L0,900 Z" fill="#111721"/>
      <path d="M180,290 C520,230 900,200 1430,108 L1450,186 C920,282 540,326 190,376 Z" fill="url(#sky${id})" opacity=".72"/>
      <path d="M0,712 C420,548 900,466 1600,244" stroke="rgba(255,255,255,.13)" stroke-width="3" fill="none"/>
      <path d="M0,648 C430,476 920,386 1600,152" stroke="${env.key}" stroke-width="13" fill="none" opacity=".42"/>
      <path d="M0,640 C430,468 920,378 1600,144" stroke="#FFFFFF" stroke-width="2.5" fill="none" opacity=".55"/>
      ${flare(1210, 590, env.sun[2], .8)}
      <circle cx="1210" cy="590" r="140" fill="url(#glow${id})"/>
      <rect width="${W}" height="${H}" fill="url(#vig${id})"/>
      <rect width="${W}" height="${H}" fill="url(#edge${id})"/>
    </svg>`;
  }

  /* landscape / side / front / rear */
  const ridges = env.ridge.map((c,i)=>
    `<path d="${ridgePath(rand, horizon - 84 + i*64, 86 - i*22, W, H)}" fill="${c}"/>`).join("");
  const city = opts.env === "nairobi"
    ? Array.from({length:20},(_,i)=>{
        const w = 30 + rand()*74, h = 66 + rand()*280, x = 40 + i*80 + rand()*20, y = horizon + 28 - h;
        const lights = Array.from({length:Math.floor(h/32)},(_,j)=>
          `<rect x="${(x+7+rand()*(w-18)).toFixed(0)}" y="${(y+12+j*30).toFixed(0)}" width="4.5" height="6.5" fill="#FFCF84" opacity="${(.22+rand()*.66).toFixed(2)}"/>`).join("");
        return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="#080E18"/>${lights}`;
      }).join("")
    : "";
  const acacia = (opts.env==="ngong"||opts.env==="highway")
    ? `<g opacity=".9" fill="${env.ridge[2]}">
        <path d="M1372,${horizon+34} L1380,${horizon-52} L1388,${horizon+34} Z"/>
        <path d="M1296,${horizon-56} C1330,${horizon-104} 1442,${horizon-104} 1470,${horizon-54} C1432,${horizon-70} 1332,${horizon-70} 1296,${horizon-56} Z"/>
        <path d="M188,${horizon+30} L194,${horizon-34} L200,${horizon+30} Z"/>
        <path d="M140,${horizon-38} C166,${horizon-72} 236,${horizon-72} 256,${horizon-36} C228,${horizon-48} 166,${horizon-48} 140,${horizon-38} Z"/>
      </g>` : "";

  let car = "";
  if(kind !== "landscape"){
    const scale = kind==="front" ? 5.4 : kind==="rear" ? 4.3 : 3.7;
    const cw = 200*scale;
    const x = kind==="front" ? (W-cw)/2 + 130 : (W-cw)/2;
    const y = kind==="front" ? H-72*scale+66 : H - 72*scale - 34;
    car = carGroup(body, x, y, scale, kind==="rear", tone, env);
  }

  return `${open}${skyDefs(id, env, W, H)}
    <rect width="${W}" height="${H}" fill="url(#sky${id})"/>
    <rect width="${W}" height="${H}" fill="url(#glow${id})"/>
    ${shafts(sunX, sunY, env.sun[2], 5, H)}
    ${city}${ridges}${acacia}
    <rect x="0" y="${horizon+18}" width="${W}" height="${H-horizon}" fill="url(#road${id})"/>
    <path d="M720,${horizon+18} L-220,${H} L560,${H} Z" fill="${env.key}" opacity=".035"/>
    <path d="M780,${horizon+38} L648,${H}" stroke="rgba(255,255,255,.2)" stroke-width="7" stroke-dasharray="36 60" fill="none"/>
    <rect x="0" y="${horizon-24}" width="${W}" height="140" fill="${env.haze}" opacity=".55"/>
    ${car}
    ${flare(sunX, sunY, env.sun[2], env.night ? .5 : 1)}
    <rect width="${W}" height="${H}" fill="url(#vig${id})"/>
    <rect width="${W}" height="${H}" fill="url(#edge${id})"/>
  </svg>`;
}

/**
 * The hero, split into depth planes so the scroll engine can move each
 * at its own rate. Returns markup; each plane carries data-depth.
 */
function heroLayers(envKey, body, seed){
  const env = ENVS[envKey] || ENVS.ngong;
  const rand = mulberry(hashStr(seed || "hero"));
  const W = 1600, H = 900, id = "h" + hashStr(seed||"hero").toString(36);
  const horizon = 556;
  const sunX = env.sun[0]*W, sunY = env.sun[1]*H;
  const tone = {body:"#04060A", glass:"#131D2A", rim:"#B6C3D2", edge:"rgba(255,255,255,.3)", crownLight:env.key};
  const svg = (inner, extra) =>
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ${extra||""}>${inner}</svg>`;

  const planes = [
    // 0 — sky, sun, shafts: barely moves
    {depth:"0.06", html: svg(`${skyDefs(id+"a", env, W, H)}
      <rect width="${W}" height="${H}" fill="url(#sky${id}a)"/>
      <rect width="${W}" height="${H}" fill="url(#glow${id}a)"/>
      ${shafts(sunX, sunY, env.sun[2], 6, H)}`)},
    // 1 — far ridge
    {depth:"0.16", html: svg(`<path d="${ridgePath(rand, horizon-84, 88, W, H)}" fill="${env.ridge[0]}"/>`)},
    // 2 — mid ridge
    {depth:"0.30", html: svg(`<path d="${ridgePath(rand, horizon-20, 64, W, H)}" fill="${env.ridge[1]}"/>`)},
    // 3 — near ridge + haze band
    {depth:"0.46", html: svg(`<path d="${ridgePath(rand, horizon+44, 44, W, H)}" fill="${env.ridge[2]}"/>
      <rect x="0" y="${horizon-30}" width="${W}" height="150" fill="${env.haze}" opacity=".5"/>`)},
    // 4 — road
    {depth:"0.62", html: svg(`${skyDefs(id+"b", env, W, H)}
      <rect x="0" y="${horizon+18}" width="${W}" height="${H-horizon}" fill="url(#road${id}b)"/>
      <path d="M720,${horizon+18} L-260,${H} L560,${H} Z" fill="${env.key}" opacity=".04"/>
      <path d="M780,${horizon+40} L640,${H}" stroke="rgba(255,255,255,.22)" stroke-width="8" stroke-dasharray="38 62" fill="none"/>`)},
    // 5 — the car: the subject, moves most
    {depth:"0.92", html: svg(carGroup(body, (W-200*4.1)/2, H - 72*4.1 - 26, 4.1, false, tone, env))},
    // 6 — flare sits on the lens, not in the world
    {depth:"0.04", html: svg(flare(sunX, sunY, env.sun[2], env.night ? .6 : 1.15))}
  ];
  return planes.map((p,i)=>
    `<div class="plane" data-depth="${p.depth}" style="z-index:${i}">${p.html}</div>`).join("");
}

/** Render one stored image reference to markup. */
function media(img, alt, carBody, seed){
  if(!img) return frameSVG({kind:"landscape", env:"ngong", seed:seed||"x", alt:alt});
  if(img.assetId) return `<img src="${API_BASE}/_blob/${esc(img.assetId)}" alt="${esc(alt||"")}" loading="lazy" decoding="async">`;
  return frameSVG({kind:img.kind||"side", env:img.env||"ngong", body:carBody||"SUV", seed:(seed||"")+(img.kind||""), alt:alt});
}
const coverOf = car => (car.images && car.images[0]) || null;

/** Studio-style product artwork for a spare part, by category. No car body — a
 *  clean charcoal-and-brass still life, consistent with the brand but honest
 *  that it's a generated placeholder until a real photo is uploaded. */
function partSVG(opts){
  const cat = opts.category || "Accessories";
  const rand = mulberry(hashStr((opts.seed||cat) + "part"));
  const W = 1200, H = 900, id = "pt" + hashStr((opts.seed||cat)+"part").toString(36);
  const brass = "#C8A253", bg1 = "#141920", bg2 = "#05070A", ink = "#232B36";
  const cx = W/2, cy = H/2 - 26;

  const icon = (() => { switch(cat){
    case "Filters": return `<g>
      <rect x="${cx-88}" y="${cy-150}" width="176" height="290" rx="24" fill="#1B222C" stroke="${brass}" stroke-width="3"/>
      ${Array.from({length:8},(_,i)=>`<line x1="${cx-88}" y1="${cy-118+i*36}" x2="${cx+88}" y2="${cy-118+i*36}" stroke="${ink}" stroke-width="2"/>`).join("")}
      <circle cx="${cx}" cy="${cy-150}" r="18" fill="${brass}"/></g>`;
    case "Brakes": return `<g>
      <circle cx="${cx}" cy="${cy}" r="158" fill="none" stroke="${ink}" stroke-width="24"/>
      <circle cx="${cx}" cy="${cy}" r="158" fill="none" stroke="${brass}" stroke-width="2.5"/>
      ${Array.from({length:10},(_,i)=>{const a=(i/10)*Math.PI*2;return `<circle cx="${(cx+Math.cos(a)*158).toFixed(0)}" cy="${(cy+Math.sin(a)*158).toFixed(0)}" r="8" fill="${bg2}"/>`;}).join("")}
      <circle cx="${cx}" cy="${cy}" r="44" fill="#1B222C" stroke="${brass}" stroke-width="3"/></g>`;
    case "Suspension": return `<g fill="none" stroke="${brass}" stroke-width="9" stroke-linecap="round">
      ${Array.from({length:6},(_,i)=>`<path d="M${cx-64},${cy-150+i*58} Q${cx+64},${cy-121+i*58} ${cx-64},${cy-92+i*58}"/>`).join("")}</g>`;
    case "Engine": return `<g>
      <circle cx="${cx}" cy="${cy}" r="104" fill="#1B222C" stroke="${brass}" stroke-width="3"/>
      ${Array.from({length:8},(_,i)=>{const a=(i/8)*Math.PI*2, x=cx+Math.cos(a)*112, y=cy+Math.sin(a)*112;
        return `<rect x="${(x-15).toFixed(0)}" y="${(y-15).toFixed(0)}" width="30" height="30" fill="#1B222C" stroke="${brass}" stroke-width="2" transform="rotate(${(a*180/Math.PI).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;}).join("")}
      <circle cx="${cx}" cy="${cy}" r="30" fill="${bg2}"/></g>`;
    case "Electrical": return `<g>
      <circle cx="${cx}" cy="${cy}" r="138" fill="none" stroke="${ink}" stroke-width="3"/>
      <path d="M${cx+18},${cy-148} L${cx-58},${cy+8} L${cx-4},${cy+8} L${cx-28},${cy+148} L${cx+68},${cy-28} L${cx+8},${cy-28} Z" fill="${brass}"/></g>`;
    case "Body & Trim": return `<g>
      <rect x="${cx-128}" y="${cy-86}" width="256" height="172" rx="16" fill="#1B222C" stroke="${brass}" stroke-width="3"/>
      <rect x="${cx-88}" y="${cy-48}" width="176" height="96" rx="8" fill="none" stroke="${ink}" stroke-width="2"/></g>`;
    case "Fluids": return `<path d="M${cx},${cy-146} C${cx+86},${cy-28} ${cx+66},${cy+136} ${cx},${cy+136}
      C${cx-66},${cy+136} ${cx-86},${cy-28} ${cx},${cy-146} Z" fill="${brass}" opacity=".88"/>`;
    default: return `<g>
      <path d="M${cx-98},${cy} L${cx-38},${cy-88} L${cx+38},${cy-88} L${cx+98},${cy} L${cx+38},${cy+88} L${cx-38},${cy+88} Z" fill="none" stroke="${brass}" stroke-width="7"/>
      <circle cx="${cx}" cy="${cy}" r="28" fill="${brass}"/></g>`;
  }})();

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(opts.alt||cat)}">
    <defs>
      <linearGradient id="pbg${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient>
      <radialGradient id="psp${id}" cx="50%" cy="36%" r="58%">
        <stop offset="0%" stop-color="${brass}" stop-opacity=".2"/><stop offset="100%" stop-color="${brass}" stop-opacity="0"/></radialGradient>
      <radialGradient id="pvg${id}" cx="50%" cy="50%" r="72%">
        <stop offset="55%" stop-color="#05070A" stop-opacity="0"/><stop offset="100%" stop-color="#05070A" stop-opacity=".68"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#pbg${id})"/>
    <rect width="${W}" height="${H}" fill="url(#psp${id})"/>
    <line x1="0" y1="${H-136}" x2="${W}" y2="${H-136}" stroke="${ink}" stroke-width="2"/>
    ${icon}
    <text x="${W/2}" y="${H-66}" text-anchor="middle" font-family="Archivo, sans-serif" font-size="26" font-weight="700"
      letter-spacing="6" fill="${brass}" opacity=".85">${esc(cat.toUpperCase())}</text>
    <rect width="${W}" height="${H}" fill="url(#pvg${id})"/>
  </svg>`;
}
function partMedia(p, seed){
  const img = p.images && p.images[0];
  if(img && img.assetId) return `<img src="${API_BASE}/_blob/${esc(img.assetId)}" alt="${esc(p.name||"")}" loading="lazy" decoding="async">`;
  return partSVG({category:p.category, seed:seed||p.id, alt:p.name});
}
function partStock(p){
  const s = Number(p.stock)||0;
  if(s<=0) return {label:"Out of stock", cls:"pill--bad"};
  if(s<=3) return {label:"Low stock · "+s+" left", cls:"pill--new"};
  return {label:"In stock", cls:"pill--ok"};
}

/* ---------- 3. DATA LAYER ----------
   Backed by the artifact document store when the page is published
   (shared, server-side, access-controlled). Falls back to this
   browser only when the store is unavailable, so the page is never
   dead — the fallback is clearly labelled in the admin area.        */

/* ===========================================================
   DB — self-hosted variant. Talks to the Express/PostgreSQL
   backend in server/ over fetch() instead of window.claude.use().
   Every read-only helper below (allCars, available, car, s, etc.)
   is untouched from the hosted version — only how data GETS into
   these Maps, and how writes leave the browser, has changed.     */

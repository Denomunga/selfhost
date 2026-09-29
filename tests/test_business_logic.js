const fs = require('fs'), vm = require('vm');
const policy = require('../server/src/policy.js');
const WEB = require('path').join(__dirname, '..', 'web');
const SCRIPT_FILES = [...fs.readFileSync(WEB + '/index.html', 'utf8')
  .matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
function loadFrontend(ctx, bridge) {
  // Run each file separately, in page order, exactly as the browser does.
  for (const f of SCRIPT_FILES) vm.runInContext(fs.readFileSync(WEB + '/' + f, 'utf8'), ctx, { filename: f });
  vm.runInContext(bridge, ctx, { filename: 'test-bridge.js' });
}

/* ---------- fake server (same contract as test_frontend_api.js) ---------- */
const FAKE = { docs: new Map(), users: new Map(), counters: new Map(), sessions: new Map(), nextTok: 1 };
FAKE.users.set('admin', {id:'admin', username:'admin', email:'admin@riftmotors.com', name:'Administrator',
  role:'admin', password:'admin', mustChange:false, active:true, createdAt:new Date().toISOString(), lastLogin:null});
FAKE.docs.set('users:admin', {username:'admin', email:'admin@riftmotors.com', name:'Administrator', role:'admin', mustChange:false, active:true});

function docKey(c,id){ return c+':'+id; }
function collectionDocs(c){ const out=[]; for(const [k,v] of FAKE.docs){ if(k.startsWith(c+':')) out.push(Object.assign({id:k.slice(c.length+1)}, v)); } return out; }
function sessionFor(){ const m=(FAKE.currentCookie||'').match(/rift_session=([^;]+)/); return m ? FAKE.sessions.get(m[1])||null : null; }

async function handle(url, opts){
  const u = new URL(url, 'http://x'); const p = u.pathname, method=(opts.method||'GET').toUpperCase();
  const session = sessionFor();
  const body = (opts.body && typeof opts.body === 'string') ? JSON.parse(opts.body) : null;
  const json = (s,o) => ({ ok:s>=200&&s<300, status:s, statusText:'', json:async()=>o, text:async()=>JSON.stringify(o) });
  const empty = (s) => ({ ok:s>=200&&s<300, status:s, statusText:'', json:async()=>null, text:async()=>'' });

  if(p==='/api/auth/login' && method==='POST'){
    const u2=[...FAKE.users.values()].find(x=>x.username===body.username||x.email===body.username);
    if(!u2||u2.password!==body.password) return json(401,{error:'Username or password is wrong.'});
    const tok='tok'+(FAKE.nextTok++); FAKE.sessions.set(tok,{uid:u2.id,username:u2.username,role:u2.role,name:u2.name});
    FAKE.currentCookie='rift_session='+tok;
    return json(200,{user:{id:u2.id,username:u2.username,role:u2.role,name:u2.name,mustChange:u2.mustChange}});
  }
  if(p==='/api/auth/me' && method==='GET'){
    if(!session) return json(401,{error:'Sign in to continue.'});
    const u2=FAKE.users.get(session.uid);
    return json(200,{user:{id:u2.id,username:u2.username,role:u2.role,name:u2.name,mustChange:u2.mustChange}});
  }
  if(p==='/api/public/snapshot' && method==='GET'){
    return json(200,{cars:collectionDocs('cars'),parts:collectionDocs('parts'),stories:collectionDocs('stories'),settings:FAKE.docs.get('settings:site')||{}});
  }
  if(p==='/api/admin/snapshot' && method==='GET'){
    if(!session) return json(401,{error:'Sign in to continue.'});
    const out={}; policy.ALL_COLLECTIONS.forEach(c=>{ if(policy.canRead(c,session)) out[c]=collectionDocs(c); });
    out.settings=FAKE.docs.get('settings:site')||{};
    return json(200,out);
  }
  const cm2 = p.match(/^\/api\/collections\/([^/]+)\/(.+)$/);
  if(cm2){
    const [,coll,id]=cm2;
    if(method==='PUT'){ if(!policy.canWrite(coll,session)) return json(403,{error:"denied"}); const b=Object.assign({},body); delete b.id; FAKE.docs.set(docKey(coll,id),b); return empty(204); }
    if(method==='DELETE'){ if(!policy.canWrite(coll,session)) return json(403,{error:"denied"}); FAKE.docs.delete(docKey(coll,id)); return empty(204); }
  }
  if(p==='/api/settings' && method==='PUT'){ if(!session) return json(401,{error:'no'}); FAKE.docs.set('settings:site', body||{}); return empty(204); }
  const cnt = p.match(/^\/api\/counters\/(\w+)$/);
  if(cnt && method==='POST'){
    if(!session) return json(401,{error:'no'});
    const pfx={invoice:"INV",receipt:"RCPT",order:"ORD",payment:"PAY",refund:"CRN",expense:"EXP",purchase:"PO",journal:"JRN",register:"REG"};
    const year=new Date().getFullYear(), key=cnt[1]+'_'+year;
    const n=(FAKE.counters.get(key)||0)+1; FAKE.counters.set(key,n);
    return json(200,{no:`${pfx[cnt[1]]||'DOC'}-${year}-${String(n).padStart(5,'0')}`});
  }
  return json(404,{error:'not found: '+method+' '+p});
}

/* ---------- DOM stub (same pattern as finance.js / parts.js) ---------- */
function El(){return{innerHTML:"",textContent:"",value:"",type:"text",checked:true,disabled:false,style:{},dataset:{},
  files:[],className:"",_h:{},
  classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(c,f){f?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
  addEventListener(t,fn){(this._h[t]=this._h[t]||[]).push(fn);}, removeEventListener(){}, appendChild(){}, remove(){},
  setAttribute(){}, getAttribute(){return null}, focus(){}, scrollIntoView(){}, reset(){},
  click(){(this._h.click||[]).forEach(f=>f({preventDefault(){}}));}, querySelector(){return null}, querySelectorAll(){return[]}}}
const store={};
const document={documentElement:{scrollHeight:5000,clientHeight:900},title:"",head:{appendChild(){}},
  body:{style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},contains(){return true},appendChild(){}},
  querySelector(s){if(s.startsWith('meta')||s.startsWith('link'))return null;return store[s]||(store[s]=El());},
  querySelectorAll(){return[]}, getElementById(){return null}, createElement(){return El();}, addEventListener(){}};
class FakeFormData{ constructor(){this.entries=[];} append(k,v){this.entries.push([k,v]);} }
const win={document,location:{hash:"#/",href:"http://x/"},addEventListener(){},removeEventListener(){},scrollTo(){},scrollY:0,
  matchMedia(){return{matches:false};}, setTimeout,clearTimeout,setInterval:()=>0,clearInterval,console,
  requestAnimationFrame:()=>0,cancelAnimationFrame(){},performance:{now:()=>Date.now()},innerWidth:1440,innerHeight:900,
  FormData:FakeFormData, fetch:(url,opts)=>handle(url,opts||{})};
win.window=win;
const ctx=vm.createContext(Object.assign(win,{document,console,setTimeout,clearTimeout,setInterval:()=>0,clearInterval,
  requestAnimationFrame:()=>0,performance:{now:()=>Date.now()},fetch:win.fetch,FormData:FakeFormData}));
loadFrontend(ctx, "\n;globalThis.__T={DB,Auth,Ledger,carCost,partCost,ACCOUNTS};");

const $=s=>store[s]||(store[s]=El());
const set=(s,v)=>{ $(s).value=String(v); };
const fire=async(s,t)=>{ const el=$(s); const hs=(el._h[t]||[]); for(const f of hs) await f({preventDefault(){},target:el}); };
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const fresh=()=>{ for(const k in store) delete store[k]; };

(async()=>{
  const {DB,Auth,Ledger,carCost,partCost}=ctx.__T, out=[];
  const ok=(n,c,e)=>out.push(`${c?'PASS':'FAIL'}  ${n}${e!==undefined?'  — '+e:''}`);

  // seed one vehicle (with private cost) + two parts (with private cost) + settings
  FAKE.docs.set('settings:site', {dealership:"Rift Motors", whatsapp:"254700000000", vatRate:16});
  FAKE.docs.set('cars:test-forester', {make:"SUBARU", model:"Forester", variant:"XT", year:2018, price:4250000,
    mileage:78000, status:"AVAILABLE", featured:false, images:[], transmission:"CVT", fuel:"Petrol",
    drive:"Symmetrical AWD", body:"SUV", createdAt:new Date().toISOString(), soldAt:null});
  FAKE.docs.set('carcost:test-forester', {cost:3000000});
  FAKE.docs.set('parts:oil-filter', {name:"Engine Oil Filter", sku:"OF-001", category:"Filters", brand:"Genuine",
    compatible:["Forester"], price:1200, stock:34, unit:"pcs", status:"ACTIVE", featured:false, images:[],
    createdAt:new Date().toISOString()});
  FAKE.docs.set('partcost:oil-filter', {cost:650});

  await DB.init();
  ok('public snapshot loads seeded vehicle', DB.cars.size===1);
  ok('public snapshot loads seeded part', DB.parts.size===1);

  const r = await Auth.signIn('admin','admin');
  ok('admin signs in', r.ok===true);
  ok('admin snapshot now includes carcost/partcost (private)', DB.carcost.size===1 && DB.partcost.size===1);

  /* ---------- render every admin page against the new DB shape ---------- */
  const pages = ['overview','orders','invoices','receipts','payments','refunds','customers',
    'registers','cashmoves','expenses','purchases','suppliers','vehicles','parts','photos','stories',
    'inquiries','accounts','journal','receivable','payable','reports','audit','users','settings'];
  let broken=[];
  pages.forEach(p=>{
    try{
      ctx.ADMIN_TAB = p;
      const html = ctx.adminBody();
      if(typeof html!=='string' || html.length<50) broken.push(p+':empty');
      if(/(\$\s?\d)|USD|EUR|GBP|€|£/.test(html)) broken.push(p+':currency');
    }catch(e){ broken.push(p+':'+e.message.slice(0,60)); }
  });
  ok('all 25 admin pages render against the new DB shape', broken.length===0, broken.join(', '));

  /* ---------- mixed sale: vehicle + part, through the real sellForm ---------- */
  const car = DB.car('test-forester'), part = DB.part('oil-filter');
  ctx.sellForm();
  set('#sl-car', car.id);
  set('#sl-partpick', part.id); set('#sl-partqty', 3); await fire('#sl-addpart','click');
  set('#sl-cust',''); set('#sl-name','Peter Njoroge'); set('#sl-phone','0733111222');
  set('#sl-price', car.price); set('#sl-disc', 0); set('#sl-vat', 16);
  set('#sl-terms','Due on delivery'); set('#sl-due', '2026-09-21');
  await fire('#sell-form','submit'); await wait(80);

  const inv = [...DB.invoices.values()].find(i=>i.carId===car.id);
  ok('invoice raised through the real sell flow', !!inv);
  ok('invoice total = vehicle + 3 parts + VAT', Math.round(inv.total)===Math.round((car.price+part.price*3)*1.16), inv.total);
  ok('vehicle marked sold server-side', FAKE.docs.get('cars:test-forester').status==='SOLD');
  ok('part stock decremented server-side', FAKE.docs.get('parts:oil-filter').stock===31, FAKE.docs.get('parts:oil-filter').stock);
  ok('order document exists server-side', !!FAKE.docs.get('orders:'+ (inv.orderId)));

  const entries=[...DB.journal.values()];
  const dr=entries.reduce((s,j)=>s+j.debit,0), cr=entries.reduce((s,j)=>s+j.credit,0);
  ok('ledger entries posted and balanced', entries.length>0 && Math.abs(dr-cr)<1, `${entries.length} entries, Dr ${dr}/Cr ${cr}`);
  ok('vehicle revenue account credited', Ledger.balance('4000')<0);
  ok('parts revenue account credited', Ledger.balance('4010')<0);
  ok('vehicle COGS posted using the private cost', Ledger.balance('5000')===carCost(car.id));
  ok('parts COGS posted using the private cost', Ledger.balance('5010')===partCost(part.id)*3);

  /* ---------- payment + refund, restocking both vehicle and part ---------- */
  fresh(); ctx.paymentForm(inv.id);
  set('#py-amt', inv.total); set('#py-method','CASH'); await fire('#pay-form','submit'); await wait(80);
  ok('invoice paid in full', ctx.invoiceStatus(DB.invoices.get(inv.id))==='PAID');

  fresh(); ctx.refundForm(inv.id);
  $('#rf-restock').checked = true;
  set('#rf-amt', inv.total); set('#rf-method','CASH'); set('#rf-reason','Sale cancelled');
  await fire('#ref-form','submit'); await wait(80);
  ok('vehicle restocked after refund', FAKE.docs.get('cars:test-forester').status==='AVAILABLE');
  ok('part restocked after refund', FAKE.docs.get('parts:oil-filter').stock===34, FAKE.docs.get('parts:oil-filter').stock);

  const entries2=[...DB.journal.values()];
  const dr2=entries2.reduce((s,j)=>s+j.debit,0), cr2=entries2.reduce((s,j)=>s+j.credit,0);
  ok('books still balanced after refund', Math.abs(dr2-cr2)<1, `Dr ${dr2}/Cr ${cr2}`);

  /* ---------- role enforcement flows through to the real UI ---------- */
  FAKE.users.set('csh-1', {id:'csh-1', username:'cashier1', role:'cashier', password:'Cashier2026',
    mustChange:false, active:true, name:'Cashier One', createdAt:new Date().toISOString(), lastLogin:null});
  await Auth.signOut();
  await Auth.signIn('cashier1','Cashier2026');
  ok('cashier signed in', Auth.session.role==='cashier');
  ok('cashier cannot see the audit log data', DB.audit.size===0);
  let auditPageBroken = false;
  try{ ctx.ADMIN_TAB='audit'; ctx.adminBody(); }catch(e){ auditPageBroken = true; }
  ok('audit admin page still renders (empty) for a cashier without crashing', !auditPageBroken);

  console.log(out.join('\n'));
  const f=out.filter(l=>l.startsWith('FAIL'));
  console.log('\n'+(out.length-f.length)+'/'+out.length+' passed');
  process.exit(f.length?1:0);
})();

const fs = require('fs'), vm = require('vm');
const path = require('path');
const policy = require('../server/src/policy.js');

const WEB = require('path').join(__dirname, '..', 'web');
const SCRIPT_FILES = [...fs.readFileSync(WEB + '/index.html', 'utf8')
  .matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
  .filter(f => !f.startsWith('http://') && !f.startsWith('https://'));
function loadFrontend(ctx, bridge) {
  // Run each file separately, in page order, exactly as the browser does.
  for (const f of SCRIPT_FILES) vm.runInContext(fs.readFileSync(WEB + '/' + f, 'utf8'), ctx, { filename: f });
  vm.runInContext(bridge, ctx, { filename: 'test-bridge.js' });
}

/* ---------- in-memory fake server, matching the real route contracts ---------- */
const FAKE = {
  docs: new Map(),        // "collection:id" -> data
  users: new Map(),       // id -> {id, username, email, name, role, password, mustChange, active}
  counters: new Map(),    // kind_year -> n
  sessions: new Map(),    // token -> {uid, username, role, name}
  nextTok: 1
};
FAKE.users.set('admin', {id:'admin', username:'admin', email:'admin@riftmotors.com', name:'Administrator',
  role:'admin', password:'admin', mustChange:true, active:true, createdAt:new Date().toISOString(), lastLogin:null});

function docKey(c,id){ return c+':'+id; }
function collectionDocs(c){
  const out = [];
  for(const [k,v] of FAKE.docs){ if(k.startsWith(c+':')) out.push(Object.assign({id:k.slice(c.length+1)}, v)); }
  return out;
}
function sessionFor(req){
  const cookie = req.headers['cookie'] || '';
  const m = cookie.match(/rift_session=([^;]+)/);
  if(!m) return null;
  return FAKE.sessions.get(m[1]) || null;
}

async function handle(url, opts){
  const u = new URL(url, 'http://x');
  const p = u.pathname, method = (opts.method||'GET').toUpperCase();
  const headers = {}; // cookie jar handled via FAKE.currentCookie below
  const req = { headers: { cookie: FAKE.currentCookie || '' } };
  const session = sessionFor(req);
  const body = (opts.body && typeof opts.body === 'string') ? JSON.parse(opts.body) : null;
  const json = (status, obj) => ({ ok: status>=200&&status<300, status, statusText:'', json: async()=>obj, text: async()=>JSON.stringify(obj) });
  const empty = (status) => ({ ok: status>=200&&status<300, status, statusText:'', json: async()=>null, text: async()=>'' });

  // --- auth ---
  if(p === '/api/auth/login' && method === 'POST'){
    const u2 = [...FAKE.users.values()].find(x=>x.username===body.username||x.email===body.username);
    if(!u2 || u2.password !== body.password) return json(401, {error:'Username or password is wrong.'});
    if(!u2.active) return json(403, {error:'This account has been disabled.'});
    const tok = 'tok'+(FAKE.nextTok++);
    FAKE.sessions.set(tok, {uid:u2.id, username:u2.username, role:u2.role, name:u2.name});
    FAKE.currentCookie = 'rift_session='+tok;
    return json(200, {user:{id:u2.id, username:u2.username, role:u2.role, name:u2.name, mustChange:u2.mustChange}});
  }
  if(p === '/api/auth/logout' && method === 'POST'){
    FAKE.currentCookie = '';
    return empty(204);
  }
  if(p === '/api/auth/me' && method === 'GET'){
    if(!session) return json(401, {error:'Sign in to continue.'});
    const u2 = FAKE.users.get(session.uid);
    if(!u2 || !u2.active) return json(401, {error:'Session no longer valid.'});
    return json(200, {user:{id:u2.id, username:u2.username, role:u2.role, name:u2.name, mustChange:u2.mustChange}});
  }
  if(p === '/api/auth/change-password' && method === 'POST'){
    if(!session) return json(401, {error:'Sign in to continue.'});
    const targetId = body.userId || session.uid;
    if(targetId !== session.uid && session.role !== 'admin') return json(403, {error:"You can only change your own password."});
    if(!body.next || body.next.length < 8) return json(400, {error:'A password needs at least 8 characters.'});
    const u2 = FAKE.users.get(targetId);
    if(!u2) return json(404, {error:'That account no longer exists.'});
    if(targetId === session.uid && body.current && u2.password !== body.current) return json(401, {error:'Your current password is wrong.'});
    u2.password = body.next; u2.mustChange = false;
    FAKE.docs.set(docKey('users', targetId), Object.assign({}, FAKE.docs.get(docKey('users',targetId)), {mustChange:false}));
    return empty(204);
  }
  if(p === '/api/auth/users' && method === 'POST'){
    if(!session || session.role !== 'admin') return json(403, {error:'Administrator access required.'});
    if([...FAKE.users.values()].some(x=>x.username===body.username)) return json(409, {error:'That username is taken.'});
    const id = 'usr-'+Math.random().toString(36).slice(2,8);
    FAKE.users.set(id, {id, username:body.username, email:body.email, name:body.name, role:body.role||'cashier',
      password:body.password, mustChange:body.mustChange!==false, active:true, createdAt:new Date().toISOString(), lastLogin:null});
    FAKE.docs.set(docKey('users', id), {username:body.username, email:body.email, name:body.name, role:body.role||'cashier',
      mustChange:body.mustChange!==false, active:true});
    return json(201, {id});
  }
  if(p.startsWith('/api/auth/users/') && method === 'PATCH'){
    if(!session || session.role !== 'admin') return json(403, {error:'Administrator access required.'});
    const id = p.split('/').pop();
    const u2 = FAKE.users.get(id); if(!u2) return json(404, {error:'not found'});
    if(typeof body.active === 'boolean') u2.active = body.active;
    if(typeof body.role === 'string') u2.role = body.role;
    FAKE.docs.set(docKey('users', id), Object.assign({}, FAKE.docs.get(docKey('users',id)), {active:u2.active, role:u2.role}));
    return empty(204);
  }

  // --- snapshots ---
  if(p === '/api/public/snapshot' && method === 'GET'){
    return json(200, { cars: collectionDocs('cars'), parts: collectionDocs('parts'), stories: collectionDocs('stories'),
      settings: (FAKE.docs.get('settings:site')||{}) });
  }
  if(p === '/api/admin/snapshot' && method === 'GET'){
    if(!session) return json(401, {error:'Sign in to continue.'});
    const out = {};
    policy.ALL_COLLECTIONS.forEach(c => { if(policy.canRead(c, session)) out[c] = collectionDocs(c); });
    out.settings = FAKE.docs.get('settings:site') || {};
    return json(200, out);
  }

  // --- generic collections ---
  const collMatch = p.match(/^\/api\/collections\/([^/]+)\/(.+)$/);
  if(collMatch){
    const [, coll, id] = collMatch;
    if(method === 'PUT'){
      if(!policy.canWrite(coll, session)) return json(403, {error:"You can't save changes here."});
      const b = Object.assign({}, body); delete b.id;
      FAKE.docs.set(docKey(coll, id), b);
      return empty(204);
    }
    if(method === 'DELETE'){
      if(!policy.canWrite(coll, session)) return json(403, {error:"You can't delete this."});
      FAKE.docs.delete(docKey(coll, id));
      return empty(204);
    }
  }
  if(p === '/api/settings' && method === 'PUT'){
    if(!session) return json(401, {error:'Sign in to continue.'});
    FAKE.docs.set('settings:site', body || {});
    return empty(204);
  }

  // --- counters ---
  const cm = p.match(/^\/api\/counters\/(\w+)$/);
  if(cm && method === 'POST'){
    if(!session) return json(401, {error:'Sign in to continue.'});
    const prefixes = {invoice:"INV",receipt:"RCPT",order:"ORD",payment:"PAY",refund:"CRN",expense:"EXP",purchase:"PO",journal:"JRN",register:"REG"};
    const year = new Date().getFullYear();
    const key = cm[1]+'_'+year;
    const n = (FAKE.counters.get(key)||0) + 1;
    FAKE.counters.set(key, n);
    return json(200, {no: `${prefixes[cm[1]]||'DOC'}-${year}-${String(n).padStart(5,'0')}`});
  }

  // --- uploads ---
  if(p === '/api/uploads' && method === 'POST'){
    if(!session) return json(401, {error:'Sign in to continue.'});
    return json(201, {id: 'asset'+Math.random().toString(36).slice(2,10)});
  }

  return json(404, {error:'not found: '+method+' '+p});
}

/* ---------- DOM + fetch stub, run the real frontend bundle ---------- */
function El(){return{innerHTML:"",textContent:"",value:"",style:{},dataset:{},files:[],checked:false,disabled:false,
 classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},removeEventListener(){},
 appendChild(){},remove(){},setAttribute(){},focus(){},scrollIntoView(){},reset(){},querySelector(){return null},querySelectorAll(){return[]}}}
const store={};
const document={documentElement:{scrollHeight:5000,clientHeight:900},title:"",head:{appendChild(){}},
 body:{style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},contains(){return true},appendChild(){}},
 querySelector(s){if(s.startsWith('meta')||s.startsWith('link'))return null;return store[s]||(store[s]=El())},querySelectorAll(){return[]},
 getElementById(){return null},createElement(){return El()},addEventListener(){}};
class FakeFormData{ constructor(){ this.entries=[]; } append(k,v){ this.entries.push([k,v]); } }
const win = {
  document, location:{hash:"#/",href:"http://x/"}, addEventListener(){}, removeEventListener(){}, scrollTo(){}, scrollY:0,
  matchMedia(){return{matches:false}}, setTimeout, clearTimeout, setInterval:()=>0, clearInterval, console,
  requestAnimationFrame:()=>0, cancelAnimationFrame(){}, performance:{now:()=>Date.now()}, innerWidth:1440, innerHeight:900,
  FormData: FakeFormData,
  fetch: (url, opts) => handle(url, opts||{})
};
win.window = win;
const ctx = vm.createContext(Object.assign(win, {document, console, setTimeout, clearTimeout, setInterval:()=>0, clearInterval,
  requestAnimationFrame:()=>0, performance:{now:()=>Date.now()}, fetch: win.fetch, FormData: FakeFormData}));
loadFrontend(ctx, "\n;globalThis.__T={DB,Auth,nextNo};");

const wait = ms => new Promise(r=>setTimeout(r, ms));

(async () => {
  const { DB, Auth, nextNo } = ctx.__T;
  const out = [];
  const ok = (n,c,e) => out.push(`${c?'PASS':'FAIL'}  ${n}${e!==undefined?'  — '+e:''}`);

  // seed a couple of public docs directly into the fake store, as the seed script would
  FAKE.docs.set('cars:test-car', {make:"SUBARU", model:"Forester", variant:"XT", year:2018, price:4250000,
    status:"AVAILABLE", images:[], createdAt:new Date().toISOString()});
  FAKE.docs.set('settings:site', {dealership:"Test Motors", whatsapp:"254700000000"});
  FAKE.docs.set('customers:existing-cust', {name:'Existing Customer', phone:'0700000001'});

  await DB.init();
  ok('logged-out init pulls the public snapshot', DB.cars.size === 1);
  ok('logged-out visitor has no customers loaded', DB.customers.size === 0);
  ok('DB.canEdit false when signed out', DB.canEdit === false);
  ok('settings loaded from server', DB.s.dealership === "Test Motors");

  // wrong password
  let r = await Auth.signIn('admin', 'wrong');
  ok('wrong password rejected end-to-end', r.ok === false && /wrong/.test(r.msg));

  // correct sign-in
  r = await Auth.signIn('admin', 'admin');
  ok('correct sign-in succeeds end-to-end', r.ok === true);
  ok('mustChange surfaced on first login', r.mustChange === true);
  ok('DB.canEdit flips true after sign-in', DB.canEdit === true);
  ok('admin snapshot pulled after sign-in (customers now visible)', DB.customers.size === 1 && DB.customers.get('existing-cust').name === 'Existing Customer');
  ok('session cookie carried on subsequent requests', !!FAKE.currentCookie);

  // write a doc as staff, confirm it lands and is visible
  await DB.put('customers', 'cus-1', {name:'Jane Doe', phone:'0722000000'});
  ok('staff write succeeds', FAKE.docs.has('customers:cus-1'));
  ok('local map updated optimistically', DB.customers.get('cus-1').name === 'Jane Doe');

  // patch / remove
  await DB.patch('customers', 'cus-1', {phone:'0733111222'});
  ok('patch merges rather than replaces', DB.customers.get('cus-1').name === 'Jane Doe' && DB.customers.get('cus-1').phone === '0733111222');
  await DB.remove('customers', 'cus-1');
  ok('remove deletes locally and server-side', !DB.customers.has('cus-1') && !FAKE.docs.has('customers:cus-1'));

  // counters — atomic, gap-free, prefixed correctly
  const n1 = await nextNo('invoice');
  const n2 = await nextNo('invoice');
  ok('counter format correct', /^INV-\d{4}-00001$/.test(n1), n1);
  ok('counter increments without gaps', n2 === n1.replace('00001','00002'), n2);

  // upload
  const fakeFile = { name: 'photo.jpg', type: 'image/jpeg' };
  const assetId = await DB.upload(fakeFile);
  ok('upload returns an asset id', typeof assetId === 'string' && assetId.length > 0);

  // change password (forced first-login flow)
  const cp = await Auth.changePassword('admin', 'admin', 'Nairobi2026');
  ok('password change succeeds', cp.ok === true);
  await Auth.signOut();
  const wrongOld = await Auth.signIn('admin', 'admin');
  ok('old password rejected after change', wrongOld.ok === false);
  const rightNew = await Auth.signIn('admin', 'Nairobi2026');
  ok('new password accepted', rightNew.ok === true);

  // role enforcement: a cashier cannot read the audit log or create users
  await api2CreateCashier();
  async function api2CreateCashier(){
    FAKE.users.set('csh-1', {id:'csh-1', username:'cashier1', email:'', name:'Cashier One',
      role:'cashier', password:'Cashier2026', mustChange:false, active:true, createdAt:new Date().toISOString(), lastLogin:null});
  }
  await Auth.signOut();
  const cshr = await Auth.signIn('cashier1', 'Cashier2026');
  ok('cashier account signs in', cshr.ok === true);
  ok('cashier cannot read audit (server denies, DB.audit stays empty)', DB.audit.size === 0);
  ok('cashier CAN read customers (staff-level)', DB.customers.size === 1 && DB.customers.get('existing-cust').name === 'Existing Customer');

  // sign out drops back to public snapshot
  await Auth.signOut();
  ok('sign-out clears session', Auth.session === null);
  ok('sign-out drops canEdit', DB.canEdit === false);
  ok('sign-out reverts to public data (cars visible, customers not)', DB.cars.size === 1 && DB.customers.size === 0);

  console.log(out.join('\n'));
  const f = out.filter(l=>l.startsWith('FAIL'));
  console.log('\n'+(out.length-f.length)+'/'+out.length+' passed');
  process.exit(f.length?1:0);
})();

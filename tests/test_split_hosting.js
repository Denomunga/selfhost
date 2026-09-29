/* Split-hosting verification: Vercel (web/) + Render (API) + Atlas + R2.
 *
 * Boots the REAL Express app (no MongoDB — db.js is stubbed in require.cache
 * with an in-memory store shaped exactly like the real one) with the env a
 * split deployment uses: CORS_ORIGIN allowlist, COOKIE_SAMESITE=none,
 * COOKIE_SECURE=true. Then exercises the cross-origin surface:
 *   - CORS preflight + response headers for allowed/denied origins
 *   - Origin-check middleware blocking cross-site writes (CSRF defense)
 *   - login over an allowed origin -> SameSite=None; Secure session cookie
 *   - cookie accepted on authed routes
 *   - upload round-trip through the local storage backend (tmp UPLOAD_DIR)
 *   - SSE stream reachable cross-origin
 * plus child-process checks of the SameSite startup guard and the R2
 * backend selection with a stubbed @aws-sdk/client-s3.
 *
 * No MongoDB, Docker, network, or browser needed — node tests/test_split_hosting.js
 */
"use strict";
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SERVER = path.join(ROOT, "server");
const PORT = 4571;
const ALLOWED = ["https://sheriff-motors.vercel.app", "https://sheriff-motors-git-main.vercel.app"];
const ALLOWED_FIRST = ALLOWED[0];
const EVIL = "https://evil.example";
const API = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("ok   - " + name); }
  else { failed++; console.log("FAIL - " + name + (extra ? " :: " + extra : "")); }
}

/* ---------- env for the split deployment, set BEFORE any server require ---------- */
process.env.PORT = String(PORT);
process.env.JWT_SECRET = "split-hosting-test-secret-0123456789abcdef";
process.env.CORS_ORIGIN = ALLOWED.join(", ");
process.env.COOKIE_SAMESITE = "none";
process.env.COOKIE_SECURE = "true";
process.env.TRUST_PROXY = "1";
const TMP_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "sheriff-split-uploads-"));
process.env.UPLOAD_DIR = TMP_UPLOADS;
delete process.env.R2_BUCKET; // local backend for the in-process boot

/* ---------- in-memory DB shaped like the real Mongo collections ---------- */
function makeCollection(rows) {
  function matches(row, filter) {
    for (const [k, v] of Object.entries(filter || {})) {
      if (k === "$or") { if (!v.some((branch) => matches(row, branch))) return false; continue; }
      // The login lookup uses a case-insensitive collation; mimic strength:2
      // for the fields it applies to.
      if (typeof row[k] === "string" && typeof v === "string") {
        if (row[k].toLowerCase() !== v.toLowerCase()) return false;
      } else if (row[k] !== v) return false;
    }
    return true;
  }
  return {
    async findOne(filter) { return rows.find((r) => matches(r, filter)) || null; },
    find(filter) {
      const out = rows.filter((r) => matches(r, filter));
      return { sort: () => ({ toArray: async () => out.slice() }) };
    },
    async updateOne(filter, update, opts) {
      let row = rows.find((r) => matches(r, filter));
      if (!row) {
        if (!opts || !opts.upsert) return { matchedCount: 0, modifiedCount: 0 };
        row = {};
        for (const [k, v] of Object.entries(filter)) if (typeof v !== "object") row[k] = v;
        rows.push(row);
      }
      Object.assign(row, update.$set || {});
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async insertOne(doc) { rows.push(doc); return { insertedId: doc._id }; },
    async deleteOne(filter) {
      const i = rows.findIndex((r) => matches(r, filter));
      if (i >= 0) rows.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    }
  };
}

const ROWS = {
  documents: [
    { collection: "cars", id: "car-1", data: { id: "car-1", make: "Subaru", model: "Impreza", year: 2021, price: 25000, status: "available", images: [] }, updated_at: new Date() },
    { collection: "parts", id: "part-1", data: { id: "part-1", name: "Brake pads", category: "brakes", stock: 4, price: 89, images: [] }, updated_at: new Date() },
    { collection: "stories", id: "story-1", data: { id: "story-1", title: "Launch", body: "x" }, updated_at: new Date() },
    { collection: "settings", id: "site", data: { siteName: "Sheriff Motors" }, updated_at: new Date() }
  ],
  auth_users: [], // seeded after hashPassword is available
  counters: [],
  assets: []
};

require.cache[require.resolve("../server/src/db")] = {
  id: require.resolve("../server/src/db"),
  filename: require.resolve("../server/src/db"),
  loaded: true,
  exports: {
    connectMongo: async () => ({}),
    getDb: () => ({ collection: (name) => makeCollection(ROWS[name] || (ROWS[name] = [])) }),
    closeMongo: async () => {}
  }
};

/* ---------- seed a staff account with a REAL bcrypt hash ---------- */
const { hashPassword } = require("../server/src/auth");
const PASSWORD = "CorrectHorse1!";

/* ---------- tiny raw HTTP client: exact header control, no fetch quirks ---------- */
function rawRequest({ method = "GET", path: p, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, method, path: p, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
const jsonHeaders = (origin, body) => Object.assign(
  { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
  origin ? { origin } : {}
);
const loginBody = () => JSON.stringify({ username: "admin", password: PASSWORD });

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { const r = await rawRequest({ path: "/api/health" }); if (r.status === 200) return; }
    catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("server did not start");
}

/* ---------- child-process checks (guard + R2 backend) ---------- */
function runNode(script, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, ["-e", script], { cwd: ROOT, env }, (err, stdout, stderr) => {
      resolve({ code: err && typeof err.code === "number" ? err.code : 0, stdout, stderr });
    });
  });
}

async function checkStartupGuard() {
  const script = `
    process.env.JWT_SECRET = "guard-check-secret-0123456789abcd";
    process.env.COOKIE_SAMESITE = "none";
    delete process.env.COOKIE_SECURE;
    require(${JSON.stringify(path.join(SERVER, "src", "auth.js").replace(/\\/g, "/"))});
    console.log("LOADED_WITHOUT_GUARD");
  `;
  const r = await runNode(script, { ...process.env, COOKIE_SAMESITE: "none" });
  delete process.env.COOKIE_SECURE; // restore nothing — main process env unaffected
  check("startup guard: SameSite=none without Secure refuses to boot",
    r.code === 1 && /COOKIE_SECURE/.test(r.stderr) && !r.stdout.includes("LOADED_WITHOUT_GUARD"),
    `code=${r.code} stderr=${r.stderr.trim().slice(0, 120)}`);

  const okScript = `
    process.env.JWT_SECRET = "guard-check-secret-0123456789abcd";
    process.env.COOKIE_SAMESITE = "none";
    process.env.COOKIE_SECURE = "true";
    require(${JSON.stringify(path.join(SERVER, "src", "auth.js").replace(/\\/g, "/"))});
    console.log("LOADED");
  `;
  const ok = await runNode(okScript, { ...process.env });
  check("startup guard: SameSite=none + Secure boots fine", ok.code === 0 && ok.stdout.includes("LOADED"),
    `code=${ok.code} stderr=${ok.stderr.trim().slice(0, 120)}`);
}

async function checkR2Backend() {
  const script = `
    const path = require("path");
    const sdkPath = require.resolve("@aws-sdk/client-s3", { paths: [${JSON.stringify(path.join(SERVER).replace(/\\/g, "/"))}] });
    const calls = { puts: [], gets: [] };
    class FakeS3Client {
      constructor(cfg) { calls.client = cfg; }
      async send(cmd) {
        if (cmd.constructor.name === "PutObjectCommand") { calls.puts.push(cmd.input); return {}; }
        if (cmd.constructor.name === "GetObjectCommand") {
          calls.gets.push(cmd.input);
          if (cmd.input.Key === "missing") { const e = new Error("gone"); e.name = "NoSuchKey"; throw e; }
          const { Readable } = require("stream");
          return { Body: Readable.from([Buffer.from("r2-bytes")]) };
        }
        throw new Error("unexpected " + cmd.constructor.name);
      }
    }
    class PutObjectCommand { constructor(input) { this.input = input; } }
    class GetObjectCommand { constructor(input) { this.input = input; } }
    require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true,
      exports: { S3Client: FakeS3Client, PutObjectCommand, GetObjectCommand } };
    process.env.R2_ACCOUNT_ID = "acct1";
    process.env.R2_ACCESS_KEY_ID = "AKID";
    process.env.R2_SECRET_ACCESS_KEY = "SECRET";
    process.env.R2_BUCKET = "photos";
    const { createBackend } = require(${JSON.stringify(path.join(SERVER, "src", "storage.js").replace(/\\/g, "/"))});
    (async () => {
      const b = createBackend();
      if (b.mode !== "r2") throw new Error("mode=" + b.mode);
      await b.put("a".repeat(32), Buffer.from("img-bytes"), "image/png");
      const s = await b.get("b".repeat(32));
      let bytes = ""; for await (const c of s) bytes += c;
      const miss = await b.get("missing");
      if (miss !== null) throw new Error("missing key did not return null");
      console.log(JSON.stringify({ mode: b.mode, client: calls.client, puts: calls.puts, gets: calls.gets, bytes }));
    })().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
  `;
  const r = await runNode(script, { ...process.env });
  let info = null;
  try { info = JSON.parse(r.stdout.trim().split("\n").pop()); } catch { /* reported below */ }
  check("R2 backend selected when R2_* vars are set", r.code === 0 && info && info.mode === "r2",
    `code=${r.code} out=${r.stdout.trim().slice(0, 140)} err=${r.stderr.trim().slice(0, 140)}`);
  if (info) {
    const c = info.client || {};
    check("R2 client uses R2 endpoint + path style + credentials",
      c.endpoint === "https://acct1.r2.cloudflarestorage.com" && c.region === "auto" &&
      c.forcePathStyle === true && c.credentials && c.credentials.accessKeyId === "AKID" &&
      c.credentials.secretAccessKey === "SECRET");
    const put = (info.puts || [])[0] || {};
    check("R2 put sends Bucket/Key/Body/ContentType",
      put.Bucket === "photos" && put.Key === "a".repeat(32) &&
      Buffer.isBuffer(put.Body) && put.Body.toString() === "img-bytes" && put.ContentType === "image/png");
    check("R2 get streams the object body back", info.bytes === "r2-bytes" &&
      (info.gets || []).length === 2);
  }
}

/* ---------- static checks on the deploy artifacts ---------- */
function checkDeployArtifacts() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
  const scripts = [...indexHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  check("index.html loads js/api-config.js first",
    scripts[0] === "js/api-config.js", JSON.stringify(scripts.slice(0, 2)));
  check("index.html keeps the <!--CSP--> placeholder for vercel-build.js",
    indexHtml.includes("<!--CSP-->"));
  check("web/js/api-config.js exists with same-origin default",
    fs.existsSync(path.join(ROOT, "web", "js", "api-config.js")) &&
    /__SHERIFF_API_BASE__\s*=\s*window\.__SHERIFF_API_BASE__\s*\|\|\s*""/.test(
      fs.readFileSync(path.join(ROOT, "web", "js", "api-config.js"), "utf8")));

  const buildSrc = fs.readFileSync(path.join(ROOT, "vercel-build.js"), "utf8");
  check("vercel-build.js reads API_BASE_URL and rewrites api-config.js + CSP",
    /process\.env\.API_BASE_URL/.test(buildSrc) &&
    buildSrc.includes("web/js/api-config.js") &&
    buildSrc.includes("<!--CSP-->"));

  const renderYaml = fs.readFileSync(path.join(ROOT, "render.yaml"), "utf8");
  check("render.yaml is a Docker service with the split env documented",
    /type:\s*web/.test(renderYaml) && /docker/.test(renderYaml) &&
    /CORS_ORIGIN/.test(renderYaml) && /COOKIE_SAMESITE/.test(renderYaml) &&
    /MONGODB_URI/.test(renderYaml) && /JWT_SECRET/.test(renderYaml));

  try {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
    check("vercel.json parses, builds web/ and adds security headers",
      v.buildCommand === "node vercel-build.js" && v.outputDirectory === "web" &&
      Array.isArray(v.headers) && JSON.stringify(v.headers).includes("X-Frame-Options"));
  } catch (e) {
    check("vercel.json parses, builds web/ and adds security headers", false, String(e));
  }
}

/* ---------- main: boot the real app, then hammer the cross-origin surface ---------- */
async function main() {
  ROWS.auth_users.push({
    _id: "usr-splitadmin", username: "admin", email: "admin@sheriffmotors.com",
    name: "Admin", role: "admin", password_hash: await hashPassword(PASSWORD),
    must_change: false, active: true, created_at: new Date(), last_login: null
  });

  require("../server/src/index.js"); // boots on PORT with the stubbed db
  await waitForServer();
  console.log("--- server up on " + API + " ---");

  // 1. CORS preflight from the Vercel origin
  const pre = await rawRequest({
    method: "OPTIONS", path: "/api/public/snapshot",
    headers: { origin: ALLOWED_FIRST, "access-control-request-method": "GET" }
  });
  check("preflight from allowed origin -> 204 + ACAO + credentials",
    pre.status === 204 && pre.headers["access-control-allow-origin"] === ALLOWED_FIRST &&
    pre.headers["access-control-allow-credentials"] === "true",
    `status=${pre.status} acao=${pre.headers["access-control-allow-origin"]}`);

  // 2. preflight from a foreign origin gets no CORS grant
  const preEvil = await rawRequest({
    method: "OPTIONS", path: "/api/public/snapshot",
    headers: { origin: EVIL, "access-control-request-method": "GET" }
  });
  check("preflight from hostile origin -> no ACAO (browser blocks the call)",
    !preEvil.headers["access-control-allow-origin"],
    `acao=${preEvil.headers["access-control-allow-origin"]}`);

  // 3. GET with allowed origin: data + CORS headers
  const snap = await rawRequest({ path: "/api/public/snapshot", headers: { origin: ALLOWED_FIRST } });
  let snapBody = null;
  try { snapBody = JSON.parse(snap.body.toString()); } catch { /* checked below */ }
  check("GET snapshot from allowed origin -> 200 + ACAO + data",
    snap.status === 200 && snap.headers["access-control-allow-origin"] === ALLOWED_FIRST &&
    snapBody && snapBody.cars && snapBody.cars[0] && snapBody.cars[0].model === "Impreza");

  // 4. GET with hostile origin: served, but no ACAO so a browser can't read it
  const snapEvil = await rawRequest({ path: "/api/public/snapshot", headers: { origin: EVIL } });
  check("GET snapshot from hostile origin -> no ACAO header",
    !snapEvil.headers["access-control-allow-origin"]);

  // 5. HSTS is on because COOKIE_SECURE=true (HTTPS deployment)
  check("HSTS header present (COOKIE_SECURE=true)",
    snap.headers["strict-transport-security"] === "max-age=31536000; includeSubDomains");

  // 6. login from a hostile origin is refused before it reaches the route
  const evilLogin = await rawRequest({
    method: "POST", path: "/api/auth/login",
    headers: jsonHeaders(EVIL, loginBody()),
    body: loginBody()
  });
  check("POST login from hostile origin -> 403, no session cookie set",
    evilLogin.status === 403 &&
    JSON.parse(evilLogin.body.toString()).error === "Cross-origin request rejected." &&
    !evilLogin.headers["set-cookie"],
    `status=${evilLogin.status} set-cookie=${JSON.stringify(evilLogin.headers["set-cookie"])}`);

  // 7. login with NO Origin header still works (curl, server-to-server)
  const noOriginLogin = await rawRequest({
    method: "POST", path: "/api/auth/login",
    headers: jsonHeaders(null, loginBody()),
    body: loginBody()
  });
  check("POST login without Origin header -> 200 (non-browser clients)",
    noOriginLogin.status === 200);

  // 8. login from the allowed origin -> SameSite=None; Secure cookie
  const login = await rawRequest({
    method: "POST", path: "/api/auth/login",
    headers: jsonHeaders(ALLOWED_FIRST, loginBody()),
    body: loginBody()
  });
  const setCookie = String(login.headers["set-cookie"] || "");
  const loginBody = JSON.parse(login.body.toString());
  check("POST login from allowed origin -> 200 + user payload",
    login.status === 200 && loginBody.user && loginBody.user.role === "admin");
  check("session cookie is SameSite=None; Secure; HttpOnly",
    /sheriff_session=/.test(setCookie) && /SameSite=None/.test(setCookie) &&
    /Secure/.test(setCookie) && /HttpOnly/.test(setCookie),
    setCookie.slice(0, 120));

  // 9. the cross-site cookie is accepted on authed routes
  const cookieHeader = setCookie.split(";")[0];
  const admin = await rawRequest({
    path: "/api/admin/snapshot",
    headers: { origin: ALLOWED_FIRST, cookie: cookieHeader }
  });
  const adminBody = JSON.parse(admin.body.toString());
  check("signed-in request with cookie -> 200 role-filtered snapshot",
    admin.status === 200 && adminBody.cars && adminBody.cars.length === 1);
  const noCookie = await rawRequest({ path: "/api/admin/snapshot", headers: { origin: ALLOWED_FIRST } });
  check("signed-out request to admin snapshot -> 401", noCookie.status === 401);

  // 10. upload round-trip through the LOCAL backend into the tmp UPLOAD_DIR
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("IHDR-fake-png-bytes")
  ]);
  const boundary = "----splitTestBoundary";
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const noAuthUp = await rawRequest({
    method: "POST", path: "/api/uploads",
    headers: { origin: ALLOWED_FIRST, "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": multipart.length },
    body: multipart
  });
  check("upload without session -> 401", noAuthUp.status === 401);

  const up = await rawRequest({
    method: "POST", path: "/api/uploads",
    headers: {
      origin: ALLOWED_FIRST, cookie: cookieHeader,
      "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": multipart.length
    },
    body: multipart
  });
  const upBody = JSON.parse(up.body.toString());
  check("upload with session -> 201 {id}", up.status === 201 && /^[a-f0-9]{32}$/.test(upBody.id || ""),
    `status=${up.status} body=${up.body.toString().slice(0, 100)}`);
  check("uploaded bytes landed on the local backend (tmp UPLOAD_DIR)",
    upBody.id && fs.existsSync(path.join(TMP_UPLOADS, upBody.id)) &&
    fs.readFileSync(path.join(TMP_UPLOADS, upBody.id)).equals(png));

  const blob = await rawRequest({ path: "/_blob/" + upBody.id, headers: { origin: ALLOWED_FIRST } });
  check("GET /_blob/:id streams the image back with its content type",
    blob.status === 200 && blob.body.equals(png) && blob.headers["content-type"] === "image/png");
  const badBlob = await rawRequest({ path: "/_blob/nothex" });
  check("GET /_blob/:id with a non-hex id -> 404", badBlob.status === 404);

  // 11. SSE stream is reachable cross-origin (the live-update channel)
  const sse = await rawRequest({ path: "/api/events", headers: { origin: ALLOWED_FIRST } });
  check("SSE stream answers on allowed origin with event-stream + ACAO",
    sse.status === 200 && /^text\/event-stream/.test(sse.headers["content-type"] || "") &&
    sse.headers["access-control-allow-origin"] === ALLOWED_FIRST &&
    sse.body.toString().includes("event: hello"));

  // 12. child-process checks
  await checkStartupGuard();
  await checkR2Backend();

  // 13. deploy artifacts committed and wired
  checkDeployArtifacts();

  console.log(`---\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(TMP_UPLOADS, { recursive: true, force: true }); } catch { /* best effort */ }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

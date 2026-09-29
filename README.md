# Sheriff Motors — self-hosted

A Subaru dealership site (vehicles + parts counter + a full back-office:
invoices, payments, refunds, purchasing, a double-entry ledger, reports,
audit log, staff accounts) that runs on your own server instead of
claude.ai. MongoDB-backed storage, real authentication, real authorization.

## How this is put together

- **`server/`** — a Node/Express API backed by MongoDB. This is the
  new part. It owns authentication (bcrypt password hashes, signed
  session cookies), authorization (who may read/write which kind of
  record — see `server/src/policy.js`), atomic document numbering
  (`INV-2026-00001`, even under concurrent sales), and photo
  storage.
- **`web/`** — the frontend, split into plain CSS and JS files (no
  build step, no bundler — the browser loads them directly, in the order
  listed in `index.html`). `js/03-data.js` and `js/08-identity-ledger.js`
  are the only files that talk to the server, via `fetch()`; everything
  else — the storefront, the dashboard, the accounting — is unchanged
  business logic covered by the tests in `tests/`.
- **`tests/`** — two Node scripts that load the real frontend into an
  in-memory JS sandbox, run it against a faithful fake of the real API
  (including the real authorization policy from `server/src/policy.js`),
  and drive actual sales, refunds, and role checks through it. No
  MongoDB or npm install required to run these — see below.

## Before you start: what I could and couldn't test here

The available tests exercise the frontend against an in-memory API fake;
they do not connect to MongoDB. What they cover:

- Syntax-checked every server file (`node --check`).
- Unit-tested the authorization policy directly (18 checks — who can
  read/write which collection).
- Verified the atomic-numbering arithmetic and format.
- Built a faithful in-memory fake of the entire API contract (same
  routes, same responses, same authorization rules) and ran the real
  frontend against it — 26 checks on login/session/CRUD/roles, plus 22
  more driving an actual mixed vehicle-and-parts sale, a refund, and
  all 25 admin pages, through the exact same business logic already
  proven in 222 earlier tests against the hosted version.

They do not cover a live MongoDB connection, TLS/cookie behavior in a
real browser, or file upload against a real disk. The setup steps below
include a database readiness check before seeding.

## Quick start (Docker)

```bash
cd sheriff-motors-selfhosted
export JWT_SECRET=$(openssl rand -hex 32)
export MONGO_ROOT_PASSWORD=$(openssl rand -hex 32)
docker compose up --build
```

Then, in a second terminal, create MongoDB indexes and load demo data:

```bash
docker compose exec server node src/migrate.js
docker compose exec server node src/seed.js
```

Open **http://localhost:4000** — you should see the storefront with 15
demo Subaru and 19 demo parts. Go to **http://localhost:4000/#/admin**
and sign in with:

```
username: admin
password: admin
```

You'll be forced to change that password immediately — do that before
anything else.

## Quick start (without Docker)

You'll need Node.js 18+ and a MongoDB server (local or hosted —
MongoDB Atlas and other MongoDB-compatible providers work).

```bash
cd sheriff-motors-selfhosted/server
npm install
cp .env.example .env
# edit .env: set MONGODB_URI to your MongoDB connection string,
# and JWT_SECRET to the output of `openssl rand -hex 32`

npm run migrate   # creates required MongoDB indexes
npm run seed       # demo vehicles, parts, stories, and the default admin
npm start           # serves the API *and* web/ together on :4000
```

Open http://localhost:4000 and sign in the same way as above.

## Split hosting: Vercel (frontend) + Render (API) + Atlas + R2

The same codebase also deploys as four managed pieces, no Docker
required. `web/` is a fully static site; the API is a plain Node app;
uploads and the database move to hosted services:

| Piece        | Where                | Replaces                       |
|--------------|----------------------|--------------------------------|
| Frontend     | Vercel               | Express static serving of `web/` |
| API          | Render (`render.yaml` blueprint) | the Docker `server` service |
| Database     | MongoDB Atlas        | the Docker `db` service        |
| Photo storage| Cloudflare R2        | `UPLOAD_DIR` local disk        |

**1. MongoDB Atlas.** Create an M0 (free) cluster → Database → Connect →
create a database user → copy the `mongodb+srv://` connection string. In
Network Access, allow `0.0.0.0/0` — Render's outbound IPs aren't fixed
without a paid add-on; the database user + TLS is the actual protection.
Set that string as `MONGODB_URI` in the Render dashboard.

**2. Cloudflare R2.** Create a bucket (e.g. `sheriff-motors-uploads`) →
Manage R2 API Tokens → create a token with Object Read & Write → copy the
Access Key ID / Secret and your account ID into the Render env vars
(`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`). With those set the API stores photos in R2; without them it
keeps using local disk. **Note:** photos uploaded to local disk won't
appear after you switch to R2 — re-upload them (or copy them into the
bucket keyed by their 32-hex-char asset IDs) before relying on it.

**3. Render.** New → Blueprint → pick your repo → `render.yaml` is
detected. Fill in `MONGODB_URI`, `JWT_SECRET` (`openssl rand -hex 32`),
`CORS_ORIGIN` (your Vercel URL, e.g. `https://sheriff-motors.vercel.app`),
and the R2 values. Keep the `starter` plan — the free tier sleeps, which
kills the live event stream and gives visitors ~50s cold starts.

**4. Vercel.** New Project → import the same repo → Vercel reads
`vercel.json`, which runs `vercel-build.js` (it writes your API origin
into `web/api-config.js` and the CSP meta tag into `index.html`) and
publishes `web/`. Set one env var: `API_BASE_URL` = your Render URL,
e.g. `https://sheriff-motors-api.onrender.com`. Then run migrate + seed once
against Atlas from any machine with the env vars set:

```bash
cd server && npm install && cp .env.example .env   # put the Atlas URI + JWT_SECRET in .env
npm run migrate && npm run seed
```

**How the pieces trust each other.** The browser talks to the Render API
directly from the Vercel page: CORS allows only your `CORS_ORIGIN`
(see the origin check in `server/src/index.js`), and the session cookie
is `SameSite=None; Secure` (`COOKIE_SAMESITE=none` + `COOKIE_SECURE=true`
on Render) because Vercel → Render is a cross-site request. Uploaded
photos render through `<img>` tags pointed at the API's `/_blob/:id`
endpoint, which streams from R2. The live update stream (`/api/events`)
is a normal cross-origin EventSource and reconnects on its own; Render's
proxy holds long-lived connections fine.

## What's actually yours to run anywhere

Everything. There's no dependency on claude.ai or any Anthropic
service anywhere in this package — the server is a normal Express app,
the database is MongoDB, the frontend is a normal
static HTML file. Deploy the `server/` folder anywhere Node runs
(a VPS, Render, Railway, Fly.io, your own hardware), point it at any
MongoDB deployment, and it works the same way.

## Security notes, read before putting this on the public internet

- **Change the default admin password immediately** — the app forces
  this on first login, but do it before you seed real data.
- **Set `JWT_SECRET` to a real random value.** The server refuses to
  start with a missing, short, or placeholder secret — but double-check
  your `.env` actually has a real value and isn't the placeholder.
- **Set `MONGO_ROOT_PASSWORD` to a real random value for Docker Compose.**
  Compose requires it and publishes MongoDB only on localhost.
- **Put this behind a reverse proxy with TLS** (Caddy, nginx, or your
  hosting provider's built-in HTTPS) — the app itself speaks plain HTTP;
  it doesn't terminate TLS. The Compose file binds the app to
  `127.0.0.1:4000` so the only way in is through that proxy, and sets
  `TRUST_PROXY=1` so rate limiting sees real client IPs. If you run
  without Docker, set `TRUST_PROXY=1` in `.env` when you're behind a proxy.
- **Set `COOKIE_SECURE=true` once you're serving over HTTPS** (you should
  be, in production) — this stops the session cookie from ever being sent
  over a plain HTTP connection.
- **Login is rate-limited** — 20 failed sign-ins per 15 minutes per source
  IP, plus a general brake on the whole API. This is on by default; no
  configuration needed.
- **Disabling an account takes effect immediately** — sessions are
  re-checked against the database on every request, so a disabled or
  deleted account stops working at once rather than at token expiry,
  and role changes apply without waiting for anyone to sign in again.
- **The books are append-only where it matters** — the API refuses to
  hard-delete invoices, payments, ledger entries, and the like (void them
  instead), and audit-log entries can never be edited or deleted once
  written. Only inventory (vehicles, parts, stories) and the inquiry
  inbox can be hard-deleted.
- **Back up the database.** Use `mongodump` or your provider's backup
  tooling — invoices, payments and the ledger live in the `documents`
  collection.
- **Uploaded photos live on local disk** at `UPLOAD_DIR` (default
  `server/uploads/`), or in Cloudflare R2 when the `R2_*` env vars are
  set (the split deployment). Uploads are checked against real
  PNG/JPEG/WebP file signatures, not just the browser's word for it. Back
  the directory (or the R2 bucket) up too.

## Roles

Three roles exist: `cashier`, `manager`, `admin`. Today the
distinction that's actually enforced server-side (`server/src/policy.js`)
is coarse: any signed-in account can use the whole dashboard except
Users & Roles and the audit log, which are admin-only. The dashboard's
role dropdown exists so you can extend this — `policy.js` is the one
file to edit for finer-grained control (e.g. only managers can void an
invoice, only admins can record expenses over a threshold).

## Extending it

- **New fields on an existing page** (say, a "chassis number" on
  vehicles) — this is unchanged from the hosted version: edit the
  relevant form and view functions in `web/js/` directly. The
  generic document store on the server needs no schema change to carry
  a new field.
- **A genuinely new kind of record** — add its name to `ALL_COLLECTIONS`
  in `server/src/policy.js` (and decide its read/write level there),
  add it to the `COLLECTIONS` array in `web/js/03-data.js`, and it's
  fully wired into snapshots, `DB.put/patch/remove`,
  and live polling with no further server code.
- **Real-time updates** use Server-Sent Events (`GET /api/events`): every
  successful write broadcasts which collection changed, and each open tab
  refetches the snapshot it is allowed to see — so the stream itself
  carries no document data, and public tabs only wake for changes to
  cars/parts/stories/settings. A polling fallback (4s for staff, 60s for
  public) keeps the site working if a browser or proxy won't hold a
  stream open. Behind a reverse proxy, make sure the stream isn't
  buffered: the server sends `X-Accel-Buffering: no` (honoured by nginx),
  and Caddy streams by default. Every open tab holds one long-lived
  connection, so raise the file-descriptor limit (`ulimit -n`) if you
  expect very heavy traffic.

## Directory layout

```
sheriff-motors-selfhosted/
├── docker-compose.yml
├── vercel.json             Vercel config for the static frontend (split hosting)
├── vercel-build.js         injects API_BASE_URL into api-config.js + the CSP meta
├── render.yaml             Render blueprint for the API (split hosting)
├── server/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js          Express app entry point
│       ├── db.js             MongoDB client and indexes
│       ├── auth.js           bcrypt + JWT session helpers
│       ├── events.js         in-process change bus for Server-Sent Events
│       ├── storage.js        upload backend: Cloudflare R2 or local disk
│       ├── policy.js         who can read/write what — the RBAC rules
│       ├── migrate.js        creates required MongoDB indexes
│       ├── seed.js           demo data + default admin account
│       ├── seedData.js       the demo data itself (extracted verbatim
│       │                     from the working hosted version)
│       ├── middleware/session.js
│       └── routes/
│           ├── auth.routes.js         login, logout, me, users
│           ├── collections.routes.js  generic document CRUD + snapshots
│           ├── counters.routes.js     atomic invoice/receipt numbering
│           ├── events.routes.js       the Server-Sent Events stream
│           └── uploads.routes.js      photo upload + serving
├── web/
│   ├── index.html                 static shell + ordered <script>/<link> tags
│   ├── css/
│   │   ├── base.css               design tokens, layout, buttons, cards, nav, filters
│   │   ├── cinematic.css          hero, chapters, rails, zoom, cursor, preloader
│   │   └── admin.css              back-office shell, login, invoices/receipts, print
│   └── js/                        loaded in this order (later files use earlier ones)
│       ├── api-config.js          API origin (rewritten by vercel-build.js)
│       ├── 01-utils.js            KSh/KM/date formatting, DOM helpers, toast, modal
│       ├── 02-art.js              generated Kenyan landscapes, vehicle + part artwork
│       ├── 03-data.js             api() client, the DB store, settings defaults
│       ├── 04-constants.js        feature catalogue, spare-part categories
│       ├── 05-storefront.js       nav, home, collection, parts, vehicle pages,
│       │                          stories, about, contact, inquiry form
│       ├── 06-admin-inventory.js  vehicle / part / story / inquiry / settings forms
│       ├── 07-cinema.js           smooth scroll, pinned chapters, parallax, cursor
│       ├── 08-identity-ledger.js  Auth client, audit trail, numbering, Ledger
│       ├── 09-admin-shell.js      login screen, dashboard shell, shared helpers
│       ├── 10-admin-sales.js      overview, orders, sell flow, invoices, payments,
│       │                          receipts, refunds, customers
│       ├── 11-admin-cash.js       till, cash movements, expenses
│       ├── 12-admin-purchasing.js purchases, suppliers
│       ├── 13-admin-reports.js    chart of accounts, ledger, reports, audit log
│       ├── 14-admin-users.js      users, passwords, photos, printing, action wiring
│       └── 15-router.js           router, SEO, page mounting, app boot (must be last)
└── tests/
    ├── test_frontend_api.js      access-layer test (login, CRUD, roles)
    └── test_business_logic.js    real sale/refund/ledger through the API
```

## Running the tests

No MongoDB or `npm install` needed — they run the real frontend in a
sandboxed JS context against an in-memory fake of the API:

```bash
cd sheriff-motors-selfhosted/tests
node test_frontend_api.js
node test_business_logic.js
```

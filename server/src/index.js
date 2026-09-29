"use strict";
require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
const { rateLimit } = require("express-rate-limit");
const { connectMongo } = require("./db");

const { attachSession } = require("./middleware/session");
const { wrap } = require("./middleware/async");
const authRoutes = require("./routes/auth.routes");
const collectionsRoutes = require("./routes/collections.routes");
const countersRoutes = require("./routes/counters.routes");
const eventsRoutes = require("./routes/events.routes");
const { router: uploadsRouter, blobHandler } = require("./routes/uploads.routes");

const app = express();
const PORT = process.env.PORT || 4000;

// Set TRUST_PROXY=1 (or the number of proxy hops in front of this server)
// when running behind nginx/Caddy/a hosting load balancer, so rate limiting
// and logs see real client IPs instead of the proxy's. Leave unset when the
// app is reached directly.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

// Same-origin by default (the server also serves the frontend below).
// Set CORS_ORIGIN when a browser on another origin talks to this API — the
// split deployment, where web/ is on Vercel and this API is on Render.
// Comma-separated for several origins (e.g. the Vercel domain plus previews).
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

if (allowedOrigins.length) {
  app.use(cors({
    origin(origin, cb) {
      // No Origin header = curl, server-to-server, or a same-origin request
      // sent without one — nothing for CORS to protect. Browsers always
      // send Origin on cross-site requests.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  }));

  // The split deployment sets SameSite=None so the session cookie travels
  // from the Vercel frontend to this API — which also removes the cookie's
  // built-in CSRF protection. The CORS preflight stops a hostile site from
  // reading responses; this check stops it from even attempting the write:
  // any state-changing request carrying a foreign Origin is rejected. When
  // CORS_ORIGIN is unset (self-hosted, same-origin) this stays off and
  // SameSite=Lax remains the defense.
  app.use("/api", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.includes(origin)) return next();
    return res.status(403).json({ error: "Cross-origin request rejected." });
  });
}

app.disable("x-powered-by");

// The frontend uses inline event-handler attributes (onclick=...) and inline
// style attributes throughout, so those two need 'unsafe-inline'; inline
// <script> blocks stay blocked, which stops the usual XSS payload. External
// fonts are the only third-party origin the page talks to.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "script-src-attr 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // HSTS only makes sense once we're actually serving over HTTPS.
  if (process.env.COOKIE_SECURE === "true") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.use(cookieParser());
app.use(attachSession);

// Health check for Docker / load balancers. Mounted before the rate limiter
// on purpose: probes must never be throttled, and its response is a static
// JSON object, so it's cheap to serve.
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Coarse abuse brake for the whole API. The dashboard polls once every 4
// seconds per signed-in tab, so this stays well clear of normal use.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this connection. Wait a moment and try again." }
});
app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api", collectionsRoutes);
app.use("/api", countersRoutes);
app.use("/api", eventsRoutes);
app.use("/api/uploads", uploadsRouter);
app.get("/_blob/:id", wrap(blobHandler));

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
app.use("/public", express.static(PUBLIC_DIR));

// The frontend itself — a single static HTML file with everything inline.
const WEB_DIR = path.join(__dirname, "..", "..", "web");
app.use(express.static(WEB_DIR, { extensions: ["html"] }));
app.get("/", (req, res) => res.sendFile(path.join(WEB_DIR, "index.html")));

app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Something went wrong." });
});

connectMongo().then(() => {
  app.listen(PORT, () => {
    console.log(`Sheriff Motors server listening on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Could not connect to MongoDB", err);
  process.exit(1);
});

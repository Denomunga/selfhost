"use strict";
/* Runs on Vercel at build time. The frontend is plain static files, so the
 * "build" is just configuration injection from the API_BASE_URL env var:
 *
 *   1. web/api-config.js — tells the browser where the API lives
 *      (e.g. https://sheriff-motors-api.onrender.com).
 *   2. A CSP <meta> tag in index.html — whitelists that same origin for
 *      connect-src (fetch + the live event stream) and img-src (uploaded
 *      photos served by the API's /_blob endpoint). The meta tag replaces
 *      the <!--CSP--> placeholder; the other security headers come from
 *      vercel.json and apply to every response.
 *
 * Local development and the self-hosted Docker setup don't run this — the
 * committed api-config.js keeps an empty base, which means "same origin". */
const fs = require("fs");
const path = require("path");

const api = (process.env.API_BASE_URL || "").replace(/\/+$/, "");

fs.writeFileSync(
  path.join(__dirname, "web", "js", "api-config.js"),
  `"use strict";\n` +
  `window.__SHERIFF_API_BASE__ = ${JSON.stringify(api)};\n` +
  `const API_BASE = (typeof window !== "undefined" && window.__SHERIFF_API_BASE__) || "";\n`
);

const csp = [
  "default-src 'self'",
  "script-src 'self' blob:",
  "script-src-attr 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob:${api ? " " + api : ""}`,
  `connect-src 'self'${api ? " " + api : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

const htmlPath = path.join(__dirname, "web", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes("<!--CSP-->")) {
  console.error("web/index.html is missing the <!--CSP--> placeholder — CSP was not injected.");
  process.exit(1);
}
fs.writeFileSync(htmlPath, html.replace("<!--CSP-->", `<meta http-equiv="Content-Security-Policy" content="${csp}">`));

console.log(`Frontend configured: API at ${api || "(same origin)"}`);

"use strict";

/**
 * Production request logger.
 *
 * Prints one tidy line per API request:
 *   2026-09-30 21:35:01 | POST   /api/auth/login          | 200 |  312ms | 197.x.x.x
 *
 * Rules:
 *  - /_blob/* requests are skipped (high-volume image asset fetches — noise)
 *  - Static file requests (no /api prefix) are skipped
 *  - Cookie/token values are never logged
 */

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function ip(req) {
  // x-forwarded-for is set by Render / nginx / Caddy
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? fwd.split(",")[0] : req.socket.remoteAddress || "-").trim();
}

function requestLogger(req, res, next) {
  // Only log API calls — skip static files and blob asset fetches
  if (!req.path.startsWith("/api") || req.path === "/api/health") return next();

  const start = Date.now();

  res.on("finish", () => {
    const ms   = Date.now() - start;
    const meth = req.method.padEnd(6);
    const path = req.path.padEnd(36);
    const stat = res.statusCode;
    const addr = ip(req);

    // Flag suspicious responses so they stand out in the log
    const flag = stat >= 500 ? " !!!" : stat === 429 ? " RATELIMIT" : stat === 403 ? " BLOCKED" : stat === 401 ? " UNAUTH" : "";

    console.log(`${ts()} | ${meth} ${path} | ${stat} | ${String(ms).padStart(5)}ms | ${addr}${flag}`);
  });

  next();
}

/**
 * Log a named security / audit event.
 * Use for auth outcomes, admin actions — anything you'd want a paper trail for.
 *
 * secLog("LOGIN_OK",  req, { user: "admin" })
 * secLog("LOGIN_FAIL",req, { user: "badguy" })
 * secLog("LOGOUT",    req, { user: "admin" })
 */
function secLog(event, req, extra = {}) {
  const addr   = ip(req);
  const parts  = Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`${ts()} | SEC   ${event.padEnd(20)} | ${addr}${parts ? " | " + parts : ""}`);
}

module.exports = { requestLogger, secLog };

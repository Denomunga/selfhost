"use strict";
const { readSession } = require("../auth");
const { getDb } = require("../db");

/** Attaches req.session ({uid, username, role, name}) when a valid session
 *  cookie is present. The token only proves the cookie was issued; whether
 *  the account still exists, is still active, and what role it holds NOW is
 *  re-checked against the database on every request — so disabling an
 *  account or changing someone's role takes effect immediately instead of
 *  at token expiry (up to 12h later). Never rejects — routes decide for
 *  themselves whether a session is required, via policy.js. On a database
 *  error it fails closed (no session). */
async function attachSession(req, res, next) {
  const claims = readSession(req);
  if (claims) {
    try {
      const user = await getDb().collection("auth_users").findOne(
        { _id: claims.uid },
        { projection: { username: 1, name: 1, role: 1, active: 1 } }
      );
      if (user && user.active) {
        req.session = {
          uid: claims.uid,
          username: user.username,
          name: user.name || user.username,
          role: user.role
        };
      }
    } catch (e) {
      console.error("[SESSION] lookup failed", e);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session) return res.status(401).json({ error: "Sign in to continue." });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session) return res.status(401).json({ error: "Sign in to continue." });
  if (req.session.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  next();
}

module.exports = { attachSession, requireAuth, requireAdmin };

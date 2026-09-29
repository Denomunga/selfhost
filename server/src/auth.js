"use strict";
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const PLACEHOLDER_SECRETS = new Set([
  "replace-this-with-a-long-random-value",
  "change-me-please-use-a-real-random-secret",
  "change-me"
]);
if (
  !JWT_SECRET ||
  JWT_SECRET.length < 16 ||
  PLACEHOLDER_SECRETS.has(JWT_SECRET) ||
  PLACEHOLDER_SECRETS.has(JWT_SECRET.trim())
) {
  console.error(
    "JWT_SECRET is missing, too short, or still the placeholder from .env.example. " +
    "Set a long random value (e.g. `openssl rand -hex 32`) before starting the server."
  );
  process.exit(1);
}

const COOKIE_NAME = "sheriff_session";
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
// SameSite=Lax is right when the frontend is served by this same app
// (the default). The split deployment — frontend on Vercel, API on Render
// — is a cross-site request from the cookie's point of view, so it needs
// SameSite=None, which browsers only accept on Secure cookies. Anything
// other than exactly "none" keeps the safe Lax default.
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE === "none" ? "none" : "lax";
if (COOKIE_SAMESITE === "none" && process.env.COOKIE_SECURE !== "true") {
  console.error(
    "COOKIE_SAMESITE=none only works over HTTPS: set COOKIE_SECURE=true too, " +
    "or the browser will drop the session cookie and sign-in will appear broken."
  );
  process.exit(1);
}

async function hashPassword(plain) {
  // 12 rounds is a reasonable default for a small shop's traffic; raise
  // it if this server ends up on faster, more contended hardware.
  return bcrypt.hash(plain, 12);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** A handful of guardrails against the most common weak choices — not a
 *  full policy engine, just enough to stop "password" and "admin123". */
function passwordProblems(pw) {
  const out = [];
  if (!pw || pw.length < 8) out.push("at least 8 characters");
  if (!/[a-zA-Z]/.test(pw || "")) out.push("a letter");
  if (!/[0-9]/.test(pw || "")) out.push("a number");
  if (/^(admin|password|12345678|qwerty|letmein)$/i.test(pw || "")) out.push("something less guessable");
  return out;
}

function signSession(user) {
  return jwt.sign(
    { uid: user.id || user._id, username: user.username, role: user.role, name: user.name || user.username },
    JWT_SECRET,
    { expiresIn: Math.floor(SESSION_MAX_AGE_MS / 1000) }
  );
}

function verifySession(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
  } catch (e) {
    return null;
  }
}

function setSessionCookie(res, token) {
  console.log("[AUTH] Setting session cookie");
  console.log("[AUTH] Cookie name:", COOKIE_NAME);
  console.log("[AUTH] Cookie sameSite:", COOKIE_SAMESITE);
  console.log("[AUTH] Cookie secure:", process.env.COOKIE_SECURE === "true");
  console.log("[AUTH] Cookie maxAge:", SESSION_MAX_AGE_MS);
  console.log("[AUTH] Token length:", token.length);
  
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/"
  });
  
  console.log("[AUTH] Session cookie set successfully");
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

function readSession(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  passwordProblems,
  signSession,
  verifySession,
  setSessionCookie,
  clearSessionCookie,
  readSession
};

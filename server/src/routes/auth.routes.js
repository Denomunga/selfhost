"use strict";
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { getDb } = require("../db");
const {
  verifyPassword, hashPassword, passwordProblems,
  signSession, setSessionCookie, clearSessionCookie
} = require("../auth");
const { requireAuth } = require("../middleware/session");
const { wrap } = require("../middleware/async");
const { changed } = require("../events");

const router = express.Router();

// Brute-force brake on sign-in. 20 attempts per 15 minutes per source is
// plenty for real staff and starves online password guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many failed sign-in attempts. Wait a few minutes and try again." }
});

// A stolen session cookie shouldn't be usable to brute-force the current
// password through this endpoint either.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password attempts. Wait a few minutes and try again." }
});

/** Keeps a read-only, password-free mirror of a staff account in the
 *  generic documents table (collection "users"), so the dashboard's
 *  existing Users & Roles page — which reads collections generically —
 *  needs no changes to display real accounts. Real credentials live
 *  only in auth_users and are never written here. */
async function mirrorUserDoc(user) {
  const safe = {
    username: user.username, email: user.email, name: user.name,
    role: user.role, mustChange: user.must_change, active: user.active,
    createdAt: user.created_at, lastLogin: user.last_login
  };
  await getDb().collection("documents").updateOne(
    { collection: "users", id: user._id || user.id },
    { $set: { data: safe, updated_at: new Date() } },
    { upsert: true }
  );
}

// A small, fixed delay floor so a wrong username and a wrong password
// take roughly the same wall-clock time to answer, same principle as
// the client-side version this replaces.
const MIN_RESPONSE_MS = 250;
function withFloor(startedAt, fn) {
  const elapsed = Date.now() - startedAt;
  return new Promise((resolve) => setTimeout(() => resolve(fn()), Math.max(0, MIN_RESPONSE_MS - elapsed)));
}

router.post("/login", loginLimiter, express.json(), wrap(async (req, res) => {
  const startedAt = Date.now();
  const { username, password } = req.body || {};
  if (!username || !password) {
    return withFloor(startedAt, () => res.status(400).json({ error: "Username and password are required." }));
  }
  try {
    const login = String(username).trim();
    const user = await getDb().collection("auth_users").findOne(
      { $or: [{ username: login }, { email: login }] },
      { collation: { locale: "en", strength: 2 } }
    );
    if (!user) {
      return withFloor(startedAt, () => res.status(401).json({ error: "Username or password is wrong." }));
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return withFloor(startedAt, () => res.status(401).json({ error: "Username or password is wrong." }));
    }
    if (!user.active) {
      return withFloor(startedAt, () => res.status(403).json({ error: "This account has been disabled." }));
    }
    await getDb().collection("auth_users").updateOne({ _id: user._id }, { $set: { last_login: new Date() } });
    const freshUser = await getDb().collection("auth_users").findOne({ _id: user._id });
    await mirrorUserDoc(freshUser);
    changed("users");
    const token = signSession(user);
    setSessionCookie(res, token);
    await withFloor(startedAt, () => null);
    res.json({
      user: { id: user._id, username: user.username, role: user.role, name: user.name || user.username, mustChange: user.must_change }
    });
  } catch (e) {
    console.error("[LOGIN] failed", e);
    res.status(500).json({ error: "Sign-in failed. Try again." });
  }
}));

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, wrap(async (req, res) => {
  try {
    const user = await getDb().collection("auth_users").findOne({ _id: req.session.uid });
    if (!user || !user.active) {
      return res.status(401).json({ error: "Session no longer valid." });
    }
    res.json({
      user: { id: user._id, username: user.username, role: user.role, name: user.name || user.username, mustChange: user.must_change }
    });
  } catch (e) {
    console.error("[AUTH/ME] failed", e);
    res.status(500).json({ error: "Could not load your account." });
  }
}));

router.post("/change-password", requireAuth, passwordLimiter, express.json(), wrap(async (req, res) => {
  const { userId, current, next } = req.body || {};
  const targetId = userId || req.session.uid;
  // Only an admin may reset someone else's password without knowing it.
  if (targetId !== req.session.uid && req.session.role !== "admin") {
    return res.status(403).json({ error: "You can only change your own password." });
  }
  const problems = passwordProblems(next);
  if (problems.length) return res.status(400).json({ error: "A password needs " + problems.join(", ") + "." });
  try {
    const user = await getDb().collection("auth_users").findOne({ _id: targetId });
    if (!user) return res.status(404).json({ error: "That account no longer exists." });
    if (targetId === req.session.uid) {
      // Knowing the session cookie must never be enough to take over the
      // account — prove you know the current password first.
      if (!current) return res.status(400).json({ error: "Enter your current password." });
      const ok = await verifyPassword(current, user.password_hash);
      if (!ok) return res.status(401).json({ error: "Your current password is wrong." });
    }
    const hash = await hashPassword(next);
    await getDb().collection("auth_users").updateOne(
      { _id: targetId }, { $set: { password_hash: hash, must_change: false } }
    );
    const freshUser = await getDb().collection("auth_users").findOne({ _id: targetId });
    await mirrorUserDoc(freshUser);
    changed("users");
    res.status(204).end();
  } catch (e) {
    console.error("change-password failed", e);
    res.status(500).json({ error: "The password could not be saved." });
  }
}));

// Admin-only: create a staff account. Mirrors the dashboard's "Add user".
router.post("/users", requireAuth, express.json(), wrap(async (req, res) => {
  if (req.session.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  const { username, name, email, role, password, mustChange } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and a temporary password are required." });
  const problems = passwordProblems(password);
  if (problems.length) return res.status(400).json({ error: "The temporary password needs " + problems.join(", ") + "." });
  try {
    const id = "usr-" + Math.random().toString(36).slice(2, 10);
    const hash = await hashPassword(password);
    const user = {
      _id: id, username: String(username).trim().toLowerCase(), email: email || null,
      name: name || null, role: role || "cashier", password_hash: hash,
      must_change: mustChange !== false, active: true, created_at: new Date(), last_login: null
    };
    await getDb().collection("auth_users").insertOne(user);
    await mirrorUserDoc(user);
    changed("users");
    res.status(201).json({ id });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "That username is taken." });
    console.error("create user failed", e);
    res.status(500).json({ error: "Could not create the account." });
  }
}));

// Admin-only: list / enable / disable staff accounts (no password hashes returned).
router.get("/users", requireAuth, wrap(async (req, res) => {
  if (req.session.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  const users = await getDb().collection("auth_users").find({}, {
    projection: { password_hash: 0 }
  }).sort({ username: 1 }).toArray();
  res.json({ users: users.map((user) => {
    const { _id, ...fields } = user;
    return Object.assign({ id: _id }, fields);
  }) });
}));

router.patch("/users/:id", requireAuth, express.json(), wrap(async (req, res) => {
  if (req.session.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  const changes = {};
  if (typeof req.body.active === "boolean") changes.active = req.body.active;
  if (typeof req.body.role === "string") changes.role = req.body.role;
  if (!Object.keys(changes).length) return res.status(400).json({ error: "Nothing to update." });
  await getDb().collection("auth_users").updateOne({ _id: req.params.id }, { $set: changes });
  const user = await getDb().collection("auth_users").findOne({ _id: req.params.id });
  if (user) await mirrorUserDoc(user);
  changed("users");
  res.status(204).end();
}));

module.exports = router;

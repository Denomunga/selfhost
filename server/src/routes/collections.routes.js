"use strict";
const express = require("express");
const { getDb } = require("../db");
const { canRead, canWrite, ALL_COLLECTIONS } = require("../policy");
const { wrap } = require("../middleware/async");
const { changed } = require("../events");
const { secLog } = require("../middleware/logger");

const router = express.Router();

/** Collections whose records may be hard-deleted through the API. The
 *  storefront inventory and the inquiry inbox are genuinely disposable;
 *  everything else — invoices, payments, the ledger, the audit trail,
 *  customers, costs — is part of the books: the app's own rule is that
 *  money records are voided, never deleted, and that's now enforced here
 *  instead of only in the frontend. */
const DELETABLE = new Set(["cars", "parts", "stories", "inquiries"]);

async function fetchCollection(name) {
  const docs = await getDb().collection("documents")
    .find({ collection: name }).sort({ updated_at: -1 }).toArray();
  return docs.map((doc) => Object.assign({ id: doc.id }, doc.data));
}

/** The public snapshot is identical for every anonymous visitor, and they
 *  vastly outnumber staff. Serving a cached copy for a few seconds turns
 *  a traffic spike into a handful of DB reads; concurrent misses share one
 *  in-flight rebuild instead of stampeding the database. A failed build is
 *  never cached — the next request tries again. */
const PUBLIC_CACHE_TTL_MS = 5000;
let publicCache = { at: 0, body: null, inflight: null };

async function loadPublicSnapshot() {
  if (publicCache.body && Date.now() - publicCache.at < PUBLIC_CACHE_TTL_MS) {
    return publicCache.body;
  }
  if (!publicCache.inflight) {
    publicCache.inflight = (async () => {
      const [cars, parts, stories] = await Promise.all([
        fetchCollection("cars"),
        fetchCollection("parts"),
        fetchCollection("stories")
      ]);
      const settingsRow = await getDb().collection("documents").findOne({ collection: "settings", id: "site" });
      const body = { cars, parts, stories, settings: settingsRow ? settingsRow.data : {} };
      publicCache = { at: Date.now(), body, inflight: null };
      return body;
    })().catch((e) => {
      publicCache.inflight = null;
      throw e;
    });
  }
  return publicCache.inflight;
}

/** Called after every write: without this, a tab reacting to a change
 *  event could refetch and be handed the pre-write cached snapshot, and
 *  (being public, on a 60s poll) not look again for a while. If a rebuild
 *  is already in flight it's left alone — the 5s TTL bounds any staleness
 *  from that race. */
function resetPublicCache() {
  if (!publicCache.inflight) publicCache = { at: 0, body: null, inflight: null };
}

/** Everything a logged-out storefront visitor may see, in one round trip. */
router.get("/public/snapshot", wrap(async (req, res) => {
  try {
    res.json(await loadPublicSnapshot());
  } catch (e) {
    console.error("public snapshot failed", e);
    res.status(500).json({ error: "Could not load the site." });
  }
}));

/** Everything a signed-in staff member may see (role-filtered), in one round trip. */
router.get("/admin/snapshot", wrap(async (req, res) => {
  if (!req.session) return res.status(401).json({ error: "Sign in to continue." });
  try {
    const allowed = ALL_COLLECTIONS.filter((c) => canRead(c, req.session));
    const results = await Promise.all(allowed.map((c) => fetchCollection(c)));
    const out = {};
    allowed.forEach((c, i) => { out[c] = results[i]; });
    const settingsRow = await getDb().collection("documents").findOne({ collection: "settings", id: "site" });
    out.settings = settingsRow ? settingsRow.data : {};
    res.json(out);
  } catch (e) {
    console.error("admin snapshot failed", e);
    res.status(500).json({ error: "Could not load your data." });
  }
}));

router.get("/collections/:coll", wrap(async (req, res) => {
  const { coll } = req.params;
  if (!ALL_COLLECTIONS.includes(coll)) return res.status(404).json({ error: "No such collection." });
  if (!canRead(coll, req.session)) return res.status(403).json({ error: "You can't read this." });
  try {
    res.json({ docs: await fetchCollection(coll) });
  } catch (e) {
    console.error("collection read failed", coll, e);
    res.status(500).json({ error: "Could not load that data." });
  }
}));

router.put("/collections/:coll/:id", express.json({ limit: "2mb" }), wrap(async (req, res) => {
  const { coll, id } = req.params;
  if (!ALL_COLLECTIONS.includes(coll)) return res.status(404).json({ error: "No such collection." });
  if (!canWrite(coll, req.session)) return res.status(403).json({ error: "You can't save changes here." });
  if (!id || id.length > 200) return res.status(400).json({ error: "Invalid document id." });
  try {
    // The audit trail is append-only: writing an entry that already
    // exists is a rewrite of history, so it doesn't go through.
    if (coll === "audit") {
      const existing = await getDb().collection("documents").findOne(
        { collection: "audit", id },
        { projection: { _id: 1 } }
      );
      if (existing) return res.status(403).json({ error: "Audit entries can't be changed once written." });
    }
    const body = Object.assign({}, req.body);
    delete body.id;
    await getDb().collection("documents").updateOne(
      { collection: coll, id },
      { $set: { data: body, updated_at: new Date() } },
      { upsert: true }
    );
    changed(coll);
    resetPublicCache();
    const user = req.session ? req.session.username : "unknown";
    secLog("SAVE", req, { user, collection: coll, id });
    res.status(204).end();
  } catch (e) {
    console.error("collection write failed", coll, id, e);
    res.status(500).json({ error: "Could not save that." });
  }
}));

router.delete("/collections/:coll/:id", wrap(async (req, res) => {
  const { coll, id } = req.params;
  if (!ALL_COLLECTIONS.includes(coll)) return res.status(404).json({ error: "No such collection." });
  if (!canWrite(coll, req.session)) return res.status(403).json({ error: "You can't delete this." });
  if (!DELETABLE.has(coll)) {
    return res.status(403).json({ error: "Records of this kind can't be hard-deleted — void the document instead." });
  }
  try {
    await getDb().collection("documents").deleteOne({ collection: coll, id });
    changed(coll);
    resetPublicCache();
    const user = req.session ? req.session.username : "unknown";
    secLog("DELETE", req, { user, collection: coll, id });
    res.status(204).end();
  } catch (e) {
    console.error("collection delete failed", coll, id, e);
    res.status(500).json({ error: "Could not delete that." });
  }
}));

router.put("/settings", express.json({ limit: "1mb" }), wrap(async (req, res) => {
  if (!req.session) return res.status(401).json({ error: "Sign in to continue." });
  try {
    await getDb().collection("documents").updateOne(
      { collection: "settings", id: "site" },
      { $set: { data: req.body || {}, updated_at: new Date() } },
      { upsert: true }
    );
    changed("settings");
    resetPublicCache();
    secLog("SETTINGS_SAVE", req, { user: req.session.username });
    res.status(204).end();
  } catch (e) {
    console.error("settings write failed", e);
    res.status(500).json({ error: "Could not save settings." });
  }
}));

module.exports = router;

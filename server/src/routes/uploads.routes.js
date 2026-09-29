"use strict";
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { getDb } = require("../db");
const { createBackend } = require("../storage");

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20MB, matches the dashboard's own guidance

const storage = createBackend();

/** The browser declares the file type — never trust that. Reads the first
 *  bytes of what actually arrived and checks it against the PNG,
 *  JPEG and WebP signatures. */
function sniffImage(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

// Files land in memory first (capped at MAX_BYTES), get sniffed, then go to
// the configured backend — R2 in the split deployment, local disk otherwise.
// Nothing unvalidated is ever written to storage.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) return cb(new Error("unsupported_type"));
    cb(null, true);
  }
});

const router = express.Router();

router.post("/", (req, res, next) => {
  console.log("[UPLOAD] Upload request received");
  console.log("[UPLOAD] Request session:", req.session);
  console.log("[UPLOAD] Request cookies:", req.cookies);
  console.log("[UPLOAD] Request headers:", Object.keys(req.headers));
  
  if (!req.session) {
    console.log("[UPLOAD] No session found, returning 401");
    return res.status(401).json({ error: "Sign in to continue." });
  }
  
  console.log("[UPLOAD] Session valid, proceeding with upload");
  upload.single("file")(req, res, (err) => {
    // The storage step below is async — route its failures into the error
    // middleware instead of leaving a floating rejection.
    storeUpload(err, req, res).catch(next);
  });
});

async function storeUpload(err, req, res) {
  if (err) {
    const code = err.message === "unsupported_type" ? "unsupported_type"
      : err.code === "LIMIT_FILE_SIZE" ? "too_large" : "upload_failed";
    const msg = code === "unsupported_type" ? "Use a PNG, JPEG or WebP file."
      : code === "too_large" ? "That image is over 20MB. Compress it and try again."
      : "Upload failed. Try again.";
    return res.status(400).json({ error: msg, code });
  }
  if (!req.file) return res.status(400).json({ error: "No file was received." });
  const sniffed = sniffImage(req.file.buffer.subarray(0, 16));
  if (sniffed === null || sniffed !== req.file.mimetype) {
    return res.status(400).json({ error: "That file isn't a real PNG, JPEG or WebP image.", code: "not_an_image" });
  }
  const id = crypto.randomBytes(16).toString("hex");
  try {
    await storage.put(id, req.file.buffer, req.file.mimetype);
    await getDb().collection("assets").insertOne({
      _id: id,
      filename: req.file.originalname || id,
      content_type: req.file.mimetype,
      size_bytes: req.file.size,
      created_at: new Date()
    });
    res.status(201).json({ id });
  } catch (e) {
    console.error("asset store failed", e);
    res.status(500).json({ error: "Upload failed. Try again." });
  }
}

/** GET /_blob/:id — public, no auth. Matches the storefront's need to
 *  show vehicle and part photos to any visitor. Streams from whichever
 *  storage backend is configured. */
async function blobHandler(req, res) {
  const id = req.params.id;
  if (!/^[a-f0-9]{32}$/.test(id)) return res.status(404).end();
  try {
    const asset = await getDb().collection("assets").findOne({ _id: id }, { projection: { content_type: 1 } });
    if (!asset) return res.status(404).end();
    const stream = await storage.get(id);
    if (!stream) return res.status(404).end();
    res.setHeader("Content-Type", asset.content_type);
    res.setHeader("Cache-Control", "public, max-age=86400");
    stream
      .on("error", (e) => {
        console.error("blob stream failed", id, e);
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      })
      .pipe(res);
  } catch (e) {
    console.error("blob serve failed", id, e);
    res.status(500).end();
  }
}

module.exports = { router, blobHandler };

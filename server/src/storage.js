"use strict";
/** Where uploaded photos live. Cloudflare R2 (S3-compatible) when the R2_*
 *  vars are set — required for the split deployment, where the API runs on
 *  Render and has no persistent disk. Falls back to local disk at
 *  UPLOAD_DIR for self-hosting, development, and the test suites.
 *  Both backends expose the same tiny surface: put(id, buffer, contentType)
 *  and get(id) -> a readable stream, or null when the id doesn't exist. */
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads");

function localBackend() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return {
    mode: "local",
    async put(id, buffer) {
      await fs.promises.writeFile(path.join(UPLOAD_DIR, id), buffer);
    },
    async get(id) {
      const filePath = path.join(UPLOAD_DIR, id);
      if (!fs.existsSync(filePath)) return null;
      return fs.createReadStream(filePath);
    }
  };
}

function r2Backend() {
  // Required lazily so local-disk setups don't pay for the SDK import.
  const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
  const endpoint = process.env.R2_ENDPOINT
    || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
  const Bucket = process.env.R2_BUCKET;
  return {
    mode: "r2",
    async put(id, buffer, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: id, Body: buffer, ContentType: contentType }));
    },
    async get(id) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: id }));
        return out.Body || null;
      } catch (e) {
        if (e && (e.name === "NoSuchKey" || e.name === "NotFound")) return null;
        throw e;
      }
    }
  };
}

function createBackend() {
  const hasR2 = process.env.R2_BUCKET
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT);
  return hasR2 ? r2Backend() : localBackend();
}

module.exports = { createBackend, UPLOAD_DIR };

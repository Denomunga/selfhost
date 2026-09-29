"use strict";
const express = require("express");
const { getDb } = require("../db");
const { wrap } = require("../middleware/async");

const router = express.Router();

const PREFIXES = {
  invoice: "INV", receipt: "RCPT", order: "ORD", payment: "PAY",
  refund: "CRN", expense: "EXP", purchase: "PO", journal: "JRN", register: "REG"
};

// MongoDB's atomic findOneAndUpdate keeps concurrent requests distinct.
router.post("/counters/:kind", wrap(async (req, res) => {
  if (!req.session) return res.status(401).json({ error: "Sign in to continue." });
  const kind = req.params.kind;
  const prefix = PREFIXES[kind] || "DOC";
  const year = new Date().getFullYear();
  const key = `${kind}_${year}`;
  try {
    const result = await getDb().collection("counters").findOneAndUpdate(
      { _id: key },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after", includeResultMetadata: true }
    );
    const n = result.value.value;
    res.json({ no: `${prefix}-${year}-${String(n).padStart(5, "0")}` });
  } catch (e) {
    console.error("counter failed", kind, e);
    res.status(500).json({ error: "Could not issue a document number." });
  }
}));

module.exports = router;

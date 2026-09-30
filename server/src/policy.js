"use strict";
/**
 * Who can read and write each collection. This mirrors the access rules
 * the hosted version declared to the claude.ai artifact platform — now
 * enforced here instead, since there's no platform doing it for us.
 *
 * "public"  — no session required.
 * "staff"   — any signed-in account (cashier, manager, or admin).
 * "admin"   — only role === "admin".
 *
 * Extend ROLE_OVERRIDES if you want finer-grained control per collection
 * (e.g. cashiers can create invoices but not void them) — this file is
 * the one place to change that; every route funnels through it.
 */
const PUBLIC_READ = new Set(["cars", "parts", "stories"]);
const ADMIN_ONLY_READ = new Set(["users", "audit", "meta_connections", "meta_campaigns", "meta_audiences", "meta_attributions"]);
const ADMIN_ONLY_WRITE = new Set(["users", "meta_connections", "meta_campaigns", "meta_audiences", "meta_attributions"]);

function readLevel(collection) {
  if (ADMIN_ONLY_READ.has(collection)) return "admin";
  if (PUBLIC_READ.has(collection)) return "public";
  return "staff";
}

function writeLevel(collection) {
  if (ADMIN_ONLY_WRITE.has(collection)) return "admin";
  if (collection === "inquiries") return "public"; // the storefront's own inquiry form
  return "staff";
}

function satisfies(level, session) {
  if (level === "public") return true;
  if (level === "staff") return !!session;
  if (level === "admin") return !!session && session.role === "admin";
  return false;
}

function canRead(collection, session) {
  return satisfies(readLevel(collection), session);
}
function canWrite(collection, session) {
  return satisfies(writeLevel(collection), session);
}

const ALL_COLLECTIONS = [
  "cars", "parts", "stories", "inquiries", "customers", "suppliers", "orders",
  "invoices", "receipts", "payments", "refunds", "expenses", "purchases",
  "registers", "cashmoves", "journal", "audit", "users", "carcost", "partcost",
  "meta_connections", "meta_campaigns", "meta_audiences", "meta_attributions"
];

module.exports = { canRead, canWrite, ALL_COLLECTIONS, PUBLIC_READ };

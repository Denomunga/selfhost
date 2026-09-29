"use strict";
require("dotenv").config();

const { connectMongo, getDb, closeMongo } = require("./db");
const { hashPassword } = require("./auth");
const { SEED_CARS, SEED_STORIES, SEED_PARTS, DEFAULT_SETTINGS } = require("./seedData");

function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "item";
}

async function upsertDoc(collection, id, data) {
  await getDb().collection("documents").updateOne(
    { collection, id },
    { $set: { data, updated_at: new Date() } },
    { upsert: true }
  );
}

async function seedInventory() {
  const existingCar = await getDb().collection("documents").findOne({ collection: "cars" }, { projection: { _id: 1 } });
  if (existingCar) {
    console.log("Cars already exist — skipping demo inventory (delete car documents first if you want to reseed).");
    return;
  }

  await upsertDoc("settings", "site", DEFAULT_SETTINGS);
  console.log("Wrote site settings.");

  const now = Date.now();
  const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();

  let i = 0;
  for (const c of SEED_CARS) {
    const id = slugify(`subaru-${c.model}-${c.variant || ""}-${c.year}`);
    const status = c.status || "AVAILABLE";
    await upsertDoc("cars", id, Object.assign(
      { make: "SUBARU", status: "AVAILABLE", featured: false, createdAt: iso(i * 3 + 1), soldAt: null },
      c,
      { status, soldAt: status === "SOLD" ? iso(Math.floor(Math.random() * 30) + 2) : null }
    ));
    i++;
  }
  console.log(`Seeded ${SEED_CARS.length} vehicles.`);

  let j = 0;
  for (const s of SEED_STORIES) {
    await upsertDoc("stories", slugify(s.title), Object.assign({ published: true, date: iso(j * 6 + 2) }, s));
    j++;
  }
  console.log(`Seeded ${SEED_STORIES.length} stories.`);

  let k = 0;
  for (const raw of SEED_PARTS) {
    const { cost } = raw;
    const pub = Object.assign({}, raw);
    delete pub.cost;
    const id = slugify(raw.sku);
    await upsertDoc("parts", id, Object.assign({ status: "ACTIVE", featured: false, images: [], createdAt: iso(k * 2 + 3) }, pub));
    if (cost) {
      await upsertDoc("partcost", id, { cost, updatedAt: iso(k * 2 + 3) });
      if (raw.stock > 0) {
        // opening stock value, symmetric with how a vehicle purchase
        // debits inventory — keeps the parts inventory ledger account
        // meaningful from day one instead of only ever going negative
        await upsertDoc("journal", "jrn-seed-" + id, {
              no: "JRN-SEED-" + String(k + 1).padStart(4, "0"),
              memo: `Opening stock — ${raw.name}`,
              ref: id,
              lines: [
                { account: "1210", debit: cost * raw.stock, credit: 0 },
                { account: "2000", debit: 0, credit: cost * raw.stock }
              ],
              debit: cost * raw.stock,
              credit: cost * raw.stock,
              date: iso(k * 2 + 3),
              by: "seed script"
        });
      }
    }
    k++;
  }
  console.log(`Seeded ${SEED_PARTS.length} parts.`);
}

async function seedAdmin() {
  const existingUser = await getDb().collection("auth_users").findOne({}, { projection: { _id: 1 } });
  if (existingUser) {
    console.log("A staff account already exists — skipping default admin creation.");
    return;
  }
  const hash = await hashPassword("admin");
  await getDb().collection("auth_users").insertOne({
    _id: "admin", username: "admin", email: "admin@sheriffmotors.com", name: "Administrator",
    role: "admin", password_hash: hash, must_change: true, active: true,
    created_at: new Date(), last_login: null
  });
  await upsertDoc("users", "admin", {
    username: "admin", email: "admin@sheriffmotors.com", name: "Administrator", role: "admin",
    mustChange: true, active: true, createdAt: new Date().toISOString(), lastLogin: null
  });
  console.log("\n  Default admin created — username: admin   password: admin");
  console.log("  You will be required to change this password on first sign-in.\n");
}

(async () => {
  try {
    await connectMongo();
    await seedAdmin();
    await seedInventory();
    console.log("Seed complete.");
  } catch (e) {
    console.error("Seeding failed:", e);
    process.exitCode = 1;
  } finally {
    await closeMongo();
  }
})();

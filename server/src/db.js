"use strict";
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");
}

const client = new MongoClient(uri);
let database;

async function connectMongo() {
  await client.connect();
  database = client.db(process.env.MONGODB_DB || "sheriff_motors");
  await Promise.all([
    database.collection("documents").createIndex({ collection: 1, id: 1 }, { unique: true }),
    database.collection("documents").createIndex({ collection: 1, updated_at: -1 }),
    database.collection("auth_users").createIndex({ username: 1 }, { unique: true }),
    database.collection("counters").createIndex({ _id: 1 }),
    database.collection("assets").createIndex({ _id: 1 }),
    // Meta Advertising collections
    database.collection("meta_connections").createIndex({ dealershipId: 1 }, { unique: true }),
    database.collection("meta_ad_accounts").createIndex({ accountId: 1 }),
    database.collection("meta_campaigns").createIndex({ id: 1 }, { unique: true }),
    database.collection("meta_campaigns").createIndex({ status: 1 }),
    database.collection("meta_campaigns").createIndex({ carId: 1 }),
    database.collection("meta_campaign_metrics").createIndex({ campaignId: 1, timestamp: -1 }),
    database.collection("meta_audiences").createIndex({ id: 1 }, { unique: true }),
    database.collection("campaign_attributions").createIndex({ campaignId: 1 }),
    database.collection("campaign_attributions").createIndex({ invoiceId: 1 }),
    database.collection("campaign_attributions").createIndex({ inquiryId: 1 })
  ]);
  return database;
}

function getDb() {
  if (!database) throw new Error("MongoDB is not connected.");
  return database;
}

async function closeMongo() {
  await client.close();
}

module.exports = { connectMongo, getDb, closeMongo };

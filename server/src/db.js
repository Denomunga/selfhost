"use strict";
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");
}

const client = new MongoClient(uri);
let database;

async function connectMongo() {
  await client.connect();
  database = client.db(process.env.MONGODB_DB || "rift_motors");
  await Promise.all([
    database.collection("documents").createIndex({ collection: 1, id: 1 }, { unique: true }),
    database.collection("documents").createIndex({ collection: 1, updated_at: -1 }),
    database.collection("auth_users").createIndex({ username: 1 }, { unique: true }),
    database.collection("counters").createIndex({ _id: 1 }),
    database.collection("assets").createIndex({ _id: 1 })
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

"use strict";
require("dotenv").config();
const { connectMongo, closeMongo } = require("./db");

(async () => {
  try {
    await connectMongo();
    console.log("MongoDB collections and indexes are ready.");
  } catch (e) {
    console.error("Migration failed:", e);
    process.exitCode = 1;
  } finally {
    await closeMongo();
  }
})();

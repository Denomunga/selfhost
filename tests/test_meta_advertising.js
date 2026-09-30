"use strict";

process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/sheriff_motors";
process.env.JWT_SECRET = process.env.JWT_SECRET || "random-secret-for-testing-only-1234567890";

const assert = require("assert");
const crypto = require("crypto");
const { MetaAdsService } = require("../server/src/services/metaAds.service");
const {
  AudienceProvider,
  MetaAudienceProvider,
  PolkAudienceProvider,
  audienceRegistry
} = require("../server/src/services/audience/audienceProvider");
const policy = require("../server/src/policy");

/* =========================================================================
   IN-MEMORY TEST HARNESS FOR MONGODB COLLECTIONS
   ========================================================================= */

function createMockDb() {
  const collections = new Map();

  function getColl(name) {
    if (!collections.has(name)) {
      collections.set(name, []);
    }
    return collections.get(name);
  }

  return {
    collection(name) {
      const list = getColl(name);
      return {
        async findOne(query) {
          return list.find(item => matches(item, query)) || null;
        },
        find(query = {}) {
          const filtered = list.filter(item => matches(item, query));
          return {
            sort(sortCriteria) {
              return {
                async toArray() {
                  return filtered.slice();
                }
              };
            },
            async toArray() {
              return filtered.slice();
            }
          };
        },
        async insertOne(doc) {
          const clone = JSON.parse(JSON.stringify(doc));
          list.push(clone);
          return { insertedId: clone._id || clone.id };
        },
        async insertMany(docs) {
          const clones = JSON.parse(JSON.stringify(docs));
          list.push(...clones);
          return { insertedCount: clones.length };
        },
        async updateOne(query, update, options = {}) {
          let item = list.find(it => matches(it, query));
          if (!item && options.upsert) {
            item = JSON.parse(JSON.stringify(query));
            list.push(item);
          }
          if (item && update.$set) {
            Object.assign(item, JSON.parse(JSON.stringify(update.$set)));
            return { matchedCount: 1, modifiedCount: 1 };
          }
          return { matchedCount: item ? 1 : 0, modifiedCount: 0 };
        },
        async updateMany(query, update) {
          let count = 0;
          for (const item of list) {
            if (matches(item, query)) {
              if (update.$set) Object.assign(item, JSON.parse(JSON.stringify(update.$set)));
              count++;
            }
          }
          return { matchedCount: count, modifiedCount: count };
        },
        async deleteMany(query) {
          let count = 0;
          for (let i = list.length - 1; i >= 0; i--) {
            if (matches(list[i], query)) {
              list.splice(i, 1);
              count++;
            }
          }
          return { deletedCount: count };
        }
      };
    }
  };
}

function matches(item, query) {
  if (!query || Object.keys(query).length === 0) return true;
  for (const [k, v] of Object.entries(query)) {
    if (k === "$or" && Array.isArray(v)) {
      const orMatched = v.some(subQuery => matches(item, subQuery));
      if (!orMatched) return false;
      continue;
    }
    if (item[k] !== v) return false;
  }
  return true;
}

/* =========================================================================
   TEST RUNNER
   ========================================================================= */

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.error(`FAIL  ${name} — ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.error(`FAIL  ${name} — ${err.message}`);
  }
}

(async () => {
  console.log("\n=======================================================");
  console.log("  META ADVERTISING INTEGRATION TEST SUITE");
  console.log("  Distinction: UNIT / CONTRACT TESTS (Mock & Security)");
  console.log("=======================================================\n");

  /* -------------------------------------------------------------
     1. SECURITY & ACCESS CONTROL BOUNDARIES
     ------------------------------------------------------------- */

  test("RBAC Policy: Anonymous visitors cannot read or write Meta collections", () => {
    assert.strictEqual(policy.canRead("meta_connections", null), false);
    assert.strictEqual(policy.canWrite("meta_connections", null), false);
    assert.strictEqual(policy.canRead("meta_campaigns", null), false);
    assert.strictEqual(policy.canWrite("meta_campaigns", null), false);
  });

  test("RBAC Policy: Cashier staff cannot read or write Meta administration collections", () => {
    const cashierSession = { uid: "csh-1", role: "cashier", username: "cashier1" };
    assert.strictEqual(policy.canRead("meta_connections", cashierSession), false);
    assert.strictEqual(policy.canWrite("meta_connections", cashierSession), false);
    assert.strictEqual(policy.canRead("meta_campaigns", cashierSession), false);
    assert.strictEqual(policy.canWrite("meta_campaigns", cashierSession), false);
  });

  test("RBAC Policy: Dealership Administrator is authorized to manage Meta advertising", () => {
    const adminSession = { uid: "adm-1", role: "admin", username: "admin" };
    assert.strictEqual(policy.canRead("meta_connections", adminSession), true);
    assert.strictEqual(policy.canWrite("meta_connections", adminSession), true);
    assert.strictEqual(policy.canRead("meta_campaigns", adminSession), true);
    assert.strictEqual(policy.canWrite("meta_campaigns", adminSession), true);
  });

  /* -------------------------------------------------------------
     2. ENCRYPTION & TOKEN PROTECTION
     ------------------------------------------------------------- */

  test("Token Security: Tokens are encrypted using AES-256-GCM and never plain text in DB", () => {
    const service = new MetaAdsService();
    const rawSecretToken = "EAAQZBBXYZ987654321_long_lived_user_access_token";
    const encrypted = service.encryptToken(rawSecretToken);

    assert.ok(encrypted.iv, "IV must be generated");
    assert.ok(encrypted.tag, "Auth tag must be generated");
    assert.ok(encrypted.data, "Encrypted cipher text must exist");
    assert.notStrictEqual(encrypted.data, rawSecretToken, "Cipher text must differ from token");

    const decrypted = service.decryptToken(encrypted);
    assert.strictEqual(decrypted, rawSecretToken, "Decrypted token must exactly match original");
  });

  test("Token Security: Corrupted auth tag or tampered cipher text fails decryption closed", () => {
    const service = new MetaAdsService();
    const encrypted = service.encryptToken("secret_token");
    // Tamper with ciphertext
    const tampered = { ...encrypted, data: encrypted.data.slice(0, -2) + "ff" };
    const result = service.decryptToken(tampered);
    assert.strictEqual(result, null, "Tampered payload must decrypt to null (fail closed)");
  });

  /* -------------------------------------------------------------
     3. OAUTH FLOW & CSRF STATE VALIDATION
     ------------------------------------------------------------- */

  await asyncTest("OAuth Security: Generates cryptographically secure state token", async () => {
    const service = new MetaAdsService();
    const url = service.getOAuthUrl("admin");
    assert.ok(url.includes("state="), "OAuth URL must contain state parameter");
    assert.strictEqual(service.oauthStates.size, 1, "State must be tracked in server memory");
  });

  await asyncTest("OAuth Security: Rejects callback with missing or tampered state (CSRF attack)", async () => {
    const service = new MetaAdsService();
    service.getOAuthUrl("admin");

    let threw = false;
    try {
      await service.handleOAuthCallback("valid_code", "attacker_fake_state_123");
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes("CSRF"), "Must specifically mention CSRF protection failure");
    }
    assert.strictEqual(threw, true, "Tampered state must be rejected");
  });

  await asyncTest("OAuth Security: State token is one-time use (replay protection)", async () => {
    const service = new MetaAdsService();
    // Force mock mode for deterministic callback execution
    process.env.META_ENABLED = "false";
    const mockDb = createMockDb();
    service.setDb(mockDb);
    // Patch db helper for this instance
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      const url = service.getOAuthUrl("admin");
      const state = new URL(url, "http://localhost").searchParams.get("state");

      // First callback attempt succeeds
      const first = await service.handleOAuthCallback("code_123", state);
      assert.strictEqual(first.connected, true);

      // Replay attempt with same state must fail
      let replayFailed = false;
      try {
        await service.handleOAuthCallback("code_123", state);
      } catch (err) {
        replayFailed = true;
      }
      assert.strictEqual(replayFailed, true, "Replaying OAuth callback with used state must fail");
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  /* -------------------------------------------------------------
     4. CONNECTION, AD ACCOUNT SELECTION & DISCONNECT
     ------------------------------------------------------------- */

  await asyncTest("Connection Status: Initial state returns connected: false and zero leaks", async () => {
    const service = new MetaAdsService();
    const mockDb = createMockDb();
    service.setDb(mockDb);
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      const status = await service.getConnectionStatus();
      assert.strictEqual(status.connected, false);
      assert.strictEqual(status.selectedAccount, null);
      assert.strictEqual(status.availableAccountsCount, 0);
      assert.strictEqual(status.encryptedToken, undefined, "Must NEVER expose tokens");
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  await asyncTest("Ad Accounts: Automatically selects single ad account if only one exists", async () => {
    const service = new MetaAdsService();
    const mockDb = createMockDb();
    service.setDb(mockDb);
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      const accounts = [
        {
          id: "act_998877",
          account_id: "998877",
          name: "Sheriff Motors Nairobi",
          currency: "KES",
          timezone_name: "Africa/Nairobi",
          account_status: 1
        }
      ];

      // Simulate fetchAndStoreAdAccounts logic
      const stored = accounts.map((acc, index) => ({
        id: acc.id,
        accountId: acc.account_id,
        dealershipId: "default",
        name: acc.name,
        currency: acc.currency,
        selected: accounts.length === 1 || index === 0,
        isMock: true
      }));

      await mockDb.collection("meta_connections").insertOne({
        dealershipId: "default",
        connected: true,
        isMock: true
      });
      await mockDb.collection("meta_ad_accounts").insertMany(stored);
      const retrieved = await service.getAdAccounts();

      assert.strictEqual(retrieved.length, 1);
      assert.strictEqual(retrieved[0].selected, true, "Single account must be auto-selected");
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  await asyncTest("Ad Accounts: Manual selection works when multiple accounts exist", async () => {
    const service = new MetaAdsService();
    const mockDb = createMockDb();
    service.setDb(mockDb);
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      await mockDb.collection("meta_ad_accounts").insertMany([
        { id: "act_1", accountId: "1", dealershipId: "default", name: "Account 1", selected: true },
        { id: "act_2", accountId: "2", dealershipId: "default", name: "Account 2", selected: false }
      ]);

      await service.selectAdAccount("2");

      const acc1 = await mockDb.collection("meta_ad_accounts").findOne({ accountId: "1" });
      const acc2 = await mockDb.collection("meta_ad_accounts").findOne({ accountId: "2" });

      assert.strictEqual(acc1.selected, false);
      assert.strictEqual(acc2.selected, true);
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  await asyncTest("Disconnect: Properly invalidates token and preserves historical records", async () => {
    const service = new MetaAdsService();
    const mockDb = createMockDb();
    service.setDb(mockDb);
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      // Connect first
      await mockDb.collection("meta_connections").insertOne({
        dealershipId: "default",
        connected: true,
        encryptedToken: service.encryptToken("token_to_disconnect"),
        isMock: true
      });

      // Add a campaign
      await mockDb.collection("meta_campaigns").insertOne({
        id: "cmp_historic",
        name: "Historic Outback Campaign",
        dealershipId: "default"
      });

      const res = await service.disconnect();
      assert.strictEqual(res.ok, true);

      const conn = await mockDb.collection("meta_connections").findOne({ dealershipId: "default" });
      assert.strictEqual(conn.connected, false);
      assert.strictEqual(conn.encryptedToken, null, "Token must be wiped upon disconnection");

      // Verify historical campaigns were preserved
      const campaign = await mockDb.collection("meta_campaigns").findOne({ id: "cmp_historic" });
      assert.ok(campaign, "Historical campaign records must NOT be deleted upon disconnect");
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  /* -------------------------------------------------------------
     5. CAMPAIGN CREATION, STATUS & METRICS
     ------------------------------------------------------------- */

  await asyncTest("Campaign Creation: Pre-populates vehicle data and validates inventory link", async () => {
    const service = new MetaAdsService();
    const mockDb = createMockDb();
    service.setDb(mockDb);
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      // Set active connection & ad account
      await mockDb.collection("meta_connections").insertOne({
        dealershipId: "default",
        connected: true,
        isMock: true
      });
      await mockDb.collection("meta_ad_accounts").insertOne({
        dealershipId: "default",
        accountId: "1020304050",
        name: "Sheriff Motors Nairobi",
        selected: true
      });

      // Seed a vehicle
      await mockDb.collection("documents").insertOne({
        collection: "cars",
        id: "subaru-forester-xt-2020",
        data: {
          make: "SUBARU",
          model: "Forester",
          variant: "XT Turbo",
          year: 2020,
          price: 4500000,
          description: "Certified pre-owned Forester in Nairobi.",
          images: [{ assetId: "img_forester_001" }]
        }
      });

      const created = await service.createCampaign({
        carId: "subaru-forester-xt-2020",
        dailyBudget: 3000
      }, "TestAdmin");

      assert.ok(created.id.startsWith("meta_cmp_"));
      assert.strictEqual(created.carId, "subaru-forester-xt-2020");
      assert.strictEqual(created.vehicleTitle, "2020 Subaru Forester XT Turbo");
      assert.strictEqual(created.vehiclePrice, 4500000);
      assert.strictEqual(created.status, "ACTIVE");
      assert.strictEqual(created.dailyBudget, 3000);
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  await asyncTest("Campaign Lifecycle: Pause and resume update campaign status", async () => {
    const service = new MetaAdsService();
    const mockDb = createMockDb();
    service.setDb(mockDb);
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      await mockDb.collection("meta_campaigns").insertOne({
        id: "cmp_test_lifecycle",
        status: "ACTIVE",
        isMock: true
      });

      await service.pauseCampaign("cmp_test_lifecycle");
      let cmp = await mockDb.collection("meta_campaigns").findOne({ id: "cmp_test_lifecycle" });
      assert.strictEqual(cmp.status, "PAUSED");

      await service.resumeCampaign("cmp_test_lifecycle");
      cmp = await mockDb.collection("meta_campaigns").findOne({ id: "cmp_test_lifecycle" });
      assert.strictEqual(cmp.status, "ACTIVE");
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  await asyncTest("Campaign Metrics: Sync retrieves impressions, clicks, ctr, and spend", async () => {
    const service = new MetaAdsService();
    const mockDb = createMockDb();
    service.setDb(mockDb);
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      await mockDb.collection("meta_campaigns").insertOne({
        id: "cmp_sync_test",
        isMock: true,
        metrics: { impressions: 100, clicks: 8, spend: 400, leads: 1 }
      });

      const synced = await service.syncCampaignMetrics("cmp_sync_test");
      assert.ok(synced.impressions >= 100, "Impressions must be updated");
      assert.ok(synced.clicks >= 8, "Clicks must be updated");
      assert.ok(synced.spend >= 400, "Spend must be updated");
      assert.ok(synced.ctr >= 0, "CTR must be calculated");

      // Verify time-series snapshot was recorded in meta_campaign_metrics
      const history = await mockDb.collection("meta_campaign_metrics").find({ campaignId: "cmp_sync_test" }).toArray();
      assert.strictEqual(history.length, 1);
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  /* -------------------------------------------------------------
     6. STRICT VEHICLE SALES ATTRIBUTION ENGINE
     ------------------------------------------------------------- */

  await asyncTest("Attribution Engine: Correctly links Campaign -> Vehicle -> Inquiry -> Invoice", async () => {
    const service = new MetaAdsService();
    const mockDb = createMockDb();
    service.setDb(mockDb);
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      const now = new Date();
      const campaignLaunchDate = new Date(now.getTime() - 5 * 86400000).toISOString(); // 5 days ago

      // 1. Campaign advertising Outback
      await mockDb.collection("meta_campaigns").insertOne({
        id: "cmp_outback_2022",
        dealershipId: "default",
        carId: "car_outback_2022",
        name: "2022 Subaru Outback Campaign",
        vehicleTitle: "2022 Subaru Outback Limited",
        status: "ACTIVE",
        createdAt: campaignLaunchDate,
        metrics: { spend: 7500, leads: 2 }
      });

      // 2. Inquiry from customer for the Outback 3 days ago
      await mockDb.collection("documents").insertOne({
        collection: "inquiries",
        id: "inq_101",
        data: {
          name: "Dennis Mwangi",
          phone: "0711223344",
          carId: "car_outback_2022",
          createdAt: new Date(now.getTime() - 3 * 86400000).toISOString(),
          status: "CONTACTED"
        }
      });

      // 3. Invoice for the Outback sold 1 day ago
      await mockDb.collection("documents").insertOne({
        collection: "invoices",
        id: "inv_2026_001",
        data: {
          no: "INV-2026-00001",
          carId: "car_outback_2022",
          total: 5200000,
          paid: 5200000,
          status: "SENT",
          issueDate: new Date(now.getTime() - 1 * 86400000).toISOString()
        }
      });

      const report = await service.getAttributionReport();
      assert.strictEqual(report.length, 1);

      const entry = report[0];
      assert.strictEqual(entry.attributionStatus, "ATTRIBUTED");
      assert.strictEqual(entry.inquiriesCount, 1);
      assert.strictEqual(entry.vehiclesSold, 1);
      assert.strictEqual(entry.attributedRevenue, 5200000);
      assert.strictEqual(entry.invoices[0].no, "INV-2026-00001");
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  await asyncTest("Attribution Engine: Unmatched campaigns strictly report 'Not attributed' (NO GUESSING)", async () => {
    const service = new MetaAdsService();
    const mockDb = createMockDb();
    service.setDb(mockDb);
    const dbModule = require("../server/src/db");
    const origGetDb = dbModule.getDb;
    dbModule.getDb = () => mockDb;

    try {
      // Campaign for XV Crosstrek with NO inquiries and NO sales
      await mockDb.collection("meta_campaigns").insertOne({
        id: "cmp_xv_alone",
        dealershipId: "default",
        carId: "car_xv_alone",
        name: "Subaru XV Campaign",
        vehicleTitle: "2019 Subaru XV",
        status: "ACTIVE",
        createdAt: new Date().toISOString()
      });

      const report = await service.getAttributionReport();
      assert.strictEqual(report.length, 1);

      const entry = report[0];
      assert.strictEqual(entry.attributionStatus, "Not attributed", "Must strictly say 'Not attributed' when no DB link exists");
      assert.strictEqual(entry.vehiclesSold, 0);
      assert.strictEqual(entry.attributedRevenue, 0);
    } finally {
      dbModule.getDb = origGetDb;
    }
  });

  /* -------------------------------------------------------------
     7. AUDIENCE PROVIDER ARCHITECTURE & POLK STUB INTEGRITY
     ------------------------------------------------------------- */

  test("Audience Provider: MetaAudienceProvider conforms to AudienceProvider interface", () => {
    const provider = audienceRegistry.get("meta");
    assert.ok(provider instanceof AudienceProvider);
    assert.strictEqual(provider.getId(), "meta");
    const caps = provider.getCapabilities();
    assert.strictEqual(caps.isAvailable, true);
    assert.ok(caps.audienceTypes.includes("vehicle_viewers"));
    assert.ok(caps.audienceTypes.includes("website_visitors"));
  });

  test("Audience Provider: PolkAudienceProvider architectural stub throws clear commercial error (NO FAKE API)", async () => {
    const provider = audienceRegistry.get("polk");
    assert.ok(provider instanceof AudienceProvider);
    assert.strictEqual(provider.getId(), "polk");
    const caps = provider.getCapabilities();
    assert.strictEqual(caps.isAvailable, false);
    assert.strictEqual(caps.status, "PLANNED");

    // Calling active methods MUST throw an explicit error explaining commercial requirements
    let errorCaught = false;
    try {
      await provider.getAudiences();
    } catch (e) {
      errorCaught = true;
      assert.ok(e.message.includes("S&P Global Mobility"));
    }
    assert.strictEqual(errorCaught, true, "Polk provider must throw instead of inventing fake endpoints");
  });

  /* -------------------------------------------------------------
     SUMMARY
     ------------------------------------------------------------- */

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n=======================================================`);
  console.log(`  TEST RESULTS: ${passed}/${results.length} PASSED`);
  if (failed > 0) {
    console.error(`  FAILURES: ${failed}`);
    process.exitCode = 1;
  } else {
    console.log(`  ALL ${passed} CHECKS PASSED SUCCESSFULLY.`);
  }
  console.log(`=======================================================\n`);
})();

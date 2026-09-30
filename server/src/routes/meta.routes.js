"use strict";

const express = require("express");
const crypto = require("crypto");
const { metaAdsService } = require("../services/metaAds.service");
const { requireAuth, requireAdmin } = require("../middleware/session");
const { wrap } = require("../middleware/async");
const { getDb } = require("../db");
const { changed } = require("../events");

const router = express.Router();

/**
 * Server-side audit logging helper following the application's audit schema.
 * Never logs sensitive credentials or tokens.
 */
async function auditLog(action, entity, entityId, before, after, reason, session) {
  try {
    const id = "aud-" + crypto.randomBytes(8).toString("hex");
    const doc = {
      action,
      entity,
      entityId: entityId || null,
      before: before ? JSON.stringify(before).slice(0, 4000) : null,
      after: after ? JSON.stringify(after).slice(0, 4000) : null,
      reason: reason || "",
      who: (session && (session.name || session.username)) || "Administrator",
      whoId: session ? session.uid : null,
      at: new Date().toISOString()
    };
    await getDb().collection("documents").updateOne(
      { collection: "audit", id },
      { $set: { data: doc, updated_at: new Date() } },
      { upsert: true }
    );
    changed("audit");
  } catch (e) {
    console.warn("[MetaRoutes] Failed to record audit log:", e.message);
  }
}

/* -------------------------------------------------------------
   CONNECTION & OAUTH ENDPOINTS
   ------------------------------------------------------------- */

/**
 * GET /status
 * Returns current connection state, selected ad account, and mock mode flag.
 */
router.get("/status", requireAuth, wrap(async (req, res) => {
  const status = await metaAdsService.getConnectionStatus();
  res.json(status);
}));

/**
 * GET /oauth/url
 * Generates official Facebook OAuth URL with CSRF protection.
 */
router.get("/oauth/url", requireAuth, requireAdmin, wrap(async (req, res) => {
  const url = metaAdsService.getOAuthUrl(req.session.uid);
  res.json({ url });
}));

/**
 * GET /oauth/callback
 * Official server-side OAuth callback. Validates state, exchanges code for long-lived token,
 * auto-selects account if singular, records audit log, and redirects back to admin UI.
 */
router.get("/oauth/callback", wrap(async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error("[Meta OAuth Callback Error]", error, error_description);
    return res.redirect("/#/admin?tab=meta_ads&error=" + encodeURIComponent(error_description || error));
  }

  if (!code || !state) {
    return res.status(400).json({ error: "Missing required OAuth code or state parameter." });
  }

  try {
    const result = await metaAdsService.handleOAuthCallback(code, state);

    await auditLog(
      "META_CONNECTED",
      "meta_connection",
      "default",
      null,
      {
        isMock: result.isMock,
        accountsDiscovered: result.accounts.length,
        selectedAccount: result.selectedAccount?.name || "None"
      },
      "Connected Facebook Advertising via OAuth",
      req.session
    );

    // Redirect admin back to the Meta Advertising dashboard tab
    res.redirect("/#/admin?tab=meta_ads&connected=1");
  } catch (err) {
    console.error("[Meta OAuth Callback Processing Failed]", err);
    res.redirect("/#/admin?tab=meta_ads&error=" + encodeURIComponent(err.message || "OAuth processing failed."));
  }
}));

/**
 * POST /disconnect
 * Safely disconnects Facebook connection.
 */
router.post("/disconnect", requireAuth, requireAdmin, wrap(async (req, res) => {
  const result = await metaAdsService.disconnect();

  await auditLog(
    "META_DISCONNECTED",
    "meta_connection",
    "default",
    null,
    null,
    "Disconnected Facebook connection",
    req.session
  );

  res.json(result);
}));

/* -------------------------------------------------------------
   AD ACCOUNTS ENDPOINTS
   ------------------------------------------------------------- */

/**
 * GET /ad-accounts
 * Lists accessible Meta ad accounts for this connection.
 */
router.get("/ad-accounts", requireAuth, wrap(async (req, res) => {
  const accounts = await metaAdsService.getAdAccounts();
  res.json({ accounts });
}));

/**
 * POST /ad-account
 * Selects an ad account for dealership advertising.
 */
router.post("/ad-account", requireAuth, requireAdmin, express.json(), wrap(async (req, res) => {
  const { accountId } = req.body || {};
  if (!accountId) return res.status(400).json({ error: "accountId is required." });

  const result = await metaAdsService.selectAdAccount(accountId);

  await auditLog(
    "AD_ACCOUNT_SELECTED",
    "meta_ad_account",
    accountId,
    null,
    { accountId },
    "Selected active Meta Ad Account",
    req.session
  );

  res.json(result);
}));

/* -------------------------------------------------------------
   CAMPAIGN MANAGEMENT ENDPOINTS
   ------------------------------------------------------------- */

/**
 * GET /campaigns
 * Lists all advertising campaigns with their latest synced metrics.
 */
router.get("/campaigns", requireAuth, wrap(async (req, res) => {
  const campaigns = await metaAdsService.getCampaigns();
  res.json({ campaigns });
}));

/**
 * POST /campaigns
 * Creates a vehicle advertisement campaign from existing inventory.
 */
router.post("/campaigns", requireAuth, requireAdmin, express.json(), wrap(async (req, res) => {
  const campaign = await metaAdsService.createCampaign(req.body, req.session.name || req.session.username);

  await auditLog(
    "CAMPAIGN_CREATED",
    "meta_campaign",
    campaign.id,
    null,
    {
      name: campaign.name,
      carId: campaign.carId,
      dailyBudget: campaign.dailyBudget,
      status: campaign.status
    },
    "Created vehicle advertisement campaign",
    req.session
  );

  res.status(201).json({ campaign });
}));

/**
 * POST /campaigns/:id/pause
 * Pauses a campaign on Meta.
 */
router.post("/campaigns/:id/pause", requireAuth, requireAdmin, wrap(async (req, res) => {
  const result = await metaAdsService.pauseCampaign(req.params.id);

  await auditLog(
    "CAMPAIGN_PAUSED",
    "meta_campaign",
    req.params.id,
    { status: "ACTIVE" },
    { status: "PAUSED" },
    "Paused advertising campaign",
    req.session
  );

  res.json(result);
}));

/**
 * POST /campaigns/:id/resume
 * Resumes a campaign on Meta.
 */
router.post("/campaigns/:id/resume", requireAuth, requireAdmin, wrap(async (req, res) => {
  const result = await metaAdsService.resumeCampaign(req.params.id);

  await auditLog(
    "CAMPAIGN_RESUMED",
    "meta_campaign",
    req.params.id,
    { status: "PAUSED" },
    { status: "ACTIVE" },
    "Resumed advertising campaign",
    req.session
  );

  res.json(result);
}));

/**
 * POST /campaigns/:id/sync
 * Manually refreshes metrics from Meta Graph API v21.0.
 */
router.post("/campaigns/:id/sync", requireAuth, wrap(async (req, res) => {
  const metrics = await metaAdsService.syncCampaignMetrics(req.params.id);
  res.json({ metrics });
}));

/* -------------------------------------------------------------
   AUDIENCE ENDPOINTS
   ------------------------------------------------------------- */

/**
 * GET /audiences
 * Lists available audiences from the active audience provider.
 */
router.get("/audiences", requireAuth, wrap(async (req, res) => {
  const audiences = await metaAdsService.getAudiences();
  res.json({ audiences });
}));

/**
 * POST /audiences
 * Creates a new marketing audience.
 */
router.post("/audiences", requireAuth, requireAdmin, express.json(), wrap(async (req, res) => {
  const { name, description, type } = req.body || {};
  if (!name) return res.status(400).json({ error: "Audience name is required." });

  const audience = await metaAdsService.createAudience(name, description, type);

  await auditLog(
    "AUDIENCE_CREATED",
    "meta_audience",
    audience.id,
    null,
    { name, type },
    "Created marketing audience",
    req.session
  );

  res.status(201).json({ audience });
}));

/* -------------------------------------------------------------
   VEHICLE SALES ATTRIBUTION ENDPOINT
   ------------------------------------------------------------- */

/**
 * GET /attribution
 * Returns database-grounded vehicle sales attribution report.
 */
router.get("/attribution", requireAuth, wrap(async (req, res) => {
  const report = await metaAdsService.getAttributionReport();
  res.json({ report });
}));

module.exports = router;

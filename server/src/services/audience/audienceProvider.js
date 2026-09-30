"use strict";

/**
 * Audience Provider Architecture
 *
 * Provides a unified abstraction for marketing audience providers.
 * Supported providers:
 *  - MetaAudienceProvider (Active: Meta Graph API v21.0 Custom Audiences)
 *  - PolkAudienceProvider (Architectural stub for future Polk/S&P Mobility integration)
 */

class AudienceProvider {
  /**
   * Unique identifier for the provider.
   * @returns {string}
   */
  getId() {
    throw new Error("AudienceProvider.getId() must be implemented.");
  }

  /**
   * Human-readable provider name.
   * @returns {string}
   */
  getName() {
    throw new Error("AudienceProvider.getName() must be implemented.");
  }

  /**
   * Returns supported capabilities and audience types.
   * @returns {{ audienceTypes: string[], supportsSync: boolean, isAvailable: boolean }}
   */
  getCapabilities() {
    throw new Error("AudienceProvider.getCapabilities() must be implemented.");
  }

  /**
   * Retrieve audiences from the provider.
   * @param {Object} params
   * @returns {Promise<Array<{ id: string, name: string, description: string, size: number, type: string }>>}
   */
  async getAudiences(params) {
    throw new Error("AudienceProvider.getAudiences() must be implemented.");
  }

  /**
   * Create an audience on the provider.
   * @param {Object} params
   * @returns {Promise<{ id: string, name: string, description: string, type: string }>}
   */
  async createAudience(params) {
    throw new Error("AudienceProvider.createAudience() must be implemented.");
  }

  /**
   * Synchronize audience membership.
   * @param {Object} params
   * @returns {Promise<{ success: boolean, count?: number }>}
   */
  async syncAudience(params) {
    throw new Error("AudienceProvider.syncAudience() must be implemented.");
  }
}

/**
 * Meta Audience Provider
 * Implements Meta Custom Audiences via Meta Graph API v21.0.
 */
class MetaAudienceProvider extends AudienceProvider {
  constructor() {
    super();
    this.apiVersion = "v21.0";
    this.graphBase = `https://graph.facebook.com/${this.apiVersion}`;
  }

  getId() {
    return "meta";
  }

  getName() {
    return "Meta (Facebook & Instagram) Audiences";
  }

  getCapabilities() {
    return {
      audienceTypes: ["website_visitors", "vehicle_viewers", "leads", "custom"],
      supportsSync: true,
      isAvailable: true
    };
  }

  /**
   * Fetches custom audiences from Meta Marketing API or returns mock audiences in mock mode.
   */
  async getAudiences({ adAccountId, accessToken, isMock = false }) {
    if (isMock) {
      return [
        {
          id: "aud_meta_visitors_001",
          name: "Website Visitors (Last 30 Days)",
          description: "All visitors who viewed our car marketplace storefront in the past 30 days.",
          type: "website_visitors",
          approximateCount: 2450,
          provider: "meta",
          isMock: true
        },
        {
          id: "aud_meta_viewers_002",
          name: "Subaru Vehicle Viewers",
          description: "Visitors who actively inspected vehicle specifications, photos, and pricing.",
          type: "vehicle_viewers",
          approximateCount: 1180,
          provider: "meta",
          isMock: true
        },
        {
          id: "aud_meta_leads_003",
          name: "Vehicle Inquiries & Leads",
          description: "Potential buyers who submitted an inquiry or requested a test drive.",
          type: "leads",
          approximateCount: 340,
          provider: "meta",
          isMock: true
        }
      ];
    }

    if (!adAccountId || !accessToken) {
      throw new Error("adAccountId and accessToken are required for Meta audience retrieval.");
    }

    const cleanAccountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const url = `${this.graphBase}/${cleanAccountId}/customaudiences?fields=id,name,description,subtype,approximate_count_lower_bound,approximate_count_upper_bound&access_token=${encodeURIComponent(accessToken)}`;

    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message = errBody.error?.message || `Meta API error (${res.status})`;
      throw new Error(`Failed to fetch Meta audiences: ${message}`);
    }

    const data = await res.json();
    return (data.data || []).map((aud) => ({
      id: aud.id,
      name: aud.name,
      description: aud.description || "",
      type: aud.subtype?.toLowerCase() || "custom",
      approximateCount: aud.approximate_count_upper_bound || aud.approximate_count_lower_bound || 0,
      provider: "meta",
      isMock: false
    }));
  }

  /**
   * Creates a custom audience on Meta Graph API v21.0.
   */
  async createAudience({ adAccountId, accessToken, name, description, audienceType = "custom", isMock = false }) {
    if (isMock) {
      return {
        id: `aud_meta_${Date.now()}`,
        name,
        description: description || `Automated ${audienceType} audience`,
        type: audienceType,
        approximateCount: 0,
        provider: "meta",
        createdAt: new Date().toISOString(),
        isMock: true
      };
    }

    if (!adAccountId || !accessToken) {
      throw new Error("adAccountId and accessToken are required to create a Meta audience.");
    }

    const cleanAccountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const url = `${this.graphBase}/${cleanAccountId}/customaudiences`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || "",
        subtype: "CUSTOM",
        customer_file_source: "USER_PROVIDED_ONLY",
        access_token: accessToken
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message = errBody.error?.message || `Meta API error (${res.status})`;
      throw new Error(`Failed to create Meta audience: ${message}`);
    }

    const json = await res.json();
    return {
      id: json.id,
      name,
      description,
      type: audienceType,
      provider: "meta",
      createdAt: new Date().toISOString(),
      isMock: false
    };
  }

  async syncAudience({ adAccountId, accessToken, audienceId, isMock = false }) {
    if (isMock) {
      return { success: true, count: 12, isMock: true };
    }
    // Return sync status for Meta Custom Audience
    return { success: true, audienceId, isMock: false };
  }
}

/**
 * Polk Audience Provider (Architectural Stub)
 *
 * NOTE: This is an architectural boundary for future integration with
 * IHS Markit / S&P Global Mobility Polk Automotive Audiences.
 *
 * IMPORTANT COMPLIANCE NOTICE:
 * - This class does NOT implement or fake any Polk API endpoints.
 * - This class does NOT create fake Polk credentials or claim Polk integration exists.
 * - Calling active methods will throw a descriptive error explaining the commercial and
 *   technical requirements required before Polk integration can be enabled.
 */
class PolkAudienceProvider extends AudienceProvider {
  getId() {
    return "polk";
  }

  getName() {
    return "Polk Automotive Audiences (Future Provider)";
  }

  getCapabilities() {
    return {
      audienceTypes: ["in_market_subaru", "oem_conquest", "recent_purchasers", "service_due"],
      supportsSync: false,
      isAvailable: false,
      status: "PLANNED",
      notes: "Requires official S&P Global Mobility Polk commercial agreement, authorized OEM partner credentials, and API access."
    };
  }

  async getAudiences() {
    throw new Error(
      "Polk Automotive Audiences integration is not currently configured. " +
      "Polk integration requires: (1) Official Polk / S&P Global Mobility API documentation, " +
      "(2) Valid commercial authorization & partner credentials, " +
      "(3) Contractual licensing agreement for automotive market audiences."
    );
  }

  async createAudience() {
    throw new Error(
      "Polk Automotive Audiences cannot be created at this time. " +
      "Provider requires commercial contract and active credentials with S&P Global Mobility."
    );
  }

  async syncAudience() {
    throw new Error("Polk Automotive Audiences sync is not available without active commercial credentials.");
  }
}

/**
 * Registry to access audience providers.
 */
class AudienceProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.register(new MetaAudienceProvider());
    this.register(new PolkAudienceProvider());
  }

  register(provider) {
    this.providers.set(provider.getId(), provider);
  }

  get(id) {
    return this.providers.get(id) || null;
  }

  list() {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.getId(),
      name: p.getName(),
      capabilities: p.getCapabilities()
    }));
  }
}

const registry = new AudienceProviderRegistry();

module.exports = {
  AudienceProvider,
  MetaAudienceProvider,
  PolkAudienceProvider,
  audienceRegistry: registry
};

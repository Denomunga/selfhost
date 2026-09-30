"use strict";
/* Admin: Meta / Facebook Advertising management, campaigns, audiences, and attribution. */

const META_STATE = {
  status: null,
  campaigns: [],
  accounts: [],
  audiences: [],
  attribution: [],
  loading: false,
  error: null,
  lastFetched: 0
};

/**
 * Loads Meta Advertising status, campaigns, and attribution data from server.
 */
async function loadMetaData(force = false) {
  if (!force && META_STATE.status && (Date.now() - META_STATE.lastFetched < 10000)) {
    return META_STATE;
  }
  META_STATE.loading = true;
  META_STATE.error = null;
  try {
    const [statusRes, campRes] = await Promise.all([
      api("/api/admin/marketing/meta/status"),
      api("/api/admin/marketing/meta/campaigns").catch(() => ({ campaigns: [] }))
    ]);
    META_STATE.status = statusRes;
    META_STATE.campaigns = campRes.campaigns || [];

    if (statusRes && statusRes.connected) {
      const [accRes, audRes, attrRes] = await Promise.all([
        api("/api/admin/marketing/meta/ad-accounts").catch(() => ({ accounts: [] })),
        api("/api/admin/marketing/meta/audiences").catch(() => ({ audiences: [] })),
        api("/api/admin/marketing/meta/attribution").catch(() => ({ report: [] }))
      ]);
      META_STATE.accounts = accRes.accounts || [];
      META_STATE.audiences = audRes.audiences || [];
      META_STATE.attribution = attrRes.report || [];
    }
    META_STATE.lastFetched = Date.now();
  } catch (err) {
    console.error("[Meta UI] Failed to load Meta data:", err);
    META_STATE.error = (err && err.message) || "Could not communicate with the Meta Advertising service.";
  } finally {
    META_STATE.loading = false;
  }
  return META_STATE;
}

/**
 * Main view for Marketing -> Meta Advertising dashboard tab.
 */
function admMetaAds() {
  const { status, campaigns, accounts, attribution, loading, error } = META_STATE;

  // Initial trigger if not loaded yet
  if (!status && !loading && !error) {
    loadMetaData().then(() => {
      refreshAdmin();
    });
    return `<div style="padding:48px;text-align:center"><div class="loading">Loading Meta Advertising…</div></div>`;
  }

  // Parse URL parameters for callback status or errors
  const hash = location.hash || "";
  const queryStr = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const params = new URLSearchParams(queryStr);
  const callbackError = params.get("error");
  const callbackConnected = params.get("connected");

  // DISCONNECTED STATE
  if (!status || !status.connected) {
    return `
      ${toolbar("Meta Advertising")}
      ${callbackError ? `<div class="notice notice--bad" style="margin-bottom:20px">${esc(callbackError)}</div>` : ""}
      ${error ? `<div class="notice notice--bad" style="margin-bottom:20px">${esc(error)}</div>` : ""}

      <div class="adm-split" style="margin-top:16px;max-width:960px">
        <div style="background:var(--ink);border:1px solid var(--rule);padding:clamp(24px,3.5vw,40px);border-radius:var(--r,4px)">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <span class="tag" style="background:#1877F2;color:#fff;border:none">Meta</span>
            <span class="muted" style="font-size:.85rem">Facebook &amp; Instagram Advertising</span>
            ${status && status.isMock ? `<span class="pill pill--bad">[DEVELOPMENT / MOCK MODE]</span>` : ""}
          </div>

          <h2 class="h-2" style="margin-bottom:12px">Advertise your inventory on Facebook and Instagram</h2>
          <p class="muted" style="line-height:1.7;margin-bottom:24px;font-size:.95rem">
            Connect your dealership's Facebook account to publish vehicle ads, target Kenyan car buyers,
            and automatically sync inquiries and test drive leads into your dashboard.
          </p>

          <div style="margin-bottom:28px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="color:var(--chalk)">✓</span>
              <span class="muted" style="font-size:.88rem">One-click Facebook OAuth login — no technical tokens or App IDs required.</span>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="color:var(--chalk)">✓</span>
              <span class="muted" style="font-size:.88rem">Automatic vehicle selection directly from your existing Subaru inventory.</span>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="color:var(--chalk)">✓</span>
              <span class="muted" style="font-size:.88rem">Real vehicle sales attribution based on verified customer invoices.</span>
            </div>
          </div>

          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <button class="btn btn--solid" id="meta-btn-connect" style="background:#1877F2;color:#fff;border-color:#1877F2;padding:12px 24px">
              Connect Facebook
            </button>
            <span class="muted" style="font-size:.8rem">Redirects to Facebook's official secure authorization</span>
          </div>
        </div>

        <div style="background:var(--ink);border:1px solid var(--rule);padding:clamp(20px,2.5vw,32px);border-radius:var(--r,4px)">
          <h4 class="adm-h" style="margin-bottom:16px">How it works</h4>
          <ol style="margin:0 0 0 18px;padding:0;line-height:1.9;color:var(--chalk);font-size:.88rem">
            <li>Log into your Facebook account with advertising access.</li>
            <li>Select your dealership ad account (auto-detected).</li>
            <li>Pick any vehicle from inventory to generate your ad.</li>
            <li>Track real leads and attributed sales in real time.</li>
          </ol>

          <div class="notice" style="margin-top:24px;font-size:.82rem">
            <b>Privacy &amp; Security:</b> Your credentials stay encrypted on your server.
            Tokens and secrets are never stored in your browser or exposed to the public.
          </div>
        </div>
      </div>
    `;
  }

  // CONNECTED STATE
  const selectedAcc = status.selectedAccount;
  const isMock = status.isMock;

  // Aggregate metrics
  const totalSpend = campaigns.reduce((s, c) => s + (Number(c.metrics?.spend) || 0), 0);
  const totalImpressions = campaigns.reduce((s, c) => s + (Number(c.metrics?.impressions) || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (Number(c.metrics?.clicks) || 0), 0);
  const totalLeads = campaigns.reduce((s, c) => s + (Number(c.metrics?.leads) || 0), 0);
  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";
  const avgCpl = totalLeads > 0 ? ksh(Math.round(totalSpend / totalLeads)) : "—";

  // Attribution summary
  const attributedVehicles = attribution.reduce((s, a) => s + (Number(a.vehiclesSold) || 0), 0);
  const attributedRevenue = attribution.reduce((s, a) => s + (Number(a.attributedRevenue) || 0), 0);

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:20px">
      <div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h3 class="h-3" style="margin:0">Meta Advertising</h3>
          <span class="pill pill--ok">Facebook Connected ✓</span>
          ${isMock ? `<span class="pill pill--bad" title="Running in safe local mock mode">[DEMO / MOCK MODE]</span>` : ""}
          ${status.tokenExpiringSoon ? `<span class="pill pill--bad">Token expiring soon — reconnect</span>` : ""}
        </div>
        <div class="muted" style="font-size:.82rem;margin-top:6px">
          ${selectedAcc ? `Active Ad Account: <b style="color:var(--white)">${esc(selectedAcc.name)}</b> (${esc(selectedAcc.currency)})` : `No Ad Account selected`}
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${accounts.length > 1 ? `
          <select id="meta-account-picker" style="font-size:.8rem;padding:6px 10px;background:var(--ink);border:1px solid var(--rule);color:var(--white)">
            ${accounts.map(a => `<option value="${esc(a.accountId)}" ${a.selected ? "selected" : ""}>${esc(a.name)} (${esc(a.currency)})</option>`).join("")}
          </select>
          <button class="mini" id="meta-btn-save-acc">Switch Account</button>
        ` : ""}
        <button class="btn btn--sm btn--solid" id="meta-btn-create-ad">+ Create Advertisement</button>
        <button class="btn btn--sm" id="meta-btn-audiences">Audiences</button>
        <button class="btn btn--sm" id="meta-btn-refresh" title="Sync live metrics from Meta">↻ Refresh</button>
        <button class="mini mini--danger" id="meta-btn-disconnect">Disconnect</button>
      </div>
    </div>

    ${callbackConnected ? `<div class="notice notice--ok" style="margin-bottom:20px">Facebook successfully connected! Your ad accounts are ready.</div>` : ""}
    ${callbackError ? `<div class="notice notice--bad" style="margin-bottom:20px">${esc(callbackError)}</div>` : ""}

    ${statGrid([
      ["Active campaigns", campaigns.filter(c => c.status === "ACTIVE").length, campaigns.length + " total"],
      ["Impressions", totalImpressions.toLocaleString(), "Ad views across Meta"],
      ["Clicks", totalClicks.toLocaleString(), `${avgCtr}% CTR`],
      ["Leads & inquiries", totalLeads.toLocaleString(), `Cost / lead: ${avgCpl}`],
      ["Total ad spend", ksh(totalSpend), "Across all campaigns"],
      ["Attributed sales", attributedVehicles + " vehicles", ksh(attributedRevenue) + " confirmed"]
    ])}

    <div style="margin-top:28px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h4 class="adm-h" style="margin:0">Active &amp; Historical Campaigns (${campaigns.length})</h4>
        <span class="count">${campaigns.filter(c => c.status === "ACTIVE").length} active</span>
      </div>

      ${tbl(
        ["Campaign & Vehicle", "Objective", "Daily Budget", "Impressions", "Clicks (CTR)", "Leads", "Spend", "Status", "Actions"],
        campaigns.map(c => {
          const m = c.metrics || {};
          const isAct = c.status === "ACTIVE";
          const ctr = m.ctr ? m.ctr + "%" : "0%";
          return `<tr>
            <td>
              <b style="color:var(--white)">${esc(c.name)}</b>
              <div class="muted" style="font-size:.76rem;margin-top:2px">
                ${esc(c.vehicleTitle || "Vehicle")} · ${esc(c.targetLocation || "Kenya")}
              </div>
            </td>
            <td><span class="tag" style="font-size:.7rem">${esc(c.objective === "OUTCOME_LEADS" ? "Leads" : "Traffic")}</span></td>
            <td class="num">${ksh(c.dailyBudget)}/day</td>
            <td class="num">${(Number(m.impressions) || 0).toLocaleString()}</td>
            <td class="num">${(Number(m.clicks) || 0).toLocaleString()} <span class="muted" style="font-size:.75rem">(${ctr})</span></td>
            <td class="num"><b style="color:var(--white)">${Number(m.leads) || 0}</b></td>
            <td class="num">${ksh(m.spend || 0)}</td>
            <td><span class="pill ${isAct ? "pill--ok" : ""}">${esc(c.status)}</span></td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="mini" data-camp-sync="${esc(c.id)}" title="Refresh metrics from Meta">↻</button>
                <button class="mini" data-camp-toggle="${esc(c.id)}" data-action="${isAct ? "pause" : "resume"}">
                  ${isAct ? "Pause" : "Resume"}
                </button>
                <button class="mini" data-camp-view="${esc(c.id)}">Details</button>
              </div>
            </td>
          </tr>`;
        }),
        "No Meta campaigns created yet. Click '+ Create Advertisement' to launch your first vehicle ad."
      )}
    </div>

    <!-- SALES ATTRIBUTION REPORT -->
    <div style="margin-top:36px;border-top:1px solid var(--rule);padding-top:28px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h4 class="adm-h" style="margin:0">Vehicle Sales Attribution</h4>
          <p class="muted" style="font-size:.82rem;margin:4px 0 0">
            Attribution is derived exclusively from real database relationships (Campaign → Vehicle → Inquiries → Sales Invoices).
          </p>
        </div>
        <div style="font-size:.82rem" class="muted">
          Confirmed Attributed Revenue: <b style="color:var(--ok)">${ksh(attributedRevenue)}</b>
        </div>
      </div>

      ${tbl(
        ["Campaign", "Vehicle", "Inquiries / Leads", "Attributed Vehicles Sold", "Revenue Attributed", "Attribution Status"],
        attribution.map(a => {
          const isAtt = a.attributionStatus === "ATTRIBUTED";
          return `<tr>
            <td style="color:var(--white)">${esc(a.campaignName)}</td>
            <td><a href="#/cars/${esc(a.carId)}" style="color:var(--chalk)">${esc(a.vehicleTitle)}</a></td>
            <td class="num">${a.inquiriesCount} inquiry${a.inquiriesCount === 1 ? "" : "s"}</td>
            <td class="num"><b style="color:${a.vehiclesSold > 0 ? "var(--white)" : "var(--muted)"}">${a.vehiclesSold}</b></td>
            <td class="num" style="color:${a.attributedRevenue > 0 ? "var(--ok)" : "inherit"}">${ksh(a.attributedRevenue)}</td>
            <td>
              <span class="pill ${isAtt ? "pill--ok" : ""}">
                ${isAtt ? "Attributed" : "Not attributed"}
              </span>
            </td>
          </tr>`;
        }),
        "No campaign attribution records available yet."
      )}
    </div>
  `;
}

/* -------------------------------------------------------------
   MODALS: CAMPAIGN CREATION, DETAILS, AUDIENCES, DISCONNECT
   ------------------------------------------------------------- */

/**
 * Renders the simple vehicle ad creation modal.
 * Pre-populates all vehicle details from existing inventory!
 */
function metaCampaignForm(prefillCarId = "") {
  const cars = DB.available();
  if (!cars.length) {
    return toast("No available vehicles found in inventory to advertise.", true);
  }

  const initialCar = (prefillCarId && DB.car(prefillCarId)) || cars[0];

  const buildAdDefaults = (car) => {
    if (!car) return { name: "", headline: "", desc: "", price: 0, url: "" };
    const title = `${car.year} Subaru ${car.model} ${car.variant || ""}`.trim();
    return {
      name: `${title} - Nairobi Campaign`,
      headline: `${title} Available Now | ${ksh(car.price)}`,
      desc: car.description || `Inspected and certified ${title} in Nairobi. Built for the journey. Inquire today.`,
      price: car.price || 0,
      url: `#/cars/${car.id}`
    };
  };

  const def = buildAdDefaults(initialCar);

  openModal(`
    <div class="modal-head">
      <div>
        <span class="tag" style="background:#1877F2;color:#fff;border:none">Meta Advertising</span>
        <h3 class="h-2" style="margin-top:10px">Create Vehicle Advertisement</h3>
      </div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button>
    </div>

    <form id="meta-campaign-form" class="form-grid">
      ${selectField(
        "mc-car",
        "Vehicle from Inventory *",
        cars.map(c => [c.id, `${c.year} Subaru ${c.model} ${c.variant || ""} — ${ksh(c.price)}`]),
        initialCar ? initialCar.id : ""
      )}

      ${inputField("mc-name", "Campaign Name *", def.name, "text", 'required')}

      ${selectField(
        "mc-obj",
        "Campaign Objective",
        [
          ["OUTCOME_LEADS", "Generate Inquiries & Leads (Recommended)"],
          ["OUTCOME_TRAFFIC", "Drive Traffic to Vehicle Page"]
        ],
        "OUTCOME_LEADS"
      )}

      ${inputField("mc-budget", "Daily Budget (KSh) *", 2500, "number", 'min="500" step="100" required')}

      <div class="field">
        <label for="mc-start">Start Date</label>
        <input id="mc-start" type="date" value="${dayKey(todayISO())}">
      </div>

      <div class="field">
        <label for="mc-location">Target Location</label>
        <input id="mc-location" type="text" value="Nairobi, Kenya">
      </div>

      ${selectField(
        "mc-audience",
        "Audience Target",
        [
          ["vehicle_viewers", "Vehicle Viewers (In-Market Subaru Buyers)"],
          ["website_visitors", "Website Visitors (Retargeting)"],
          ["leads", "Past Inquiries & Leads"],
          ["custom", "Broad Kenya Automotive Audience"]
        ],
        "vehicle_viewers"
      )}

      ${selectField(
        "mc-cta",
        "Call to Action",
        [
          ["LEARN_MORE", "Learn More"],
          ["CONTACT_US", "Contact Us"],
          ["BOOK_TRAVEL", "Book Test Drive"],
          ["GET_QUOTE", "Get Quote"]
        ],
        "LEARN_MORE"
      )}

      <div class="field full">
        <label for="mc-headline">Ad Headline</label>
        <input id="mc-headline" type="text" value="${esc(def.headline)}" required>
      </div>

      <div class="field full">
        <label for="mc-desc">Ad Description</label>
        <textarea id="mc-desc" style="min-height:75px">${esc(def.desc)}</textarea>
      </div>

      <div class="field full">
        <label>Selected Vehicle Image</label>
        <div id="mc-img-preview" style="width:160px;height:100px;border-radius:var(--r,4px);overflow:hidden;border:1px solid var(--rule);background:var(--ink)">
          ${initialCar ? media(initialCar.images && initialCar.images[0], "", initialCar.body || "SUV", "mc-img") : ""}
        </div>
      </div>

      <div class="field full">
        <label for="mc-url">Vehicle Landing Page URL</label>
        <input id="mc-url" type="text" value="${esc(def.url)}" readonly style="opacity:.8;background:var(--ink)">
      </div>

      <div class="full btn-row" style="justify-content:space-between;margin-top:10px">
        <button class="btn btn--solid" type="submit" id="mc-submit" style="background:#1877F2;border-color:#1877F2;color:#fff">
          Create Advertisement
        </button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `, true);

  // Wire auto-population when selecting a different vehicle
  const carSelect = $("#mc-car");
  if (carSelect) {
    carSelect.addEventListener("change", () => {
      const c = DB.car(carSelect.value);
      if (!c) return;
      const data = buildAdDefaults(c);
      $("#mc-name").value = data.name;
      $("#mc-headline").value = data.headline;
      $("#mc-desc").value = data.desc;
      $("#mc-url").value = data.url;

      const imgBox = $("#mc-img-preview");
      if (imgBox) {
        imgBox.innerHTML = media(c.images && c.images[0], "", c.body || "SUV", "mc-img-" + c.id);
      }
    });
  }

  // Handle campaign form submission
  $("#meta-campaign-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#mc-submit");
    btn.disabled = true;
    btn.textContent = "Publishing to Meta…";

    const payload = {
      carId: val("#mc-car"),
      name: val("#mc-name"),
      objective: val("#mc-obj"),
      dailyBudget: num("#mc-budget"),
      startDate: val("#mc-start"),
      targetLocation: val("#mc-location"),
      audienceType: val("#mc-audience"),
      headline: val("#mc-headline"),
      description: val("#mc-desc"),
      callToAction: val("#mc-cta"),
      landingPageUrl: val("#mc-url")
    };

    try {
      await api("/api/admin/marketing/meta/campaigns", { method: "POST", body: payload });
      await loadMetaData(true);
      closeModal();
      toast("Advertisement published successfully!");
      refreshAdmin();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Create Advertisement";
      toast((err && err.message) || "Failed to create advertisement on Meta.", true);
    }
  });
}

/**
 * Modal to display audiences and allow creating custom audience segments.
 */
function metaAudiencesModal() {
  const audiences = META_STATE.audiences || [];
  openModal(`
    <div class="modal-head">
      <div>
        <span class="tag">Audiences</span>
        <h3 class="h-2" style="margin-top:10px">Meta Marketing Audiences</h3>
      </div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button>
    </div>

    <div style="margin-bottom:20px">
      ${tbl(
        ["Audience Name", "Type", "Approx. Size", "Provider", "Status"],
        audiences.map(a => `<tr>
          <td><b style="color:var(--white)">${esc(a.name)}</b><div class="muted" style="font-size:.76rem">${esc(a.description || "")}</div></td>
          <td><span class="tag" style="font-size:.7rem">${esc(a.type)}</span></td>
          <td class="num">${(Number(a.approximateCount) || 0).toLocaleString()}</td>
          <td>${esc(a.provider || "meta")}</td>
          <td><span class="pill pill--ok">Active</span></td>
        </tr>`),
        "No audiences found."
      )}
    </div>

    <div style="border-top:1px solid var(--rule);padding-top:18px">
      <h4 class="adm-h" style="margin-bottom:12px">Create Audience Segment</h4>
      <form id="meta-aud-form" class="form-grid">
        ${inputField("ma-name", "Audience Name", "Subaru Enthusiasts Nairobi", "text", 'required')}
        ${selectField(
          "ma-type",
          "Audience Source",
          [
            ["website_visitors", "Website Visitors (Past 30 Days)"],
            ["vehicle_viewers", "Vehicle Viewers (Browsed Inventory)"],
            ["leads", "Inquiries & Leads"],
            ["custom", "Custom Audience"]
          ],
          "vehicle_viewers"
        )}
        <div class="field full">
          <label for="ma-desc">Description</label>
          <input id="ma-desc" type="text" value="Audience generated from dealership activity.">
        </div>
        <div class="full btn-row" style="justify-content:flex-end">
          <button class="btn btn--solid" type="submit" id="ma-submit">Create Audience</button>
        </div>
      </form>
    </div>
  `, true);

  $("#meta-aud-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#ma-submit");
    btn.disabled = true;
    btn.textContent = "Creating…";

    try {
      await api("/api/admin/marketing/meta/audiences", {
        method: "POST",
        body: {
          name: val("#ma-name"),
          type: val("#ma-type"),
          description: val("#ma-desc")
        }
      });
      await loadMetaData(true);
      closeModal();
      toast("Audience created successfully");
      metaAudiencesModal();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Create Audience";
      toast((err && err.message) || "Could not create audience.", true);
    }
  });
}

/**
 * Detailed modal view for a single campaign.
 */
function metaCampaignDetailModal(campaignId) {
  const c = META_STATE.campaigns.find(camp => camp.id === campaignId);
  if (!c) return;

  const m = c.metrics || {};
  const car = c.carId ? DB.car(c.carId) : null;

  openModal(`
    <div class="modal-head">
      <div>
        <span class="tag" style="background:#1877F2;color:#fff;border:none">Meta Campaign</span>
        <h3 class="h-2" style="margin-top:10px">${esc(c.name)}</h3>
        <div class="muted" style="font-size:.82rem;margin-top:4px">
          Status: <span class="pill ${c.status === "ACTIVE" ? "pill--ok" : ""}">${esc(c.status)}</span>
          · Created by ${esc(c.createdBy || "Admin")}
        </div>
      </div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button>
    </div>

    ${statGrid([
      ["Impressions", (Number(m.impressions) || 0).toLocaleString(), "Ad views"],
      ["Reach", (Number(m.reach) || 0).toLocaleString(), "Unique viewers"],
      ["Clicks", (Number(m.clicks) || 0).toLocaleString(), `${m.ctr || 0}% CTR`],
      ["Leads", (Number(m.leads) || 0).toLocaleString(), `Cost / lead: ${ksh(m.costPerLead || 0)}`],
      ["Spend", ksh(m.spend || 0), `${ksh(c.dailyBudget)} / day budget`]
    ])}

    <div class="adm-split" style="margin-top:20px">
      <div>
        <h4 class="adm-h">Advertisement Preview</h4>
        <div style="background:var(--surface);border:1px solid var(--rule);border-radius:var(--r,4px);overflow:hidden;max-width:340px">
          <div style="padding:10px 14px;border-bottom:1px solid var(--rule);display:flex;align-items:center;gap:8px">
            <span style="font-weight:600;font-size:.85rem;color:var(--white)">${esc(DB.s.dealership)}</span>
            <span class="muted" style="font-size:.72rem">Sponsored</span>
          </div>
          <div style="padding:10px 14px;font-size:.82rem;color:var(--chalk);line-height:1.5">
            ${esc(c.description || "")}
          </div>
          <div style="height:180px;background:var(--ink);overflow:hidden">
            ${car ? media(car.images && car.images[0], "", car.body || "SUV", "camp-det") : ""}
          </div>
          <div style="padding:12px 14px;background:var(--ink);display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:.7rem;text-transform:uppercase" class="muted">sheriffmotors.co.ke</div>
              <div style="font-size:.85rem;font-weight:600;color:var(--white)">${esc(c.headline || c.name)}</div>
            </div>
            <span class="mini" style="background:#1877F2;color:#fff;border:none">${esc(c.callToAction || "Learn More")}</span>
          </div>
        </div>
      </div>

      <div>
        <h4 class="adm-h">Campaign Configuration</h4>
        <dl class="specs" style="grid-template-columns:1fr">
          <div class="spec"><dt>Objective</dt><dd>${esc(c.objective)}</dd></div>
          <div class="spec"><dt>Daily Budget</dt><dd class="num">${ksh(c.dailyBudget)}</dd></div>
          <div class="spec"><dt>Target Location</dt><dd>${esc(c.targetLocation || "Kenya")}</dd></div>
          <div class="spec"><dt>Audience</dt><dd>${esc(c.audienceType || "Vehicle Viewers")}</dd></div>
          <div class="spec"><dt>Linked Vehicle</dt><dd><a href="#/cars/${esc(c.carId)}">${esc(c.vehicleTitle || "View Car")}</a></dd></div>
          <div class="spec"><dt>Landing URL</dt><dd style="font-size:.8rem">${esc(c.landingPageUrl || "—")}</dd></div>
        </dl>
      </div>
    </div>

    <div class="btn-row" style="margin-top:24px;justify-content:flex-end">
      <button class="btn btn--sm" onclick="closeModal()">Close</button>
    </div>
  `, true);
}

/**
 * Confirmation dialog before disconnecting Facebook.
 */
function metaDisconnectConfirm() {
  openModal(`
    <div class="modal-head">
      <div>
        <span class="tag">Disconnect</span>
        <h3 class="h-2" style="margin-top:10px">Disconnect Facebook?</h3>
      </div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button>
    </div>

    <p style="color:var(--chalk);line-height:1.7;margin-top:12px">
      This removes the application's connection to your Facebook Advertising account.
      Your stored access token will be invalidated.
    </p>

    <div class="notice" style="margin:16px 0">
      <b>Data Preservation:</b> Your existing vehicle inventory, customer inquiries, leads,
      and sales records will <b>never</b> be deleted. Historical campaign reporting will remain preserved.
    </div>

    <div class="btn-row" style="margin-top:20px;justify-content:space-between">
      <button class="btn btn--solid mini--danger" id="meta-confirm-disconnect">Confirm Disconnect</button>
      <button class="btn" onclick="closeModal()">Keep Connected</button>
    </div>
  `);

  $("#meta-confirm-disconnect").addEventListener("click", async () => {
    try {
      await api("/api/admin/marketing/meta/disconnect", { method: "POST" });
      await loadMetaData(true);
      closeModal();
      toast("Facebook disconnected");
      refreshAdmin();
    } catch (err) {
      toast((err && err.message) || "Failed to disconnect Facebook.", true);
    }
  });
}

/* -------------------------------------------------------------
   EVENT MOUNTING / BINDING
   ------------------------------------------------------------- */

/**
 * Binds DOM event handlers for the Meta Advertising page.
 * Called from mountAdminBody().
 */
function mountAdminMeta() {
  // Connect Facebook button
  bindAll("#meta-btn-connect", async () => {
    const btn = $("#meta-btn-connect");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Opening Facebook Login…";
    }
    try {
      const res = await api("/api/admin/marketing/meta/oauth/url");
      if (res && res.url) {
        window.location.href = res.url;
      } else {
        throw new Error("Could not retrieve Facebook authorization URL.");
      }
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Connect Facebook";
      }
      toast((err && err.message) || "Failed to initiate Facebook login.", true);
    }
  });

  // Disconnect button
  bindAll("#meta-btn-disconnect", () => metaDisconnectConfirm());

  // Create Ad button
  bindAll("#meta-btn-create-ad", () => metaCampaignForm());

  // Audiences button
  bindAll("#meta-btn-audiences", () => metaAudiencesModal());

  // Refresh metrics button
  bindAll("#meta-btn-refresh", async () => {
    toast("Syncing live metrics from Meta…");
    await loadMetaData(true);
    refreshAdmin();
    toast("Metrics synchronized");
  });

  // Switch Ad Account button
  bindAll("#meta-btn-save-acc", async () => {
    const select = $("#meta-account-picker");
    if (!select || !select.value) return;
    try {
      await api("/api/admin/marketing/meta/ad-account", {
        method: "POST",
        body: { accountId: select.value }
      });
      await loadMetaData(true);
      toast("Ad Account switched");
      refreshAdmin();
    } catch (err) {
      toast((err && err.message) || "Could not switch ad account.", true);
    }
  });

  // Campaign Pause / Resume buttons
  bindAll("[data-camp-toggle]", async (btn) => {
    const cid = btn.dataset.campToggle;
    const action = btn.dataset.action; // 'pause' or 'resume'
    try {
      await api(`/api/admin/marketing/meta/campaigns/${encodeURIComponent(cid)}/${action}`, { method: "POST" });
      await loadMetaData(true);
      toast(`Campaign ${action === "pause" ? "paused" : "resumed"}`);
      refreshAdmin();
    } catch (err) {
      toast((err && err.message) || `Failed to ${action} campaign.`, true);
    }
  });

  // Single campaign metrics sync button
  bindAll("[data-camp-sync]", async (btn) => {
    const cid = btn.dataset.campSync;
    try {
      await api(`/api/admin/marketing/meta/campaigns/${encodeURIComponent(cid)}/sync`, { method: "POST" });
      await loadMetaData(true);
      toast("Metrics refreshed");
      refreshAdmin();
    } catch (err) {
      toast((err && err.message) || "Could not sync metrics.", true);
    }
  });

  // View campaign details button
  bindAll("[data-camp-view]", (btn) => {
    metaCampaignDetailModal(btn.dataset.campView);
  });
}

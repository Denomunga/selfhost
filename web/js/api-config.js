"use strict";
/* Where the browser should send API calls. Self-hosted setups leave this
 * empty so calls go to the same origin that serves the page; the Vercel
 * build (vercel-build.js) rewrites the first line below from the
 * API_BASE_URL environment variable to point at the Render API. */
window.__RIFT_API_BASE__ = window.__RIFT_API_BASE__ || "";
const API_BASE = (typeof window !== "undefined" && window.__RIFT_API_BASE__) || "";

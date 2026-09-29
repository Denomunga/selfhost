"use strict";
/** In-process change bus for Server-Sent Events. Every write goes
 *  through this one server instance, so a Set of live response streams
 *  is the whole story — no broker needed unless the app is ever split
 *  across multiple processes, at which point this is the seam to swap. */

const clients = new Set();

function subscribe(res) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

function broadcast(event, data) {
  if (!clients.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (e) { clients.delete(res); }
  }
}

/** Tell every open tab that a collection changed. Clients refetch the
 *  snapshot they're allowed to see, so the stream itself never carries
 *  document data. */
function changed(coll) {
  broadcast("change", { coll });
}

// A comment line costs the browser nothing but keeps idle streams from
// being timed out by proxies. One shared timer instead of one per
// connection; unref'd so it never holds the process open on its own.
setInterval(() => {
  for (const res of clients) {
    try { res.write(": hb\n\n"); } catch (e) { clients.delete(res); }
  }
}, 25000).unref();

module.exports = { subscribe, broadcast, changed };

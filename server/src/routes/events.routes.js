"use strict";
const express = require("express");
const { subscribe } = require("../events");

const router = express.Router();

/** GET /api/events — the Server-Sent Events stream. Same-origin cookies
 *  ride along automatically, so staff tabs and public ones look
 *  identical here; each client reacts to a "change" event by refetching
 *  whichever snapshot it is allowed to see, so this stream itself never
 *  carries document data. */
router.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Ask nginx (and anything else that honours it) not to buffer us.
    "X-Accel-Buffering": "no"
  });
  // How long the browser waits before reconnecting a dropped stream.
  res.write("retry: 5000\n\n");
  res.write("event: hello\ndata: {}\n\n");
  subscribe(res);
});

module.exports = router;

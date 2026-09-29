"use strict";

/** Express 4 doesn't await async route handlers — a rejected promise
 *  anywhere in one takes the whole process down instead of producing a
 *  500. Wrapping every async handler funnels rejections into the normal
 *  error middleware. */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { wrap };

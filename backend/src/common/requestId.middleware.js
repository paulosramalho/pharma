// backend/src/common/requestId.middleware.js
const crypto = require("crypto");

function genRequestId() {
  return crypto.randomBytes(8).toString("hex");
}

function requestIdMiddleware(req, res, next) {
  const incoming = (req.headers["x-request-id"] || "").toString().trim();
  const requestId = incoming || genRequestId();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
}

module.exports = { requestIdMiddleware };

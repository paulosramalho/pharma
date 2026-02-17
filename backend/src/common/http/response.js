// backend/src/common/http/response.js
function sendOk(res, req, data, status = 200) {
  return res.status(status).json({
    ok: true,
    data,
    requestId: req.requestId,
  });
}

function sendError(res, req, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    error: {
      code: err.code || status,
      message: err.message || "Internal Server Error",
      details: err.details,
    },
    requestId: req.requestId,
  });
}

module.exports = { sendOk, sendError };

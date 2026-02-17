// backend/src/common/errorHandler.middleware.js
function errorHandlerMiddleware(log) {
  // eslint-disable-next-line no-unused-vars
  return function (err, req, res, next) {
    const status = err?.statusCode || err?.status || 500;

    log.error("http_error", {
      requestId: req.requestId,
      status,
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
    });

    res.status(status).json({
      error: {
        code: status,
        message: status >= 500 ? "Internal Server Error" : (err?.message || "Request failed"),
        requestId: req.requestId,
      },
    });
  };
}

module.exports = { errorHandlerMiddleware };

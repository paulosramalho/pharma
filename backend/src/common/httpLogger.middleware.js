// backend/src/common/httpLogger.middleware.js
function httpLoggerMiddleware(log) {
  return function (req, res, next) {
    const start = Date.now();

    log.info("http_request", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.on("finish", () => {
      const ms = Date.now() - start;
      log.info("http_response", {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        ms,
      });
    });

    next();
  };
}

module.exports = { httpLoggerMiddleware };

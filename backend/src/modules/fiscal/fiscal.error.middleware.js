// backend/src/modules/fiscal/fiscal.error.middleware.js
// Error handler apenas para /fiscal (se você quiser isolar do resto).
// Se você já tem um handler global, pode optar por não usar este.

const { sendError } = require("../../common/http/response");

function fiscalErrorMiddleware({ log }) {
  return (err, req, res, next) => {
    // se headers já enviados, delega
    if (res.headersSent) return next(err);

    const status = err.statusCode || 500;

    if (log?.error) {
      log.error("fiscal_http_error", {
        requestId: req.requestId,
        status,
        code: err.code,
        message: err.message,
      });
    }

    return sendError(res, req, err);
  };
}

module.exports = { fiscalErrorMiddleware };

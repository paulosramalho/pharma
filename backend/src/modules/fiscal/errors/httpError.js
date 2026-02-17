// backend/src/modules/fiscal/errors/httpError.js
function httpError(statusCode, code, message, details) {
  const err = new Error(message || code || "Erro");
  err.statusCode = statusCode || 500;
  err.code = code || "INTERNAL";
  if (details !== undefined) err.details = details;
  return err;
}

module.exports = { httpError };

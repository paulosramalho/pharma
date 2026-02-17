// backend/src/common/http/asyncHandler.js
// Wrapper para rotas async no Express (evita try/catch repetido).
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };

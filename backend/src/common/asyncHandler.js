
/**
 * Wrap async express handlers so errors go to next(err)
 * Avoids unhandled promise rejections (Node can terminate the process).
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };

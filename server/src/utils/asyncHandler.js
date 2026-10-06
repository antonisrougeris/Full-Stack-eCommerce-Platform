export function asyncHandler(fn) {
  return async function wrapped(req, res, next) {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

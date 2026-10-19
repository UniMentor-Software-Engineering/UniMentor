const config = require('../config/env');

// Centralized error handler: the last middleware in the chain.
// Any error thrown in a route, controller, service or repository ends up here.
// Express 5 forwards rejected promises from async handlers automatically,
// so controllers do not need try/catch just to call next(err).
//
// Response format (shared with frontend/js/api.js):
//   { "error": { "status": 409, "message": "...", "code": "..." } }
// Express identifies error handlers by their 4 arguments, so `next` must stay even if unused.
function errorHandler(err, req, res, next) {
  // AppError uses `status`; body-parser and other libraries use `status` or `statusCode`.
  const status = err.status || err.statusCode || 500;
  const isServerError = status >= 500;

  if (isServerError) {
    console.error(err);
  }

  const body = {
    error: {
      status,
      // Never leak internal details (SQL, stack traces) to the client in production.
      message: isServerError && config.isProduction ? 'Internal server error' : err.message,
    },
  };
  if (err.code && typeof err.code === 'string' && !isServerError) {
    body.error.code = err.code;
  }

  res.status(status).json(body);
}

module.exports = errorHandler;

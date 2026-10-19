const AppError = require('../utils/AppError');

// Reached only when no route matched the request.
function notFound(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
}

module.exports = notFound;

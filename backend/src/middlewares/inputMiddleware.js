// Rejects a NUL character anywhere in the input. PostgreSQL cannot store it in text and
// answers with an error, which would otherwise reach the client as a 500. Mounted in
// app.js for the whole API, so no route has to remember it.
const AppError = require('../utils/AppError');

function hasNullByte(value) {
  if (typeof value === 'string') return value.includes('\0');
  if (Array.isArray(value)) return value.some(hasNullByte);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, item]) => key.includes('\0') || hasNullByte(item));
  }
  return false;
}

function rejectNullBytes(req, res, next) {
  if (hasNullByte(req.query) || hasNullByte(req.body)) {
    throw new AppError(400, 'The request contains invalid characters.', 'INVALID_INPUT');
  }
  next();
}

module.exports = rejectNullBytes;

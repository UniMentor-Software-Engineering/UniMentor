// Small input validators shared by controllers and services.
const AppError = require('./AppError');

// Any 8-4-4-4-12 hexadecimal UUID. It is deliberately not restricted to v4 so that
// the readable IDs used in the seed data (b0000000-0000-0000-0000-000000000001) are valid too.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 50;
// Far beyond any real page, and small enough to always fit PostgreSQL's bigint.
const MAX_OFFSET = 1_000_000;

function isUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Validates ?limit and ?offset. Repeated parameters arrive as arrays and text such as
 * "5abc" is not a number: both are rejected instead of being half-parsed.
 * @returns {{ limit: number, offset: number }}
 */
function parsePagination({ limit, offset = 0 }, defaultLimit) {
  const parsedLimit = Number(limit ?? defaultLimit);
  const parsedOffset = Number(offset);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
    throw new AppError(400, `Limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  if (!Number.isInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > MAX_OFFSET) {
    throw new AppError(400, `Offset must be a non-negative integer of at most ${MAX_OFFSET}`);
  }
  return { limit: parsedLimit, offset: parsedOffset };
}

module.exports = { isUuid, parsePagination };

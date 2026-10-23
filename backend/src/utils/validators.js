// Small input validators shared by controllers and services.

// Any 8-4-4-4-12 hexadecimal UUID. It is deliberately not restricted to v4 so that
// the readable IDs used in the seed data (b0000000-0000-0000-0000-000000000001) are valid too.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

module.exports = { isUuid };

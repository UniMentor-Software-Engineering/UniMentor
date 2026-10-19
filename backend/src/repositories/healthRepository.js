// Data Access layer: the only layer that knows SQL and talks to PostgreSQL.
const db = require('../config/db');

async function ping() {
  const { rows } = await db.query('SELECT NOW() AS now');
  return rows[0].now;
}

module.exports = { ping };

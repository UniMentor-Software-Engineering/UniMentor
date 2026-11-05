// Data Access layer: the only layer that knows SQL and talks to PostgreSQL.
const db = require('../config/db');

// A reachable database can still be empty if the migrations never ran.
async function ping() {
  const { rows } = await db.query(
    "SELECT NOW() AS now, to_regclass('public.users') IS NOT NULL AS schema_ready",
  );
  return { now: rows[0].now, schemaReady: rows[0].schema_ready };
}

module.exports = { ping };

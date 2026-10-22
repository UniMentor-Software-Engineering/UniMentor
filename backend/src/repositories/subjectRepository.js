// Data Access layer: the only layer that knows SQL for subjects.
const db = require('../config/db');

async function findAll() {
  const { rows } = await db.query(
    'SELECT id, code, name, department FROM subjects ORDER BY name ASC',
  );
  return rows;
}

module.exports = { findAll };

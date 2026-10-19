// PostgreSQL connection pool (ADR 2). A single pool is shared by the whole application,
// so connections are reused instead of opened on every request.
// Only the repositories layer should import this module.
const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// An idle client can lose its connection (e.g. the database restarts).
// Log it instead of letting the error crash the process.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

/**
 * Runs a single parameterized query (NFR-02: never concatenate user input into SQL).
 * @param {string} text SQL with $1, $2... placeholders
 * @param {Array} [params]
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Runs `work` inside a transaction on a dedicated client:
 * BEGIN -> work(client) -> COMMIT, or ROLLBACK if anything throws.
 * Used by operations that must be atomic, such as booking a slot with
 * SELECT ... FOR UPDATE (CU-08) or suspending an account (CU-13).
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };

// Data access for the users table (CU-01, CU-02, CU-13).
// Functions that take a `client` run inside a transaction opened by the service.
const db = require('../config/db');

// Columns that are safe to return to the client: never password_hash.
const PUBLIC_COLUMNS = 'id, email, first_name, last_name, role, status, created_at';

// Used by verifyJWT on every authenticated request (CU-13: suspended accounts
// must be rejected even if their JWT is still valid).
async function findAuthState(id) {
  const { rows } = await db.query('SELECT id, role, status FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function findPublicById(id) {
  const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

// The lock is evaluated with the database clock, the same one that set locked_until.
async function findForLogin(email) {
  const { rows } = await db.query(
    `SELECT id, email, first_name, last_name, role, status, password_hash,
            (locked_until IS NOT NULL AND locked_until > now()) AS is_locked
       FROM users
      WHERE email = $1`,
    [email],
  );
  return rows[0] || null;
}

async function create({ firstName, lastName, email, passwordHash, role }) {
  const { rows } = await db.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [firstName, lastName, email, passwordHash, role],
  );
  return rows[0];
}

// CU-02 business rule: 5 consecutive failures lock the account for 15 minutes.
// A single UPDATE, so two simultaneous attempts cannot both read the old counter
// (in PostgreSQL every column in SET sees the value from before the update).
// When the account is locked the counter restarts, so after the 15 minutes the
// user gets 5 new attempts.
async function registerFailedLogin(id, maxAttempts, lockMinutes) {
  const { rows } = await db.query(
    `UPDATE users
        SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0
                                      ELSE failed_login_count + 1 END,
            locked_until       = CASE WHEN failed_login_count + 1 >= $2
                                      THEN now() + make_interval(mins => $3)
                                      ELSE locked_until END
      WHERE id = $1
      RETURNING (locked_until IS NOT NULL AND locked_until > now()) AS is_locked`,
    [id, maxAttempts, lockMinutes],
  );
  return rows[0].is_locked;
}

async function resetLoginState(id) {
  await db.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [id]);
}

// CU-13, step 1: user directory of the admin panel.
async function findAll({ search, role, status, limit, offset }) {
  const conditions = [];
  const params = [];

  if (search) {
    const escaped = search.replace(/[%_\\]/g, '\\$&');
    params.push(`%${escaped}%`);
    const p = `$${params.length}`;
    conditions.push(`(first_name ILIKE ${p} OR last_name ILIKE ${p} OR email ILIKE ${p})`);
  }
  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
       FROM users
       ${where}
      ORDER BY created_at DESC, id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

// Locks the row so two admins cannot suspend or reactivate the same account at once.
async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] || null;
}

async function updateStatus(client, id, status) {
  const { rows } = await client.query(
    `UPDATE users SET status = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, status],
  );
  return rows[0];
}

module.exports = {
  findAuthState,
  findPublicById,
  findForLogin,
  create,
  registerFailedLogin,
  resetLoginState,
  findAll,
  lockById,
  updateStatus,
};

// Data access for audit_logs (CU-14). The table is append-only: a trigger created by
// migration 001 rejects UPDATE and DELETE, and this module only inserts and reads.
const db = require('../config/db');

/**
 * Writes one audit entry. Pass the transaction client so the entry is committed
 * (or rolled back) together with the action it records.
 * @param {{ actorId?: string, action: string, targetType: string, targetId?: string, details?: object }} entry
 * @param {{ query: Function }} [executor] a transaction client; the shared pool by default
 */
async function insert({ actorId = null, action, targetType, targetId = null, details = null }, executor = db) {
  await executor.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, details === null ? null : JSON.stringify(details)],
  );
}

// Most recent first, with the actor's email (NULL for system or deleted actors).
async function findAll({ action, limit, offset }) {
  const params = [];
  let where = '';
  if (action) {
    params.push(action);
    where = 'WHERE a.action = $1';
  }
  params.push(limit, offset);

  const { rows } = await db.query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
            a.actor_id, u.email AS actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       ${where}
      ORDER BY a.created_at DESC, a.id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

module.exports = { insert, findAll };

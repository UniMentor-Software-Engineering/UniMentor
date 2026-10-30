// Data access for the admin use cases that span several tables:
// the suspension cascade (CU-13) and the platform metrics (CU-14).
const db = require('../config/db');

// CU-13, step 5: cancels the suspended user's upcoming confirmed sessions,
// as student or as tutor. Past sessions are history and stay as they are.
async function cancelFutureAppointments(client, userId, adminId) {
  const { rows } = await client.query(
    `UPDATE appointments
        SET status = 'CANCELLED', cancelled_by = $2, cancelled_at = now()
      WHERE (student_id = $1 OR tutor_id = $1)
        AND status = 'CONFIRMED'
        AND lower(time_range) > now()
      RETURNING id, slot_id, student_id, tutor_id, time_range`,
    [userId, adminId],
  );
  return rows;
}

// Releases the slots of the cancelled appointments: back to AVAILABLE when the
// suspended user was the student, UNAVAILABLE when it was the tutor
// (the schema's slot_status ENUM uses UNAVAILABLE for Phase 1's "BLOCKED").
async function releaseSlots(client, slotIds, suspendedUserId) {
  if (slotIds.length === 0) return;
  await client.query(
    `UPDATE availability_slots
        SET status = CASE WHEN tutor_id = $2 THEN 'UNAVAILABLE'::slot_status
                          ELSE 'AVAILABLE'::slot_status END
      WHERE id = ANY($1::uuid[])`,
    [slotIds, suspendedUserId],
  );
}

// A suspended tutor's free future slots are blocked too, so nobody can book them.
async function blockFreeSlots(client, tutorId) {
  const { rowCount } = await client.query(
    `UPDATE availability_slots
        SET status = 'UNAVAILABLE'
      WHERE tutor_id = $1
        AND status = 'AVAILABLE'
        AND lower(time_range) > now()`,
    [tutorId],
  );
  return rowCount;
}

// CU-14, steps 2-3: aggregation queries across users, availability_slots and appointments.
async function getMetrics() {
  const { rows } = await db.query(`
    SELECT
      (SELECT count(*) FROM users WHERE role = 'STUDENT')::int                       AS students,
      (SELECT count(*) FROM users WHERE role = 'TUTOR')::int                         AS tutors,
      (SELECT count(*) FROM users WHERE role = 'ADMIN')::int                         AS admins,
      (SELECT count(*) FROM users WHERE status = 'SUSPENDED')::int                   AS suspended_users,
      (SELECT count(*) FROM users WHERE role = 'TUTOR' AND status = 'ACTIVE')::int   AS active_tutors,
      (SELECT count(*) FROM availability_slots
        WHERE status = 'AVAILABLE' AND lower(time_range) > now())::int               AS available_future_slots,
      count(a.id)::int                                                               AS total_bookings,
      (count(*) FILTER (WHERE a.status = 'CONFIRMED'))::int                          AS confirmed_sessions,
      (count(*) FILTER (WHERE a.status = 'COMPLETED'))::int                          AS completed_sessions,
      (count(*) FILTER (WHERE a.status = 'CANCELLED'))::int                          AS cancelled_sessions,
      (count(*) FILTER (WHERE a.is_late_cancellation))::int                          AS late_cancellations,
      COALESCE(round(count(*) FILTER (WHERE a.status = 'CANCELLED')::numeric
                     / NULLIF(count(a.id), 0), 3), 0)::float                         AS cancellation_rate
    FROM appointments a
  `);
  return rows[0];
}

module.exports = { cancelFutureAppointments, releaseSlots, blockFreeSlots, getMetrics };

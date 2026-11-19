// Each DB test file books with its own throwaway student. Sharing the seed student made
// files that run in parallel count each other's bookings against the 3-booking quota
// (BR-CONF-04) and fail at random.
const { randomUUID } = require('crypto');
const db = require('../../src/config/db');

async function createTestStudent(id = randomUUID()) {
  await db.query(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, 'not-a-real-hash', 'Test', 'Student', 'STUDENT')
  `, [id, `student-${id}@unimentor.test`]);
  return id;
}

async function removeTestStudent(id) {
  await db.query('DELETE FROM appointments WHERE student_id = $1 OR cancelled_by = $1', [id]);
  await db.query('DELETE FROM users WHERE id = $1', [id]);
}

module.exports = { createTestStudent, removeTestStudent };

// Same idea for tutors: tests that create slots relative to "now" collided with the
// seed slots of tutor b0000000-...-001 (tomorrow 10:00-12:00 UTC) depending on the time
// of day the suite ran. A throwaway tutor has no other slots.
async function createTestTutor(id = randomUUID()) {
  await db.query(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, 'not-a-real-hash', 'Test', 'Tutor', 'TUTOR')
  `, [id, `tutor-${id}@unimentor.test`]);
  return id;
}

// Appointments must go first: their composite FK to the slots is ON DELETE RESTRICT.
async function removeTestTutor(id) {
  await db.query('DELETE FROM appointments WHERE tutor_id = $1', [id]);
  await db.query('DELETE FROM availability_slots WHERE tutor_id = $1', [id]);
  await db.query('DELETE FROM users WHERE id = $1', [id]);
}

module.exports.createTestTutor = createTestTutor;
module.exports.removeTestTutor = removeTestTutor;

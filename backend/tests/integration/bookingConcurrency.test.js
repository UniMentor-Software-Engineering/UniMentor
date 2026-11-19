
const db = require('../../src/config/db');
const appointmentRepository = require('../../src/repositories/appointmentRepository');
const { randomUUID } = require('crypto');

const TUTOR_ID = 'b0000000-0000-0000-0000-000000000001';
const { createTestStudent, removeTestStudent } = require('../helpers/testStudent');

// Own student per file, see tests/helpers/testStudent.js
const STUDENT_ID = randomUUID();
beforeAll(() => createTestStudent(STUDENT_ID));

describe('Booking Concurrency Integration Tests', () => {
  let slotId;

  beforeAll(async () => {
    slotId = randomUUID();

    // Create a unique future slot for this test
    await db.query(`
      INSERT INTO availability_slots (
        id, tutor_id, time_range, status
      )
      VALUES (
        $1,
        $2,
        tstzrange(
          '2030-01-01 10:00:00+00',
          '2030-01-01 11:00:00+00',
          '[)'
        ),
        'AVAILABLE'
      )
    `, [slotId, TUTOR_ID]);
  });

  afterAll(async () => {
    // Remove the test appointment before deleting its slot
    if (slotId) {
      await db.query(
        'DELETE FROM appointments WHERE slot_id = $1',
        [slotId]
      );

      await db.query(
        'DELETE FROM availability_slots WHERE id = $1',
        [slotId]
      );
    }

    await removeTestStudent(STUDENT_ID);
    await db.pool.end();
  });

  it('should allow only one booking for concurrent requests', async () => {
    // Execute two booking attempts simultaneously
    const results = await Promise.allSettled([
      appointmentRepository.createBooking(slotId, STUDENT_ID),
      appointmentRepository.createBooking(slotId, STUDENT_ID)
    ]);

    // Only one booking should succeed
    const successful = results.filter(
      result => result.status === 'fulfilled'
    );

    const rejected = results.filter(
      result => result.status === 'rejected'
    );

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.statusCode).toBe(409);

    // Verify that exactly one appointment exists
    const { rows } = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM appointments
      WHERE slot_id = $1
      AND status = 'CONFIRMED'
    `, [slotId]);

    expect(rows[0].total).toBe(1);

    // Verify that the slot is marked as booked
    const slot = await db.query(
      'SELECT status FROM availability_slots WHERE id = $1',
      [slotId]
    );

    expect(slot.rows[0].status).toBe('BOOKED');
  });
});

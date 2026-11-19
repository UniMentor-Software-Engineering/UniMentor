
const db = require('../../src/config/db');
const appointmentRepository = require('../../src/repositories/appointmentRepository');
const { randomUUID } = require('crypto');

const TUTOR_ID = 'b0000000-0000-0000-0000-000000000001';
const { createTestStudent, removeTestStudent } = require('../helpers/testStudent');

// Own student per file, see tests/helpers/testStudent.js
const STUDENT_ID = randomUUID();
beforeAll(() => createTestStudent(STUDENT_ID));

describe('Appointment Cancellation Integration Tests', () => {
  const testSlots = [];
  let originalLateCount;

  // Create a confirmed appointment with a temporary slot
  async function createTestAppointment(hoursAhead) {
    const slotId = randomUUID();
    const startsAt = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    startsAt.setUTCMinutes(0, 0, 0);

    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    await db.query(`
      INSERT INTO availability_slots (id, tutor_id, time_range, status)
      VALUES ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'), 'AVAILABLE')
    `, [slotId, TUTOR_ID, startsAt, endsAt]);

    testSlots.push(slotId);

    return appointmentRepository.createBooking(slotId, STUDENT_ID);
  }

  beforeAll(async () => {
    const { rows } = await db.query(
      'SELECT late_cancellation_count FROM users WHERE id = $1',
      [STUDENT_ID]
    );

    originalLateCount = rows[0].late_cancellation_count;
  });

  afterAll(async () => {
    // Remove test appointments before deleting their slots
    for (const slotId of testSlots) {
      await db.query('DELETE FROM appointments WHERE slot_id = $1', [slotId]);
      await db.query('DELETE FROM availability_slots WHERE id = $1', [slotId]);
    }

    // Restore the original late cancellation count
    if (originalLateCount !== undefined) {
      await db.query(
        'UPDATE users SET late_cancellation_count = $1 WHERE id = $2',
        [originalLateCount, STUDENT_ID]
      );
    }

    await removeTestStudent(STUDENT_ID);
    await db.pool.end();
  });

  it('should release the slot for a cancellation made more than 4 hours before', async () => {
    const appointment = await createTestAppointment(48);

    const cancelled = await appointmentRepository.cancelAppointment(
      appointment.id,
      STUDENT_ID
    );

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.is_late_cancellation).toBe(false);
    expect(cancelled.cancelled_by).toBe(STUDENT_ID);

    const slot = await db.query(
      'SELECT status FROM availability_slots WHERE id = $1',
      [appointment.slot_id]
    );

    expect(slot.rows[0].status).toBe('AVAILABLE');
  });

  
it('should close the slot and flag a late cancellation', async () => {
  // Simulate an appointment booked previously, now starting in 1 hour
  const startTime = new Date(Date.now() + 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

  // Create an available slot using the existing test helper
  const appointment = await createTestAppointment(24);

  // Remove the appointment before updating its referenced slot
  await db.query(
    'DELETE FROM appointments WHERE id = $1',
    [appointment.id]
  );

  // Move the slot to the late cancellation window
  await db.query(`
    UPDATE availability_slots
    SET time_range = tstzrange($1::timestamptz, $2::timestamptz, '[)')
    WHERE id = $3
  `, [startTime, endTime, appointment.slot_id]);

  // Recreate the confirmed appointment with the updated time range
  await db.query(`
    INSERT INTO appointments (
      id, slot_id, tutor_id, student_id, time_range, status
    )
    VALUES (
      $1, $2, $3, $4,
      tstzrange($5::timestamptz, $6::timestamptz, '[)'),
      'CONFIRMED'
    )
  `, [
    appointment.id,
    appointment.slot_id,
    appointment.tutor_id,
    STUDENT_ID,
    startTime,
    endTime
  ]);

  // Cancel the appointment within the late cancellation window
  const cancelled = await appointmentRepository.cancelAppointment(
    appointment.id,
    STUDENT_ID
  );

  expect(cancelled.status).toBe('CANCELLED');
  expect(cancelled.is_late_cancellation).toBe(true);

  // Verify that the slot is unavailable after cancellation
  const slot = await db.query(
    'SELECT status FROM availability_slots WHERE id = $1',
    [appointment.slot_id]
  );

  expect(slot.rows[0].status).toBe('UNAVAILABLE');

  // Verify that the student's late cancellation counter increased
  const { rows } = await db.query(
    'SELECT late_cancellation_count FROM users WHERE id = $1',
    [STUDENT_ID]
  );

  expect(rows[0].late_cancellation_count).toBe(originalLateCount + 1);
});




    it('should reject cancellation by a non-participant', async () => {
        const appointment = await createTestAppointment(72);

        // Use a valid user ID that is not a participant
        const unauthorizedUserId = 'a0000000-0000-0000-0000-000000000001';

        await expect(
        appointmentRepository.cancelAppointment(
        appointment.id,
        unauthorizedUserId
        )
    ).rejects.toMatchObject({
    statusCode: 403,
    code: 'FORBIDDEN'
  });

  // Verify that the appointment remains confirmed
  const { rows } = await db.query(
    'SELECT status FROM appointments WHERE id = $1',
    [appointment.id]
  );

  expect(rows[0].status).toBe('CONFIRMED');
});


it('should reject cancelling an already cancelled appointment', async () => {
  const appointment = await createTestAppointment(96);

  // Cancel the appointment for the first time
  const firstCancellation = await appointmentRepository.cancelAppointment(
    appointment.id,
    STUDENT_ID
  );

  expect(firstCancellation.status).toBe('CANCELLED');

  // Attempt to cancel the same appointment again
  await expect(
    appointmentRepository.cancelAppointment(
      appointment.id,
      STUDENT_ID
    )
  ).rejects.toMatchObject({
    statusCode: 409,
    code: 'INVALID_STATUS'
  });

  // Verify that the appointment remains cancelled
  const { rows } = await db.query(
    'SELECT status FROM appointments WHERE id = $1',
    [appointment.id]
  );

  expect(rows[0].status).toBe('CANCELLED');
});

});

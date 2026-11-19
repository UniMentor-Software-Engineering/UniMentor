
const db = require('../../src/config/db');
const appointmentRepository = require('../../src/repositories/appointmentRepository');
const { randomUUID } = require('crypto');

const TUTOR_ID = 'b0000000-0000-0000-0000-000000000001';
const OTHER_TUTOR_ID = 'b0000000-0000-0000-0000-000000000002';
const { createTestStudent, removeTestStudent } = require('../helpers/testStudent');

// Own student per file, see tests/helpers/testStudent.js
const STUDENT_ID = randomUUID();
beforeAll(() => createTestStudent(STUDENT_ID));

describe('Availability Blocking Integration Tests (CU-05)', () => {
  const createdSlotIds = [];

  // Create a temporary available slot for testing
  async function createTestSlot() {
    const slotId = randomUUID();

    // Assign each test a separate time interval
    const slotNumber = createdSlotIds.length;
    const startTime = new Date(
    Date.UTC(2032, 5, 1 + slotNumber, 10, 0, 0)
    );
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    await db.query(`
      INSERT INTO availability_slots (id, tutor_id, time_range, status)
      VALUES (
        $1,
        $2,
        tstzrange($3::timestamptz, $4::timestamptz, '[)'),
        'AVAILABLE'
      )
    `, [slotId, TUTOR_ID, startTime, endTime]);

    createdSlotIds.push(slotId);
    return slotId;
  }

  afterAll(async () => {
    // Delete test appointments before their corresponding slots
    for (const slotId of createdSlotIds) {
      await db.query('DELETE FROM appointments WHERE slot_id = $1', [slotId]);
      await db.query('DELETE FROM availability_slots WHERE id = $1', [slotId]);
    }

    await removeTestStudent(STUDENT_ID);
    await db.pool.end();
  });

  it('should block an available slot owned by the tutor', async () => {
    const slotId = await createTestSlot();

    const result = await appointmentRepository.blockAvailabilitySlot(
      slotId,
      TUTOR_ID
    );

    expect(result.status).toBe('UNAVAILABLE');

    // Verify the slot status in PostgreSQL
    const { rows } = await db.query(
      'SELECT status FROM availability_slots WHERE id = $1',
      [slotId]
    );

    expect(rows[0].status).toBe('UNAVAILABLE');
  });

  it('should reject blocking a slot owned by another tutor', async () => {
    const slotId = await createTestSlot();

    await expect(
      appointmentRepository.blockAvailabilitySlot(slotId, OTHER_TUTOR_ID)
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN'
    });

    // Verify the slot remains available
    const { rows } = await db.query(
      'SELECT status FROM availability_slots WHERE id = $1',
      [slotId]
    );

    expect(rows[0].status).toBe('AVAILABLE');
  });

  it('should reject blocking an already booked slot', async () => {
    const slotId = await createTestSlot();

    // Create a confirmed appointment for this slot
    const appointment = await appointmentRepository.createBooking(
      slotId,
      STUDENT_ID
    );

    expect(appointment.status).toBe('CONFIRMED');

    await expect(
      appointmentRepository.blockAvailabilitySlot(slotId, TUTOR_ID)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'SLOT_ALREADY_BOOKED'
    });

    // Verify the slot remains booked
    const { rows } = await db.query(
      'SELECT status FROM availability_slots WHERE id = $1',
      [slotId]
    );

    expect(rows[0].status).toBe('BOOKED');
  });

  it('should reject blocking an already blocked slot', async () => {
    const slotId = await createTestSlot();

    await appointmentRepository.blockAvailabilitySlot(slotId, TUTOR_ID);

    await expect(
      appointmentRepository.blockAvailabilitySlot(slotId, TUTOR_ID)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_SLOT_STATUS'
    });
  });

it('should prevent booking and blocking the same slot simultaneously', async () => {
  const slotId = await createTestSlot();

  // Start booking and blocking operations concurrently
  const results = await Promise.allSettled([
    appointmentRepository.createBooking(slotId, STUDENT_ID),
    appointmentRepository.blockAvailabilitySlot(slotId, TUTOR_ID)
  ]);

  // Exactly one operation must succeed
  const successful = results.filter(
    result => result.status === 'fulfilled'
  );

  const rejected = results.filter(
    result => result.status === 'rejected'
  );

  expect(successful).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason.statusCode).toBe(409);

  // Verify the final slot status
  const { rows } = await db.query(
    'SELECT status FROM availability_slots WHERE id = $1',
    [slotId]
  );

  expect(['BOOKED', 'UNAVAILABLE']).toContain(rows[0].status);

  // Verify consistency between the slot and its appointments
  const appointments = await db.query(`
    SELECT COUNT(*)::int AS total
    FROM appointments
    WHERE slot_id = $1 AND status = 'CONFIRMED'
  `, [slotId]);

  if (rows[0].status === 'BOOKED') {
    expect(appointments.rows[0].total).toBe(1);
  } else {
    expect(appointments.rows[0].total).toBe(0);
  }
});

});

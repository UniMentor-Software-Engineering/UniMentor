
const { randomUUID } = require('crypto');
const db = require('../../src/config/db');
const appointmentRepository = require('../../src/repositories/appointmentRepository');

const TUTOR_ID = 'b0000000-0000-0000-0000-000000000001';
const STUDENT_ID = 'c0000000-0000-0000-0000-000000000001';

describe('Minimum Advance Booking Rule (BR-CONF-01)', () => {
  const createdSlotIds = [];

  // Create a temporary slot for testing
  async function createTestSlot(hoursFromNow) {
    const slotId = randomUUID();
    const startTime = new Date(
      Date.now() + hoursFromNow * 60 * 60 * 1000
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
    // Clean up test appointments and slots
    for (const slotId of createdSlotIds) {
      await db.query(
        'DELETE FROM appointments WHERE slot_id = $1',
        [slotId]
      );
      await db.query(
        'DELETE FROM availability_slots WHERE id = $1',
        [slotId]
      );
    }

    await db.pool.end();
  });

  it('should reject booking less than 2 hours in advance', async () => {
    const slotId = await createTestSlot(1);

    await expect(
      appointmentRepository.createBooking(slotId, STUDENT_ID)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'BOOKING_TOO_LATE'
    });

    // Verify the slot remains available
    const { rows } = await db.query(
      'SELECT status FROM availability_slots WHERE id = $1',
      [slotId]
    );

    expect(rows[0].status).toBe('AVAILABLE');
  });

  it('should allow booking more than 2 hours in advance', async () => {
    const slotId = await createTestSlot(5);

    const appointment = await appointmentRepository.createBooking(
      slotId,
      STUDENT_ID
    );

    expect(appointment.status).toBe('CONFIRMED');

    // Verify the slot was booked
    const { rows } = await db.query(
      'SELECT status FROM availability_slots WHERE id = $1',
      [slotId]
    );

    expect(rows[0].status).toBe('BOOKED');
  });
});

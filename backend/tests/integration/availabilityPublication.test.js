
const { randomUUID } = require('crypto');
const db = require('../../src/config/db');
const bookingService = require('../../src/services/bookingService');

const TUTOR_ID = 'b0000000-0000-0000-0000-000000000001';
const { createTestStudent, removeTestStudent } = require('../helpers/testStudent');

// Own student per file, see tests/helpers/testStudent.js
const STUDENT_ID = randomUUID();
beforeAll(() => createTestStudent(STUDENT_ID));

describe('Availability Publication Integration Tests (CU-04)', () => {
  const createdSlotIds = [];

  // Generate a unique, future interval for each test
  function futureInterval(daysAhead) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + daysAhead);
    start.setUTCHours(10, 0, 0, 0);

    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

    return {
      startTime: start.toISOString(),
      endTime: end.toISOString()
    };
  }

  // Track inserted slots so they can be removed after testing
  async function trackSlots(result) {
    for (const slot of result.published) {
      createdSlotIds.push(slot.id);
    }
  }

  afterAll(async () => {
    // Remove only the slots created by these tests
    for (const slotId of createdSlotIds) {
      await db.query(
        'DELETE FROM availability_slots WHERE id = $1',
        [slotId]
      );
    }

    await removeTestStudent(STUDENT_ID);
    await db.pool.end();
  });

  it('should publish three consecutive 60-minute slots', async () => {
    const interval = futureInterval(60);

    const result = await bookingService.publishAvailability(
      TUTOR_ID,
      interval.startTime,
      interval.endTime
    );

    await trackSlots(result);

    expect(result.published).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);

    for (const slot of result.published) {
      expect(slot.status).toBe('AVAILABLE');
    }

    // Verify that the inserted slots last exactly 60 minutes
    const { rows } = await db.query(`
      SELECT
        EXTRACT(EPOCH FROM (upper(time_range) - lower(time_range))) AS seconds
      FROM availability_slots
      WHERE id = ANY($1::uuid[])
    `, [result.published.map(slot => slot.id)]);

    expect(rows).toHaveLength(3);

    for (const row of rows) {
      expect(Number(row.seconds)).toBe(3600);
    }
  });

  it('should skip overlapping slots and publish the remaining ones', async () => {
    const interval = futureInterval(90);

    // Publish the first hour
    const firstHourEnd = new Date(
      new Date(interval.startTime).getTime() + 60 * 60 * 1000
    ).toISOString();

    const first = await bookingService.publishAvailability(
      TUTOR_ID,
      interval.startTime,
      firstHourEnd
    );

    await trackSlots(first);

    // Attempt to publish the entire three-hour interval
    const result = await bookingService.publishAvailability(
      TUTOR_ID,
      interval.startTime,
      interval.endTime
    );

    await trackSlots(result);

    expect(first.published).toHaveLength(1);
    expect(result.published).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('OVERLAPPING_SLOT');
  });

  it('should reject slots in the past', async () => {
    const start = new Date('2020-01-01T10:00:00Z');
    const end = new Date('2020-01-01T12:00:00Z');

    const result = await bookingService.publishAvailability(
      TUTOR_ID,
      start.toISOString(),
      end.toISOString()
    );

    expect(result.published).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);

    for (const slot of result.skipped) {
      expect(slot.reason).toBe('PAST_SLOT');
    }
  });

  it('should reject a tutor without an active profile and linked subjects', async () => {
    await expect(
      bookingService.publishAvailability(
        STUDENT_ID,
        '2030-02-01T10:00:00Z',
        '2030-02-01T11:00:00Z'
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'TUTOR_NOT_ELIGIBLE'
    });
  });

it('should reject publishing a slot that overlaps an existing appointment', async () => {
  const appointmentResult = await db.query(`
    SELECT
      a.id,
      a.tutor_id,
      lower(a.time_range) AS start_time,
      upper(a.time_range) AS end_time
    FROM appointments a
    WHERE a.status = 'CONFIRMED'
    ORDER BY a.created_at DESC
    LIMIT 1
  `);

  expect(appointmentResult.rows).toHaveLength(1);

  const appointment = appointmentResult.rows[0];

  // Attempt to publish availability during an already booked session
  const result = await bookingService.publishAvailability(
    appointment.tutor_id,
    appointment.start_time.toISOString(),
    appointment.end_time.toISOString()
  );

  expect(result.published).toHaveLength(0);
  expect(result.skipped).toHaveLength(1);

  // A past appointment may also be rejected as PAST_SLOT
  expect([
    'OVERLAPPING_SLOT',
    'PAST_SLOT'
  ]).toContain(result.skipped[0].reason);
});

it('should reject availability overlapping a future confirmed appointment', async () => {
  const interval = futureInterval(120);

  const firstHourEnd = new Date(
    new Date(interval.startTime).getTime() + 60 * 60 * 1000
  ).toISOString();

  // Publish a future availability slot
  const first = await bookingService.publishAvailability(
    TUTOR_ID,
    interval.startTime,
    firstHourEnd
  );

  await trackSlots(first);
  expect(first.published).toHaveLength(1);

  const slotId = first.published[0].id;
  const appointmentRepository = require('../../src/repositories/appointmentRepository');

  // Book the slot to create a confirmed appointment
  const appointment = await appointmentRepository.createBooking(
    slotId,
    STUDENT_ID
  );

  expect(appointment.status).toBe('CONFIRMED');

  // Attempt to publish the same interval again
  const result = await bookingService.publishAvailability(
    TUTOR_ID,
    interval.startTime,
    firstHourEnd
  );

  expect(result.published).toHaveLength(0);
  expect(result.skipped).toHaveLength(1);
  expect(result.skipped[0].reason).toBe('OVERLAPPING_SLOT');

  // Remove the temporary appointment before slot cleanup
  await db.query(
    'DELETE FROM appointments WHERE id = $1',
    [appointment.id]
  );
});

});

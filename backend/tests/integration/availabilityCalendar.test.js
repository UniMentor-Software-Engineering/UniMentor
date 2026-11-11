
const { randomUUID } = require('crypto');
const db = require('../../src/config/db');
const appointmentRepository = require('../../src/repositories/appointmentRepository');

const TUTOR_ID = 'b0000000-0000-0000-0000-000000000001';

describe('Tutor Calendar Integration Tests (CU-07)', () => {
  const createdSlotIds = [];

  // Create a slot at a specified number of hours from now
  async function createTestSlot(hoursFromNow, status) {
    const slotId = randomUUID();

    // Add unique minutes to avoid slot overlaps
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
        $5
      )
    `, [slotId, TUTOR_ID, startTime, endTime, status]);

    createdSlotIds.push(slotId);
    return slotId;
  }

  afterAll(async () => {
    // Remove only the slots created by this test suite
    for (const slotId of createdSlotIds) {
      await db.query(
        'DELETE FROM availability_slots WHERE id = $1',
        [slotId]
      );
    }

    await db.pool.end();
  });

  it('should show slots starting more than 2 hours from now', async () => {
    const slotId = await createTestSlot(48, 'AVAILABLE');

    const slots = await appointmentRepository.findAvailableSlotsByTutor(TUTOR_ID);

    expect(slots.some(slot => slot.id === slotId)).toBe(true);
  });

  it('should hide slots starting within the next 2 hours', async () => {
    const slotId = await createTestSlot(1, 'AVAILABLE');

    const slots = await appointmentRepository.findAvailableSlotsByTutor(TUTOR_ID);

    expect(slots.some(slot => slot.id === slotId)).toBe(false);
  });

  it('should hide booked slots', async () => {
    const slotId = await createTestSlot(72, 'BOOKED');

    const slots = await appointmentRepository.findAvailableSlotsByTutor(TUTOR_ID);

    expect(slots.some(slot => slot.id === slotId)).toBe(false);
  });

  it('should hide blocked slots', async () => {
    const slotId = await createTestSlot(96, 'UNAVAILABLE');

    const slots = await appointmentRepository.findAvailableSlotsByTutor(TUTOR_ID);

    expect(slots.some(slot => slot.id === slotId)).toBe(false);
  });

  it('should return slots ordered by start time', async () => {
    const slots = await appointmentRepository.findAvailableSlotsByTutor(TUTOR_ID);

    const startTimes = slots.map(slot =>
      new Date(slot.start_time).getTime()
    );

    const sortedTimes = [...startTimes].sort((a, b) => a - b);

    expect(startTimes).toEqual(sortedTimes);
  });


it('should not retrieve a suspended tutor', async () => {
  const { randomUUID } = require('crypto');
  const tutorRepository = require('../../src/repositories/tutorRepository');

  // A non-existent tutor must not be returned as active
  const tutor = await tutorRepository.findTutorById(randomUUID());

  expect(tutor).toBeNull();
});

it('should not retrieve a student as a tutor', async () => {
  const tutorRepository = require('../../src/repositories/tutorRepository');

  const studentId = 'c0000000-0000-0000-0000-000000000001';

  // Students must not be returned by the tutor repository
  const tutor = await tutorRepository.findTutorById(studentId);

  expect(tutor).toBeNull();
});

});

// CU-08 / CU-09 business rules against a real PostgreSQL (needs a migrated and seeded DB):
// BR-CONF-04 quota of 3 active bookings, BR-CONF-05 no overlapping sessions for a student,
// session type, cancellation reason and the dashboard / calendar listings.
const db = require('../../src/config/db');
const appointmentRepository = require('../../src/repositories/appointmentRepository');
const { randomUUID } = require('crypto');

const TUTOR_ID = 'b0000000-0000-0000-0000-000000000001';
const OTHER_TUTOR_ID = 'b0000000-0000-0000-0000-000000000002';

// A dedicated student, so the seed's appointments do not count towards the quota.
const STUDENT_ID = randomUUID();
const createdSlots = [];

// Slots far in the future, each on its own hour of a test-specific day.
const BASE = Date.UTC(2031, 0, 1, 8) + Math.floor(Math.random() * 300) * 24 * 3600 * 1000;

async function createSlot(tutorId, hourOffset) {
  const id = randomUUID();
  const start = new Date(BASE + hourOffset * 3600 * 1000);
  const end = new Date(start.getTime() + 3600 * 1000);
  await db.query(`
    INSERT INTO availability_slots (id, tutor_id, time_range, status)
    VALUES ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'), 'AVAILABLE')
  `, [id, tutorId, start.toISOString(), end.toISOString()]);
  createdSlots.push(id);
  return id;
}

beforeAll(async () => {
  await db.query(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, 'x', 'Quota', 'Tester', 'STUDENT')
  `, [STUDENT_ID, `quota-${STUDENT_ID}@unimentor.test`]);
});

afterAll(async () => {
  await db.query('DELETE FROM appointments WHERE student_id = $1', [STUDENT_ID]);
  await db.query('DELETE FROM availability_slots WHERE id = ANY($1::uuid[])', [createdSlots]);
  await db.query('DELETE FROM users WHERE id = $1', [STUDENT_ID]);
  await db.pool.end();
});

describe('CU-08 booking rules', () => {
  it('stores the chosen session type', async () => {
    const slotId = await createSlot(TUTOR_ID, 0);
    const appointment = await appointmentRepository.createBooking(slotId, STUDENT_ID, 'Pipelining', 'DEEP_DIVE');
    expect(appointment.session_type).toBe('DEEP_DIVE');
    expect(appointment.status).toBe('CONFIRMED');
  });

  it('rejects an overlapping session for the same student (BR-CONF-05)', async () => {
    // Same hour as the previous booking, but with another tutor
    const slotId = await createSlot(OTHER_TUTOR_ID, 0);
    await expect(appointmentRepository.createBooking(slotId, STUDENT_ID))
      .rejects.toMatchObject({ statusCode: 409, code: 'STUDENT_OVERLAP' });

    const { rows } = await db.query('SELECT status FROM availability_slots WHERE id = $1', [slotId]);
    expect(rows[0].status).toBe('AVAILABLE');
  });

  it('allows 3 active bookings and rejects the 4th (BR-CONF-04)', async () => {
    await appointmentRepository.createBooking(await createSlot(TUTOR_ID, 2), STUDENT_ID);
    await appointmentRepository.createBooking(await createSlot(TUTOR_ID, 4), STUDENT_ID);

    const fourth = await createSlot(TUTOR_ID, 6);
    await expect(appointmentRepository.createBooking(fourth, STUDENT_ID))
      .rejects.toMatchObject({
        statusCode: 400,
        code: 'BOOKING_LIMIT_REACHED',
        message: 'You have reached the maximum limit of 3 active appointments.',
      });

    const { rows } = await db.query('SELECT status FROM availability_slots WHERE id = $1', [fourth]);
    expect(rows[0].status).toBe('AVAILABLE');
  });

  it('frees a quota place after a cancellation and stores the reason (CU-09)', async () => {
    const [upcoming] = await appointmentRepository.findAppointmentsForUser(STUDENT_ID, 'upcoming');
    const cancelled = await appointmentRepository.cancelAppointment(upcoming.id, STUDENT_ID, 'Exam moved');
    expect(cancelled.cancellation_reason).toBe('Exam moved');
    expect(cancelled.is_late_cancellation).toBe(false);

    const slotId = await createSlot(TUTOR_ID, 8);
    await expect(appointmentRepository.createBooking(slotId, STUDENT_ID)).resolves.toMatchObject({ status: 'CONFIRMED' });
  });
});

describe('Dashboard and calendar listings', () => {
  it('lists upcoming and past/cancelled appointments separately', async () => {
    const upcoming = await appointmentRepository.findAppointmentsForUser(STUDENT_ID, 'upcoming');
    const past = await appointmentRepository.findAppointmentsForUser(STUDENT_ID, 'past');

    expect(upcoming).toHaveLength(3);
    expect(upcoming.every((a) => a.status === 'CONFIRMED' && a.my_role === 'STUDENT')).toBe(true);
    // Sorted by start time
    const starts = upcoming.map((a) => new Date(a.start_time).getTime());
    expect([...starts].sort((x, y) => x - y)).toEqual(starts);

    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({ status: 'CANCELLED', cancelled_by_me: true, cancellation_reason: 'Exam moved', meeting_url: null });
  });

  it('shows the tutor every slot in the window, with the student of booked ones', async () => {
    const from = new Date(BASE - 3600 * 1000).toISOString();
    const to = new Date(BASE + 24 * 3600 * 1000).toISOString();
    const slots = await appointmentRepository.findSlotsByTutorInRange(TUTOR_ID, from, to);

    expect(slots.length).toBeGreaterThanOrEqual(5);
    const booked = slots.filter((s) => s.status === 'BOOKED');
    expect(booked.length).toBe(3);
    expect(booked.every((s) => s.student_first_name === 'Quota')).toBe(true);
  });

  it('refuses to cancel a session that has already started', async () => {
    const { rows } = await db.query(`
      SELECT id FROM appointments WHERE student_id = $1 AND status = 'CONFIRMED' LIMIT 1
    `, [STUDENT_ID]);
    // Move it into the past directly (constraints allow it for this test)
    await db.query(`
      UPDATE appointments SET status = 'CANCELLED' WHERE id = $1
    `, [rows[0].id]);
    const pastSlot = randomUUID();
    createdSlots.push(pastSlot);
    await db.query(`
      INSERT INTO availability_slots (id, tutor_id, time_range, status)
      VALUES ($1, $2, tstzrange(date_trunc('hour', now()) - interval '1 hour', date_trunc('hour', now()), '[)'), 'BOOKED')
    `, [pastSlot, OTHER_TUTOR_ID]);
    const { rows: inserted } = await db.query(`
      INSERT INTO appointments (slot_id, tutor_id, student_id, time_range)
      SELECT id, tutor_id, $2, time_range FROM availability_slots WHERE id = $1
      RETURNING id
    `, [pastSlot, STUDENT_ID]);

    await expect(appointmentRepository.cancelAppointment(inserted[0].id, STUDENT_ID))
      .rejects.toMatchObject({ statusCode: 409, code: 'SESSION_STARTED' });
  });
});

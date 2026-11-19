// P5 against a real PostgreSQL (needs a migrated and seeded DB):
// CU-10 reminder queue, CU-11 automatic completion and dashboard, CU-12 notes and rating.
// Uses its own tutor and student, and creates appointments directly in the past or the
// future (the booking rules are tested elsewhere).
const db = require('../../src/config/db');
const appointmentRepository = require('../../src/repositories/appointmentRepository');
const bookingService = require('../../src/services/bookingService');
const { runReminderCycle } = require('../../src/jobs/reminderScheduler');
const NotificationService = require('../../src/notifications/NotificationService');
const ConsoleProvider = require('../../src/notifications/providers/ConsoleProvider');
const {
  createTestStudent, removeTestStudent, createTestTutor, removeTestTutor,
} = require('../helpers/testStudent');
const { randomUUID } = require('crypto');

const STUDENT_ID = randomUUID();
const TUTOR_ID = randomUUID();
const OTHER_STUDENT_ID = randomUUID();
const silentLogger = { log: () => {}, error: () => {} };

// Creates a slot + appointment that starts `hoursFromNow` hours from now (can be negative).
async function createAppointment(hoursFromNow, { status = 'CONFIRMED', reminderSent = false } = {}) {
  const slotId = randomUUID();
  const id = randomUUID();
  const start = new Date(Date.now() + hoursFromNow * 3600 * 1000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 3600 * 1000);
  await db.query(`
    INSERT INTO availability_slots (id, tutor_id, time_range, status)
    VALUES ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'), 'BOOKED')
  `, [slotId, TUTOR_ID, start.toISOString(), end.toISOString()]);
  await db.query(`
    INSERT INTO appointments (id, slot_id, tutor_id, student_id, time_range, status, reminder_sent)
    VALUES ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'), $7, $8)
  `, [id, slotId, TUTOR_ID, STUDENT_ID, start.toISOString(), end.toISOString(), status, reminderSent]);
  return id;
}

async function statusOf(id) {
  const { rows } = await db.query('SELECT status, reminder_sent FROM appointments WHERE id = $1', [id]);
  return rows[0];
}

beforeAll(async () => {
  await createTestStudent(STUDENT_ID);
  await createTestStudent(OTHER_STUDENT_ID);
  await createTestTutor(TUTOR_ID);
});

afterAll(async () => {
  await removeTestTutor(TUTOR_ID);
  await removeTestStudent(STUDENT_ID);
  await removeTestStudent(OTHER_STUDENT_ID);
  await db.pool.end();
});

describe('CU-10 reminders', () => {
  it('queues only confirmed sessions starting within 24 hours without a reminder', async () => {
    const inWindow = await createAppointment(5);
    const tooFar = await createAppointment(30);
    const alreadySent = await createAppointment(7, { reminderSent: true });

    const pendingIds = (await appointmentRepository.findPendingReminders(1000)).map((a) => a.id);
    expect(pendingIds).toContain(inWindow);
    expect(pendingIds).not.toContain(tooFar);
    expect(pendingIds).not.toContain(alreadySent);

    const [details] = await appointmentRepository.findAppointmentDetails([inWindow]);
    expect(details.student.email).toBe(`student-${STUDENT_ID}@unimentor.test`);
    expect(details.tutor.email).toBe(`tutor-${TUTOR_ID}@unimentor.test`);
  });

  it('sends each reminder once and flags it (steps 3-4)', async () => {
    const id = await createAppointment(10);
    const provider = new ConsoleProvider({ silent: true });
    const notifier = new NotificationService(provider);

    await runReminderCycle({ notifier, logger: silentLogger });
    const toOurUsers = provider.sent.filter((m) => m.to.endsWith(`${STUDENT_ID}@unimentor.test`));
    expect(toOurUsers.length).toBeGreaterThanOrEqual(1);
    expect((await statusOf(id)).reminder_sent).toBe(true);

    // Second cycle: nothing new for this appointment
    provider.sent.length = 0;
    await runReminderCycle({ notifier, logger: silentLogger });
    expect(provider.sent.filter((m) => m.subject.includes('Reminder') && m.to.includes(STUDENT_ID))).toHaveLength(0);
  });

  it('A1: keeps the appointment queued when the provider fails', async () => {
    const id = await createAppointment(12);
    const failing = new NotificationService({ send: async () => { throw new Error('SendGrid down'); } });
    await runReminderCycle({ notifier: failing, logger: silentLogger });
    expect((await statusOf(id)).reminder_sent).toBe(false);
  });
});

describe('CU-11 dashboard', () => {
  it('moves ended confirmed sessions to COMPLETED and into the history', async () => {
    const ended = await createAppointment(-3);
    const upcoming = await createAppointment(40);

    const { upcoming: up, history } = await bookingService.listMyAppointments(STUDENT_ID);
    expect((await statusOf(ended)).status).toBe('COMPLETED');
    expect(up.map((a) => a.id)).toContain(upcoming);
    expect(up.map((a) => a.id)).not.toContain(ended);
    const past = history.find((a) => a.id === ended);
    expect(past).toMatchObject({ status: 'COMPLETED', can_review: true, meeting_url: null });
  });
});

describe('CU-12 notes and rating', () => {
  let finished;
  let future;

  beforeAll(async () => {
    finished = await createAppointment(-5);
    future = await createAppointment(50);
  });

  it('A1: rejects notes and ratings before the session has ended', async () => {
    const expected = { statusCode: 409, code: 'SESSION_NOT_COMPLETED', message: 'Ratings and notes are accessible only after session completion.' };
    await expect(bookingService.saveTutorNotes(TUTOR_ID, future, 'Topics')).rejects.toMatchObject(expected);
    await expect(bookingService.submitReview(STUDENT_ID, future, 5)).rejects.toMatchObject(expected);
  });

  it('lets the tutor save and edit notes on a finished session', async () => {
    await bookingService.saveTutorNotes(TUTOR_ID, finished, 'Pipelining hazards');
    const saved = await bookingService.saveTutorNotes(TUTOR_ID, finished, 'Hazards; read chapter 4');
    expect(saved).toMatchObject({ tutor_notes: 'Hazards; read chapter 4', status: 'COMPLETED' });
  });

  it('lets the student rate once (BR: one rating per session)', async () => {
    const saved = await bookingService.submitReview(STUDENT_ID, finished, 4, 'Very clear');
    expect(saved).toMatchObject({ student_rating: 4, student_feedback: 'Very clear' });
    await expect(bookingService.submitReview(STUDENT_ID, finished, 5))
      .rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_RATED' });
  });

  it('only participants can write: another student gets 403', async () => {
    await expect(bookingService.submitReview(OTHER_STUDENT_ID, finished, 1))
      .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('cancelled sessions cannot be reviewed', async () => {
    const cancelled = await createAppointment(-8, { status: 'CANCELLED' });
    await expect(bookingService.submitReview(STUDENT_ID, cancelled, 3))
      .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATUS' });
  });

  it('the notes and rating appear in both dashboards', async () => {
    const studentView = (await bookingService.listMyAppointments(STUDENT_ID, 'past')).find((a) => a.id === finished);
    const tutorView = (await bookingService.listMyAppointments(TUTOR_ID, 'past')).find((a) => a.id === finished);
    for (const view of [studentView, tutorView]) {
      expect(view).toMatchObject({ tutor_notes: 'Hazards; read chapter 4', student_rating: 4, student_feedback: 'Very clear' });
    }
    expect(tutorView.my_role).toBe('TUTOR');
  });
});

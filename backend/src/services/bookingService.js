
const appointmentRepository = require('../repositories/appointmentRepository');
const AppError = require('../utils/AppError');
const { isUuid } = require('../utils/validators');
const tutorRepository = require('../repositories/tutorRepository');
const notifications = require('../notifications');

// Sends an email about one appointment after the COMMIT, in the background (section 4.3.3):
// the response does not wait for the provider, and a failure is only logged.
function notifyAbout(label, appointmentId, send) {
  return notifications.notifyInBackground(label, async () => {
    const rows = await appointmentRepository.findAppointmentDetails([appointmentId]);
    const details = rows && rows[0];
    if (details) await send(details);
  });
}

// CU-08 step 2: session types the student can choose (migration 003)
const SESSION_TYPES = ['QUICK_CHECK', 'STANDARD', 'DEEP_DIVE'];

// Create a new appointment for a student
async function createBooking(studentId, slotId, studentInquiry = null, sessionType = 'STANDARD') {

  // Validate the student and slot IDs
  if (!isUuid(studentId) || !isUuid(slotId)) {
    throw new AppError(400, 'Invalid student or slot ID', 'INVALID_ID');
  }

  // An empty inquiry is stored as NULL
  if (typeof studentInquiry === 'string') {
    studentInquiry = studentInquiry.trim() || null;
  }

  // Validate the student inquiry
  if (
    studentInquiry !== null && studentInquiry !== undefined &&
    (typeof studentInquiry !== 'string' || studentInquiry.length > 1000)
  ) {
    throw new AppError(400, 'Invalid student inquiry', 'INVALID_INQUIRY');
  }

  // Validate the session type
  if (sessionType === undefined || sessionType === null) {
    sessionType = 'STANDARD';
  }
  if (!SESSION_TYPES.includes(sessionType)) {
    throw new AppError(400, 'Invalid session type', 'INVALID_SESSION_TYPE');
  }

  // Check whether the slot exists
  const slot = await appointmentRepository.findSlotById(slotId);

  if (!slot) {
    throw new AppError(404, 'Slot not found', 'SLOT_NOT_FOUND');
  }

  // Check whether the slot is available
  if (slot.status !== 'AVAILABLE') {
    throw new AppError(409, 'This time slot has just been reserved by another student.', 'SLOT_UNAVAILABLE');
  }

  // Create the booking through the repository
  // (it re-checks the slot, the 2-hour notice and the 3-booking quota under lock)
  const appointment = await appointmentRepository.createBooking(
    slotId,
    studentId,
    studentInquiry || null,
    sessionType
  );

  // CU-08 step 8: confirmation emails with the meeting link, after the COMMIT
  notifyAbout('booking confirmation', appointment.id,
    (details) => notifications.sendBookingConfirmation(details));

  return appointment;
}


 // CU-09: Cancel a confirmed tutoring appointment
async function cancelAppointment(userId, appointmentId, reason = null) {

  // Validate the appointment ID
  if (!isUuid(appointmentId)) {
    throw new AppError(400, 'Invalid appointment ID', 'INVALID_ID');
  }

  // Validate the authenticated user ID
  if (!isUuid(userId)) {
    throw new AppError(400, 'Invalid user ID', 'INVALID_ID');
  }

  // CU-09 step 3: optional cancellation reason (VARCHAR(500), migration 005)
  if (reason !== null && reason !== undefined && typeof reason !== 'string') {
    throw new AppError(400, 'Invalid cancellation reason', 'INVALID_REASON');
  }
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (cleanReason.length > 500) {
    throw new AppError(400, 'The cancellation reason must be 500 characters or fewer', 'INVALID_REASON');
  }

  // Delegate the cancellation to the repository
  // The repository checks authorization, status and cancellation timing
  const appointment = await appointmentRepository.cancelAppointment(
    appointmentId,
    userId,
    cleanReason || null
  );

  // CU-09 step 6: cancellation notices to both users, after the COMMIT
  notifyAbout('cancellation notice', appointment.id,
    (details) => notifications.sendCancellationNotice(details));

  return appointment;
}


 // CU-11: the signed-in user's appointments for the dashboard.
// Without a scope it returns both lists, { upcoming, history } (CU-11 step 3);
// with scope=upcoming|past it returns just that list.
async function listMyAppointments(userId, scope) {
  if (!isUuid(userId)) {
    throw new AppError(400, 'Invalid user ID', 'INVALID_ID');
  }
  if (scope !== undefined && !['upcoming', 'past'].includes(scope)) {
    throw new AppError(400, 'scope must be "upcoming" or "past"', 'INVALID_SCOPE');
  }

  // CU-11 business rule: sessions that have ended move to the history as COMPLETED.
  // The scheduler does it every 10 minutes; doing it here too keeps the dashboard right
  // when the scheduler has not run (e.g. the free Render instance was asleep).
  await appointmentRepository.completeFinishedAppointments();

  if (scope) {
    return await appointmentRepository.findAppointmentsForUser(userId, scope);
  }
  const [upcoming, history] = await Promise.all([
    appointmentRepository.findAppointmentsForUser(userId, 'upcoming'),
    appointmentRepository.findAppointmentsForUser(userId, 'past'),
  ]);
  return { upcoming, history };
}


 // CU-12 step 2: the tutor's notes on a completed session
const MAX_NOTES = 2000;

async function saveTutorNotes(tutorId, appointmentId, notes) {
  if (!isUuid(tutorId) || !isUuid(appointmentId)) {
    throw new AppError(400, 'Invalid appointment ID', 'INVALID_ID');
  }
  if (typeof notes !== 'string') {
    throw new AppError(400, 'Notes must be text', 'INVALID_NOTES');
  }
  const clean = notes.trim();
  if (clean.length > MAX_NOTES) {
    throw new AppError(400, `Notes must be ${MAX_NOTES} characters or fewer`, 'INVALID_NOTES');
  }
  return await appointmentRepository.saveTutorNotes(appointmentId, tutorId, clean || null);
}


 // CU-12 step 3: the student's rating (1-5 stars, once) and optional feedback
const MAX_FEEDBACK = 1000;

async function submitReview(studentId, appointmentId, rating, feedback) {
  if (!isUuid(studentId) || !isUuid(appointmentId)) {
    throw new AppError(400, 'Invalid appointment ID', 'INVALID_ID');
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError(400, 'The rating must be a whole number from 1 to 5', 'INVALID_RATING');
  }
  if (feedback !== undefined && feedback !== null && typeof feedback !== 'string') {
    throw new AppError(400, 'Feedback must be text', 'INVALID_FEEDBACK');
  }
  const clean = typeof feedback === 'string' ? feedback.trim() : '';
  if (clean.length > MAX_FEEDBACK) {
    throw new AppError(400, `Feedback must be ${MAX_FEEDBACK} characters or fewer`, 'INVALID_FEEDBACK');
  }
  return await appointmentRepository.submitStudentReview(appointmentId, studentId, rating, clean || null);
}


 // CU-04 / CU-05: a tutor's own slots for the availability calendar (max. 31 days per request)
const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

async function listMySlots(tutorId, from, to) {
  if (!isUuid(tutorId)) {
    throw new AppError(400, 'Invalid tutor ID', 'INVALID_ID');
  }
  const start = new Date(from);
  const end = new Date(to);
  if (
    typeof from !== 'string' || typeof to !== 'string' ||
    Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
    start >= end || end.getTime() - start.getTime() > MAX_RANGE_MS
  ) {
    throw new AppError(400, 'from and to must be valid dates, at most 31 days apart', 'INVALID_INTERVAL');
  }
  return await appointmentRepository.findSlotsByTutorInRange(
    tutorId,
    start.toISOString(),
    end.toISOString()
  );
}


 // CU-04: Split a time interval into 60-minute slots
function splitIntoHourlySlots(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  // Validate the dates
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  ) {
    throw new AppError(400, 'Invalid time interval', 'INVALID_INTERVAL');
  }

  // Ensure the interval contains complete 60-minute blocks
  const duration = end.getTime() - start.getTime();
  const oneHour = 60 * 60 * 1000;

  if (duration % oneHour !== 0) {
    throw new AppError(
      400,
      'Time interval must contain complete 60-minute blocks',
      'INVALID_DURATION'
    );
  }

  const slots = [];

  // Generate consecutive 60-minute slots
  for (let current = start.getTime(); current < end.getTime(); current += oneHour) {
    slots.push({
      startTime: new Date(current).toISOString(),
      endTime: new Date(current + oneHour).toISOString()
    });
  }

  return slots;
}


 // CU-04: Publish availability slots for an authenticated tutor
async function publishAvailability(tutorId, startTime, endTime) {

  // Validate the tutor ID
  if (!isUuid(tutorId)) {
    throw new AppError(400, 'Invalid tutor ID', 'INVALID_ID');
  }

  // Check whether the tutor has an active profile and linked subjects
  const canPublish = await appointmentRepository.canTutorPublishSlots(tutorId);

  if (!canPublish) {
    throw new AppError(
      403,
      'Tutor must have an active profile and at least one subject',
      'TUTOR_NOT_ELIGIBLE'
    );
  }

  // Divide the selected interval into 60-minute slots
  const slots = splitIntoHourlySlots(startTime, endTime);

  // Publish valid slots and skip overlapping or past slots
  return await appointmentRepository.publishAvailabilitySlots(
    tutorId,
    slots
  );
}


 // CU-05: Block an availability slot owned by a tutor
async function blockAvailabilitySlot(tutorId, slotId) {

  // Validate the tutor ID
  if (!isUuid(tutorId)) {
    throw new AppError(400, 'Invalid tutor ID', 'INVALID_ID');
  }

  // Validate the slot ID
  if (!isUuid(slotId)) {
    throw new AppError(400, 'Invalid slot ID', 'INVALID_ID');
  }

  // Block the slot through the repository
  return await appointmentRepository.blockAvailabilitySlot(
    slotId,
    tutorId
  );
}


 // CU-07: Retrieve the available slots of an active tutor
async function getTutorAvailability(tutorId) {

  // Validate the tutor ID
  if (!isUuid(tutorId)) {
    throw new AppError(400, 'Invalid tutor ID', 'INVALID_ID');
  }

  // Verify that the tutor exists and is active
  const tutor = await tutorRepository.findTutorById(tutorId);

  if (!tutor) {
    throw new AppError(404, 'Tutor not found', 'TUTOR_NOT_FOUND');
  }

  // Retrieve available slots with more than 2 hours advance notice
  return await appointmentRepository.findAvailableSlotsByTutor(tutorId);
}

module.exports = {
  createBooking,
  cancelAppointment,
  splitIntoHourlySlots,
  publishAvailability,
  blockAvailabilitySlot,
  getTutorAvailability,
  listMyAppointments,
  listMySlots,
  saveTutorNotes,
  submitReview,
  SESSION_TYPES
};

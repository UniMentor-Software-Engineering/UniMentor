
const appointmentRepository = require('../repositories/appointmentRepository');
const AppError = require('../utils/AppError');
const { isUuid } = require('../utils/validators');

// Create a new appointment for a student
async function createBooking(studentId, slotId, studentInquiry = null) {

  // Validate the student and slot IDs
  if (!isUuid(studentId) || !isUuid(slotId)) {
    throw new AppError(400, 'Invalid student or slot ID', 'INVALID_ID');
  }

  // Validate the student inquiry
  if (
    studentInquiry !== null &&
    (typeof studentInquiry !== 'string' || studentInquiry.length > 1000)
  ) {
    throw new AppError(400, 'Invalid student inquiry', 'INVALID_INQUIRY');
  }

  // Check whether the slot exists
  const slot = await appointmentRepository.findSlotById(slotId);

  if (!slot) {
    throw new AppError(404, 'Slot not found', 'SLOT_NOT_FOUND');
  }

  // Check whether the slot is available
  if (slot.status !== 'AVAILABLE') {
    throw new AppError(409, 'Slot is not available', 'SLOT_UNAVAILABLE');
  }

  // Create the booking through the repository
  return await appointmentRepository.createBooking(
    slotId,
    studentId,
    studentInquiry
  );
}


 // CU-09: Cancel a confirmed tutoring appointment
async function cancelAppointment(userId, appointmentId) {

  // Validate the appointment ID
  if (!isUuid(appointmentId)) {
    throw new AppError(400, 'Invalid appointment ID', 'INVALID_ID');
  }

  // Validate the authenticated user ID
  if (!isUuid(userId)) {
    throw new AppError(400, 'Invalid user ID', 'INVALID_ID');
  }

  // Delegate the cancellation to the repository
  // The repository checks authorization, status and cancellation timing
  return await appointmentRepository.cancelAppointment(
    appointmentId,
    userId
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


module.exports = {
  createBooking,
  cancelAppointment,
  splitIntoHourlySlots,
  publishAvailability,
  blockAvailabilitySlot
};


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

module.exports = {
  createBooking
};

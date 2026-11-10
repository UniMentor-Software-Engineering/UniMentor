
const bookingService = require('../services/bookingService');
const AppError = require('../utils/AppError');

// Handle a student's booking request
async function createBooking(req, res, next) {
  try {
    // Verify that the user is authenticated
    if (!req.user || !req.user.id) {
      throw new AppError(401, 'Unauthorized');
    }

    // Get the authenticated user's ID
    const studentId = req.user.id;

    // Get the booking details from the request body
    const { slotId, studentInquiry } = req.body;

    // Create the booking through the service
    const appointment = await bookingService.createBooking(
      studentId,
      slotId,
      studentInquiry
    );

    // Return the created appointment
    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createBooking
};

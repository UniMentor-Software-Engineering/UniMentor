
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


 // CU-09: Handle an appointment cancellation request
async function cancelAppointment(req, res, next) {
  try {
    // Verify that the user is authenticated
    if (!req.user || !req.user.id) {
      throw new AppError(401, 'Unauthorized');
    }

    // Get the authenticated user and appointment IDs
    const userId = req.user.id;
    const appointmentId = req.params.id;

    // Cancel the appointment through the service
    const appointment = await bookingService.cancelAppointment(
      userId,
      appointmentId
    );

    // Return the cancelled appointment
    res.status(200).json({
      message: 'Appointment cancelled successfully',
      appointment
    });

  } catch (error) {
    next(error);
  }
}

 // CU-04: Handle availability slot publication
async function publishAvailability(req, res, next) {
  try {
    // Verify that the user is authenticated
    if (!req.user || !req.user.id) {
      throw new AppError(401, 'Unauthorized');
    }

    // Get the authenticated tutor's ID
    const tutorId = req.user.id;

    // Get the selected time interval
    const { startTime, endTime } = req.body;

    // Publish the availability slots through the service
    const result = await bookingService.publishAvailability(
      tutorId,
      startTime,
      endTime
    );

    // Return published and skipped slots
    res.status(201).json({
      message: 'Availability slots processed successfully',
      published: result.published,
      skipped: result.skipped
    });
  } catch (error) {
    next(error);
  }
}


 // CU-05: Handle a tutor's request to block an availability slot
async function blockAvailabilitySlot(req, res, next) {
  try {
    // Verify that the user is authenticated
    if (!req.user || !req.user.id) {
      throw new AppError(401, 'Unauthorized');
    }

    // Get the authenticated tutor's ID
    const tutorId = req.user.id;

    // Get the slot ID from the URL
    const slotId = req.params.id;

    // Block the slot through the service
    const slot = await bookingService.blockAvailabilitySlot(
      tutorId,
      slotId
    );

    // Return the updated slot
    res.status(200).json({
      message: 'Availability slot blocked successfully',
      slot
    });
  } catch (error) {
    next(error);
  }
}


module.exports = {
  createBooking,
  cancelAppointment,
  publishAvailability,
  blockAvailabilitySlot
};

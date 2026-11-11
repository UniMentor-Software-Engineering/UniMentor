
const express = require('express');
const router = express.Router();

const appointmentController = require('../controllers/appointmentController');
const { verifyJWT, requireRole } = require('../middlewares/authMiddleware');

// CU-08: Allow authenticated students to book an available slot
router.post(
  '/',
  verifyJWT,
  requireRole('STUDENT'),
  appointmentController.createBooking
);

// CU-09: Allow students and tutors to cancel their appointments
router.patch(
  '/:id/cancel',
  verifyJWT,
  requireRole('STUDENT', 'TUTOR'),
  appointmentController.cancelAppointment
);


 // CU-04: Allow authenticated tutors to publish availability slots
router.post(
  '/availability',
  verifyJWT,
  requireRole('TUTOR'),
  appointmentController.publishAvailability
);


 // CU-05: Allow authenticated tutors to block their available slots
router.patch(
  '/availability/:id/block',
  verifyJWT,
  requireRole('TUTOR'),
  appointmentController.blockAvailabilitySlot
);

module.exports = router;

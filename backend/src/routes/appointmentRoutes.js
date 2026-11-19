
const express = require('express');
const router = express.Router();

const appointmentController = require('../controllers/appointmentController');
const { verifyJWT, requireRole } = require('../middlewares/authMiddleware');

// CU-09 / CU-08 step 9: list the signed-in user's own appointments
router.get(
  '/me',
  verifyJWT,
  requireRole('STUDENT', 'TUTOR'),
  appointmentController.listMyAppointments
);

// CU-04 / CU-05: list the signed-in tutor's own slots (calendar view)
router.get(
  '/availability/me',
  verifyJWT,
  requireRole('TUTOR'),
  appointmentController.listMySlots
);

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


// CU-12 step 2: the tutor's notes on a completed session
router.put(
  '/:id/notes',
  verifyJWT,
  requireRole('TUTOR'),
  appointmentController.saveNotes
);

// CU-12 step 3: the student's rating (once) and feedback
router.post(
  '/:id/review',
  verifyJWT,
  requireRole('STUDENT'),
  appointmentController.submitReview
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

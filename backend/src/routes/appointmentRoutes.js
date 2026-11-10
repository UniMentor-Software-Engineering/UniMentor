
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

module.exports = router;

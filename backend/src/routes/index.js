// Main API router, mounted under /api in app.js.
// Each use case group adds its own router file here, e.g.:
//   router.use('/auth', authRoutes);                 // CU-01, CU-02 (P3)
//   router.use('/tutors', tutorRoutes);              // CU-03, CU-06, CU-07 (P2, P4)
//   router.use('/appointments', appointmentRoutes);  // CU-08, CU-09, CU-11, CU-12 (P4, P5)
//   router.use('/admin', adminRoutes);               // CU-13, CU-14 (P3)
const { Router } = require('express');
const healthRoutes = require('./healthRoutes');

const router = Router();

router.use('/health', healthRoutes);

module.exports = router;

const tutorRoutes = require('./tutorRoutes');
router.use('/tutors', tutorRoutes);

const express = require('express');
const router = express.Router();
const tutorController = require('../controllers/tutorController');
const { verifyJWT, requireRole } = require('../middlewares/authMiddleware');

router.get('/', tutorController.search);
router.get('/:id', tutorController.getProfile);
// CU-03: only the signed-in tutor can edit their own profile.
router.put('/profile', verifyJWT, requireRole('TUTOR'), tutorController.updateProfile);

module.exports = router;

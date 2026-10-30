const express = require('express');
const router = express.Router();
const tutorController = require('../controllers/tutorController');
const { verifyJWT, requireRole } = require('../middlewares/authMiddleware');

router.get('/', tutorController.search);
// CU-03: only the signed-in tutor can read (with the meeting link) and edit their own profile.
// Declared before '/:id' so that "profile" is not taken as a tutor ID.
router.get('/profile', verifyJWT, requireRole('TUTOR'), tutorController.getOwnProfile);
router.put('/profile', verifyJWT, requireRole('TUTOR'), tutorController.updateProfile);
router.get('/:id', tutorController.getProfile);

module.exports = router;

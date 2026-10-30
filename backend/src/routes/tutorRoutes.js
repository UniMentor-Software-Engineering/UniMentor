const express = require('express');
const router = express.Router();
const tutorController = require('../controllers/tutorController');
const AppError = require('../utils/AppError');

// Temporary guard until P3's verifyJWT + requireRole('TUTOR') read the session cookie:
// replace it with them then. Until that happens, PUT /profile always answers 401.
const ensureAuth = (req, res, next) => {
  if (!req.user) {
    throw new AppError(401, 'Authentication required.', 'UNAUTHENTICATED');
  }
  next();
};

router.get('/', tutorController.search);
router.get('/:id', tutorController.getProfile);
router.put('/profile', ensureAuth, tutorController.updateProfile);

module.exports = router;
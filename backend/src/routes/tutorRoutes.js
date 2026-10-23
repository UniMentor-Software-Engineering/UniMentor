const express = require('express');
const router = express.Router();
const tutorController = require('../controllers/tutorController');

// Middleware dummy en caso de que P3 aún no haya mergeado authMiddleware
const ensureAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
};

router.get('/', tutorController.search);
router.get('/:id', tutorController.getProfile);
router.put('/profile', ensureAuth, tutorController.updateProfile);

module.exports = router;
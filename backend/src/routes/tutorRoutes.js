const express = require('express');
const router = express.Router();
const tutorController = require('../controllers/tutorController');

router.get('/', (req, res, next) => tutorController.search(req, res, next));
router.get('/profile', (req, res, next) => tutorController.getMyProfile(req, res, next));
router.put('/profile', (req, res, next) => tutorController.updateMyProfile(req, res, next));

module.exports = router;
// CU-01 and CU-02. csrfProtection runs before these routes for the whole API (app.js),
// which also covers login CSRF: a forged login from another site is rejected.
const { Router } = require('express');
const authController = require('../controllers/authController');
const { verifyJWT } = require('../middlewares/authMiddleware');

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', verifyJWT, authController.getMe);

module.exports = router;

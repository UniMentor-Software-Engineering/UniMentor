// CU-13 and CU-14. The whole router is behind the chain
//   csrfProtection (app.js) -> verifyJWT -> requireRole('ADMIN') -> controller
// so a student or tutor gets 403 on every admin endpoint (CU-13, A1).
// There is deliberately no route to edit or delete audit logs (append-only, CU-14).
const { Router } = require('express');
const adminController = require('../controllers/adminController');
const { verifyJWT, requireRole } = require('../middlewares/authMiddleware');

const router = Router();

router.use(verifyJWT, requireRole('ADMIN'));

router.get('/users', adminController.listUsers);
router.post('/users/:id/suspend', adminController.suspendUser);
router.post('/users/:id/reactivate', adminController.reactivateUser);
router.get('/metrics', adminController.getMetrics);
router.get('/audit-logs', adminController.listAuditLogs);

module.exports = router;

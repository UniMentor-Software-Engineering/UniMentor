const { Router } = require('express');
const healthController = require('../controllers/healthController');

const router = Router();

// Liveness: the process is up. Used by Render's health check.
router.get('/', healthController.getHealth);
// Readiness: the API can reach PostgreSQL.
router.get('/db', healthController.getDatabaseHealth);

module.exports = router;

// Business Logic layer: decides what "healthy" means.
// It knows nothing about HTTP (req/res) or SQL; it only calls the repository.
const healthRepository = require('../repositories/healthRepository');
const AppError = require('../utils/AppError');

function getStatus() {
  return {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

async function getDatabaseStatus() {
  try {
    const databaseTime = await healthRepository.ping();
    return { status: 'ok', database: 'up', databaseTime };
  } catch (err) {
    console.error('Database health check failed:', err.message || err.code);
    throw new AppError(503, 'Database unavailable', 'DB_UNAVAILABLE');
  }
}

module.exports = { getStatus, getDatabaseStatus };

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
  let result;
  try {
    result = await healthRepository.ping();
  } catch (err) {
    console.error('Database health check failed:', err.message || err.code);
    throw new AppError(503, 'Database unavailable', 'DB_UNAVAILABLE');
  }
  if (!result.schemaReady) {
    console.error('Database health check failed: the tables do not exist. Run npm run db:migrate.');
    throw new AppError(503, 'Database schema not ready', 'DB_SCHEMA_NOT_READY');
  }
  return { status: 'ok', database: 'up', databaseTime: result.now };
}

module.exports = { getStatus, getDatabaseStatus };

// API layer: reads the request, calls the service and writes the HTTP response.
// No business rules and no SQL here.
const healthService = require('../services/healthService');

function getHealth(req, res) {
  res.status(200).json(healthService.getStatus());
}

async function getDatabaseHealth(req, res) {
  const result = await healthService.getDatabaseStatus();
  res.status(200).json(result);
}

module.exports = { getHealth, getDatabaseHealth };

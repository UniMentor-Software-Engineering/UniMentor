// API layer for CU-13 and CU-14. Validates the request format (IDs, filters, pagination)
// and delegates the business rules to adminService.
const adminService = require('../services/adminService');
const AppError = require('../utils/AppError');
const { isUuid } = require('../utils/validators');

const ROLES = ['STUDENT', 'TUTOR', 'ADMIN'];
const STATUSES = ['ACTIVE', 'SUSPENDED'];

function parsePagination({ limit = 20, offset = 0 }) {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    throw new AppError(400, 'Limit must be an integer between 1 and 50');
  }
  if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
    throw new AppError(400, 'Offset must be a non-negative integer');
  }
  return { limit: parsedLimit, offset: parsedOffset };
}

function requireUserId(id) {
  if (!isUuid(id)) {
    throw new AppError(400, 'Invalid user ID');
  }
  return id;
}

async function listUsers(req, res) {
  const { search, role, status } = req.query;
  if (role && !ROLES.includes(role)) {
    throw new AppError(400, `Role must be one of ${ROLES.join(', ')}`);
  }
  if (status && !STATUSES.includes(status)) {
    throw new AppError(400, `Status must be one of ${STATUSES.join(', ')}`);
  }
  if (search !== undefined && (typeof search !== 'string' || search.length > 100)) {
    throw new AppError(400, 'Search must be a text of at most 100 characters');
  }

  const users = await adminService.listUsers({
    search: search ? search.trim() : undefined,
    role,
    status,
    ...parsePagination(req.query),
  });
  res.status(200).json(users);
}

async function suspendUser(req, res) {
  const targetId = requireUserId(req.params.id);
  const result = await adminService.suspendUser(targetId, req.user.id, req.body?.reason);
  // Step 6: the panel updates the status badge from this response.
  res.status(200).json({
    user: result.user,
    cancelledAppointments: result.cancelledAppointments.length,
  });
}

async function reactivateUser(req, res) {
  const targetId = requireUserId(req.params.id);
  const user = await adminService.reactivateUser(targetId, req.user.id, req.body?.reason);
  res.status(200).json({ user });
}

async function getMetrics(req, res) {
  res.status(200).json(await adminService.getMetrics());
}

async function listAuditLogs(req, res) {
  const { action } = req.query;
  if (action !== undefined && (typeof action !== 'string' || !/^[A-Z_]{1,100}$/.test(action))) {
    throw new AppError(400, 'Invalid action filter');
  }
  const logs = await adminService.listAuditLogs({ action, ...parsePagination(req.query) });
  res.status(200).json(logs);
}

module.exports = { listUsers, suspendUser, reactivateUser, getMetrics, listAuditLogs };

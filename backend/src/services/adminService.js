// Business rules for account moderation (CU-13) and metrics and auditing (CU-14).
// The service only uses db.withTransaction to open the transaction: the SQL stays in the
// repositories, which receive the transaction client.
const db = require('../config/db');
const userRepository = require('../repositories/userRepository');
const adminRepository = require('../repositories/adminRepository');
const auditLogRepository = require('../repositories/auditLogRepository');
const AppError = require('../utils/AppError');

const MAX_REASON_LENGTH = 500;

function requireReason(reason) {
  const clean = typeof reason === 'string' ? reason.trim() : '';
  if (clean.length === 0 || clean.length > MAX_REASON_LENGTH) {
    throw new AppError(400, `A reason is required (maximum ${MAX_REASON_LENGTH} characters).`, 'INVALID_REASON');
  }
  return clean;
}

async function listUsers(filters) {
  return await userRepository.findAll(filters);
}

/**
 * CU-13, step 5: one transaction suspends the account, cancels its upcoming sessions,
 * releases their slots and writes the audit entry, so none of it can happen alone.
 * @returns {{ user: object, cancelledAppointments: object[] }} the cancelled sessions
 *   are returned so the counterparties can be emailed after the COMMIT (P5).
 */
async function suspendUser(targetId, adminId, reason) {
  // Business rule: an administrator cannot suspend their own account.
  if (targetId === adminId) {
    throw new AppError(400, 'You cannot suspend your own account.', 'SELF_SUSPENSION');
  }
  const cleanReason = requireReason(reason);

  return await db.withTransaction(async (client) => {
    const target = await userRepository.lockById(client, targetId);
    if (!target) {
      throw new AppError(404, 'User not found.', 'NOT_FOUND');
    }
    if (target.status === 'SUSPENDED') {
      throw new AppError(409, 'This account is already suspended.', 'ALREADY_SUSPENDED');
    }

    const user = await userRepository.updateStatus(client, targetId, 'SUSPENDED');
    const cancelled = await adminRepository.cancelFutureAppointments(client, targetId, adminId);
    await adminRepository.releaseSlots(client, cancelled.map((a) => a.slot_id), targetId);
    const blockedSlots = target.role === 'TUTOR'
      ? await adminRepository.blockFreeSlots(client, targetId)
      : 0;

    await auditLogRepository.insert({
      actorId: adminId,
      action: 'USER_SUSPENDED',
      targetType: 'USER',
      targetId,
      details: {
        reason: cleanReason,
        cancelledAppointments: cancelled.map((a) => a.id),
        blockedSlots,
      },
    }, client);

    // After the COMMIT, P5's NotificationService will email the other party of each
    // cancelled session (as in CU-09), using `cancelledAppointments`.
    return { user, cancelledAppointments: cancelled };
  });
}

// Not in Phase 1's CU-13 flow, but an admin needs a way to undo a suspension.
// The tutor's slots stay UNAVAILABLE: the tutor reopens them from the calendar.
async function reactivateUser(targetId, adminId, reason) {
  const cleanReason = requireReason(reason);

  return await db.withTransaction(async (client) => {
    const target = await userRepository.lockById(client, targetId);
    if (!target) {
      throw new AppError(404, 'User not found.', 'NOT_FOUND');
    }
    if (target.status === 'ACTIVE') {
      throw new AppError(409, 'This account is already active.', 'ALREADY_ACTIVE');
    }

    const user = await userRepository.updateStatus(client, targetId, 'ACTIVE');
    await auditLogRepository.insert({
      actorId: adminId,
      action: 'USER_REACTIVATED',
      targetType: 'USER',
      targetId,
      details: { reason: cleanReason },
    }, client);
    return user;
  });
}

async function getMetrics() {
  return await adminRepository.getMetrics();
}

async function listAuditLogs(filters) {
  return await auditLogRepository.findAll(filters);
}

module.exports = {
  listUsers,
  suspendUser,
  reactivateUser,
  getMetrics,
  listAuditLogs,
  MAX_REASON_LENGTH,
};

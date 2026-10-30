const db = require('../../src/config/db');
const adminService = require('../../src/services/adminService');
const userRepository = require('../../src/repositories/userRepository');
const adminRepository = require('../../src/repositories/adminRepository');
const auditLogRepository = require('../../src/repositories/auditLogRepository');

jest.mock('../../src/config/db', () => ({ withTransaction: jest.fn() }));
jest.mock('../../src/repositories/userRepository');
jest.mock('../../src/repositories/adminRepository');
jest.mock('../../src/repositories/auditLogRepository');

const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const TARGET_ID = 'b0000000-0000-0000-0000-000000000001';
const client = { query: jest.fn() };

describe('adminService.suspendUser (CU-13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Run the transaction body with a fake client, as db.withTransaction would.
    db.withTransaction.mockImplementation((work) => work(client));
  });

  it('rejects suspending your own account with 400, before opening a transaction', async () => {
    await expect(adminService.suspendUser(ADMIN_ID, ADMIN_ID, 'reason'))
      .rejects.toMatchObject({ status: 400, code: 'SELF_SUSPENSION' });
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it.each([undefined, '   ', 'x'.repeat(501)])('rejects the reason %p with 400', async (reason) => {
    await expect(adminService.suspendUser(TARGET_ID, ADMIN_ID, reason))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REASON' });
  });

  it('answers 404 when the user does not exist', async () => {
    userRepository.lockById.mockResolvedValue(null);
    await expect(adminService.suspendUser(TARGET_ID, ADMIN_ID, 'spam'))
      .rejects.toMatchObject({ status: 404 });
  });

  it('answers 409 when the account is already suspended', async () => {
    userRepository.lockById.mockResolvedValue({ id: TARGET_ID, role: 'STUDENT', status: 'SUSPENDED' });
    await expect(adminService.suspendUser(TARGET_ID, ADMIN_ID, 'spam'))
      .rejects.toMatchObject({ status: 409 });
    expect(userRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('suspends a tutor, cancels, releases and blocks slots and audits, all in one transaction', async () => {
    userRepository.lockById.mockResolvedValue({ id: TARGET_ID, role: 'TUTOR', status: 'ACTIVE' });
    const suspended = { id: TARGET_ID, role: 'TUTOR', status: 'SUSPENDED' };
    userRepository.updateStatus.mockResolvedValue(suspended);
    const cancelled = [{ id: 'f1', slot_id: 's1' }, { id: 'f2', slot_id: 's2' }];
    adminRepository.cancelFutureAppointments.mockResolvedValue(cancelled);
    adminRepository.blockFreeSlots.mockResolvedValue(3);

    const result = await adminService.suspendUser(TARGET_ID, ADMIN_ID, '  Reported  ');

    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(userRepository.lockById).toHaveBeenCalledWith(client, TARGET_ID);
    expect(userRepository.updateStatus).toHaveBeenCalledWith(client, TARGET_ID, 'SUSPENDED');
    expect(adminRepository.cancelFutureAppointments).toHaveBeenCalledWith(client, TARGET_ID, ADMIN_ID);
    expect(adminRepository.releaseSlots).toHaveBeenCalledWith(client, ['s1', 's2'], TARGET_ID);
    expect(adminRepository.blockFreeSlots).toHaveBeenCalledWith(client, TARGET_ID);
    expect(auditLogRepository.insert).toHaveBeenCalledWith({
      actorId: ADMIN_ID,
      action: 'USER_SUSPENDED',
      targetType: 'USER',
      targetId: TARGET_ID,
      details: { reason: 'Reported', cancelledAppointments: ['f1', 'f2'], blockedSlots: 3 },
    }, client);
    expect(result).toEqual({ user: suspended, cancelledAppointments: cancelled });
  });

  it('does not block slots when the suspended user is a student', async () => {
    userRepository.lockById.mockResolvedValue({ id: TARGET_ID, role: 'STUDENT', status: 'ACTIVE' });
    adminRepository.cancelFutureAppointments.mockResolvedValue([]);

    await adminService.suspendUser(TARGET_ID, ADMIN_ID, 'spam');

    expect(adminRepository.blockFreeSlots).not.toHaveBeenCalled();
    expect(auditLogRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ details: { reason: 'spam', cancelledAppointments: [], blockedSlots: 0 } }),
      client,
    );
  });
});

describe('adminService.reactivateUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.withTransaction.mockImplementation((work) => work(client));
  });

  it('answers 404 for an unknown user and 409 for an active one', async () => {
    userRepository.lockById.mockResolvedValueOnce(null);
    await expect(adminService.reactivateUser(TARGET_ID, ADMIN_ID, 'ok')).rejects.toMatchObject({ status: 404 });

    userRepository.lockById.mockResolvedValueOnce({ id: TARGET_ID, status: 'ACTIVE' });
    await expect(adminService.reactivateUser(TARGET_ID, ADMIN_ID, 'ok')).rejects.toMatchObject({ status: 409 });
  });

  it('reactivates the account and audits it', async () => {
    userRepository.lockById.mockResolvedValue({ id: TARGET_ID, status: 'SUSPENDED' });
    userRepository.updateStatus.mockResolvedValue({ id: TARGET_ID, status: 'ACTIVE' });

    await expect(adminService.reactivateUser(TARGET_ID, ADMIN_ID, 'Appeal accepted'))
      .resolves.toEqual({ id: TARGET_ID, status: 'ACTIVE' });
    expect(auditLogRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_REACTIVATED', details: { reason: 'Appeal accepted' } }),
      client,
    );
  });
});

describe('adminService read operations (CU-13 step 1, CU-14)', () => {
  it('delegates listing, metrics and audit logs to the repositories', async () => {
    userRepository.findAll.mockResolvedValue([{ id: TARGET_ID }]);
    adminRepository.getMetrics.mockResolvedValue({ total_bookings: 3 });
    auditLogRepository.findAll.mockResolvedValue([{ action: 'USER_SUSPENDED' }]);

    await expect(adminService.listUsers({ limit: 5, offset: 0 })).resolves.toEqual([{ id: TARGET_ID }]);
    await expect(adminService.getMetrics()).resolves.toEqual({ total_bookings: 3 });
    await expect(adminService.listAuditLogs({ limit: 5, offset: 0 })).resolves.toEqual([{ action: 'USER_SUSPENDED' }]);
  });
});

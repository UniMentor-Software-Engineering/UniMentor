// SQL contracts of the P3 repositories, with the database mocked:
// parameterized queries (NFR-02) and the values each function passes and returns.
const db = require('../../src/config/db');
const userRepository = require('../../src/repositories/userRepository');
const adminRepository = require('../../src/repositories/adminRepository');
const auditLogRepository = require('../../src/repositories/auditLogRepository');

jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const ID = 'b0000000-0000-0000-0000-000000000001';

beforeEach(() => jest.clearAllMocks());

describe('userRepository', () => {
  it('returns null when a lookup finds no row', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(userRepository.findAuthState(ID)).resolves.toBeNull();
    await expect(userRepository.findPublicById(ID)).resolves.toBeNull();
    await expect(userRepository.findForLogin('a@myuax.com')).resolves.toBeNull();
  });

  it('never selects password_hash in the public queries', async () => {
    db.query.mockResolvedValue({ rows: [{ id: ID }] });
    await userRepository.findPublicById(ID);
    await userRepository.findAll({ limit: 10, offset: 0 });
    for (const [sql] of db.query.mock.calls) {
      expect(sql).not.toContain('password_hash');
    }
  });

  it('creates a user with parameters', async () => {
    db.query.mockResolvedValue({ rows: [{ id: ID }] });
    await expect(userRepository.create({
      firstName: 'Ana', lastName: 'Ruiz', email: 'a@myuax.com', passwordHash: 'h', role: 'TUTOR',
    })).resolves.toEqual({ id: ID });
    expect(db.query.mock.calls[0][1]).toEqual(['Ana', 'Ruiz', 'a@myuax.com', 'h', 'TUTOR']);
  });

  it('registers a failed login in one UPDATE and reports the lock', async () => {
    db.query.mockResolvedValue({ rows: [{ is_locked: true }] });
    await expect(userRepository.registerFailedLogin(ID, 5, 15)).resolves.toBe(true);
    expect(db.query.mock.calls[0][1]).toEqual([ID, 5, 15]);

    await userRepository.resetLoginState(ID);
    expect(db.query.mock.calls[1][0]).toContain('failed_login_count = 0');
  });

  it('builds the directory filters with escaped LIKE patterns', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await userRepository.findAll({ search: '50%_off', role: 'TUTOR', status: 'ACTIVE', limit: 5, offset: 10 });

    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual(['%50\\%\\_off%', 'TUTOR', 'ACTIVE', 5, 10]);
    expect(sql).toContain('LIMIT $4 OFFSET $5');
  });

  it('locks and updates rows through the transaction client', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: ID, status: 'SUSPENDED' }] }) };
    await expect(userRepository.lockById(client, ID)).resolves.toMatchObject({ id: ID });
    await expect(userRepository.updateStatus(client, ID, 'SUSPENDED')).resolves.toMatchObject({ status: 'SUSPENDED' });
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(db.query).not.toHaveBeenCalled();

    client.query.mockResolvedValue({ rows: [] });
    await expect(userRepository.lockById(client, ID)).resolves.toBeNull();
  });
});

describe('adminRepository', () => {
  it('runs the suspension cascade on the transaction client', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'f1', slot_id: 's1' }], rowCount: 2 }) };

    await expect(adminRepository.cancelFutureAppointments(client, ID, 'admin')).resolves.toHaveLength(1);
    await adminRepository.releaseSlots(client, ['s1'], ID);
    await expect(adminRepository.blockFreeSlots(client, ID)).resolves.toBe(2);

    expect(client.query.mock.calls[0][1]).toEqual([ID, 'admin']);
    expect(client.query.mock.calls[1][1]).toEqual([['s1'], ID]);
    expect(client.query.mock.calls[2][0]).toContain("status = 'AVAILABLE'");
  });

  it('skips the slot update when no appointment was cancelled', async () => {
    const client = { query: jest.fn() };
    await adminRepository.releaseSlots(client, [], ID);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('returns the metrics row', async () => {
    db.query.mockResolvedValue({ rows: [{ total_bookings: 3, cancellation_rate: 0.333 }] });
    await expect(adminRepository.getMetrics()).resolves.toEqual({ total_bookings: 3, cancellation_rate: 0.333 });
  });
});

describe('auditLogRepository', () => {
  it('inserts with the shared pool by default and serializes details as JSON', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await auditLogRepository.insert({ action: 'ACCOUNT_LOCKED', targetType: 'USER', targetId: ID, details: { attempts: 5 } });
    expect(db.query.mock.calls[0][1]).toEqual([null, 'ACCOUNT_LOCKED', 'USER', ID, '{"attempts":5}']);
  });

  it('inserts with the transaction client when one is given', async () => {
    const client = { query: jest.fn() };
    await auditLogRepository.insert({ actorId: 'admin', action: 'USER_SUSPENDED', targetType: 'USER' }, client);
    expect(client.query.mock.calls[0][1]).toEqual(['admin', 'USER_SUSPENDED', 'USER', null, null]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lists the logs with and without the action filter', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await auditLogRepository.findAll({ limit: 20, offset: 0 });
    await auditLogRepository.findAll({ action: 'USER_SUSPENDED', limit: 20, offset: 40 });

    expect(db.query.mock.calls[0][1]).toEqual([20, 0]);
    expect(db.query.mock.calls[1][1]).toEqual(['USER_SUSPENDED', 20, 40]);
    expect(db.query.mock.calls[1][0]).toContain('WHERE a.action = $1');
  });
});

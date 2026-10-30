// CU-13 and CU-14 over HTTP. The whole admin router is behind
// csrfProtection -> verifyJWT -> requireRole('ADMIN'); adminService is mocked.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');
const app = require('../../src/app');
const userRepository = require('../../src/repositories/userRepository');
const adminService = require('../../src/services/adminService');

jest.mock('../../src/repositories/userRepository');
jest.mock('../../src/services/adminService');

const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const STUDENT_ID = 'c0000000-0000-0000-0000-000000000001';
const TARGET_ID = 'b0000000-0000-0000-0000-000000000001';

// A real signed session cookie; verifyJWT then reads the role from the (mocked) database.
function cookieFor(id, role) {
  userRepository.findAuthState.mockResolvedValue({ id, role, status: 'ACTIVE' });
  return `token=${jwt.sign({ sub: id, role }, config.jwtSecret, { expiresIn: '1h' })}`;
}

beforeEach(() => jest.clearAllMocks());

describe('admin access control (CU-13, A1)', () => {
  it.each([
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/metrics'],
    ['GET', '/api/admin/audit-logs'],
    ['POST', `/api/admin/users/${TARGET_ID}/suspend`],
  ])('%s %s answers 401 without a session', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path).set(CSRF);
    expect(res.status).toBe(401);
  });

  it.each(['STUDENT', 'TUTOR'])('answers 403 to a %s', async (role) => {
    const res = await request(app).get('/api/admin/metrics').set('Cookie', cookieFor(STUDENT_ID, role));
    expect(res.status).toBe(403);
    expect(adminService.getMetrics).not.toHaveBeenCalled();
  });

  it('rejects a POST without the CSRF header before checking the session', async () => {
    const res = await request(app).post(`/api/admin/users/${TARGET_ID}/suspend`)
      .set('Cookie', cookieFor(ADMIN_ID, 'ADMIN')).send({ reason: 'spam' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
    expect(userRepository.findAuthState).not.toHaveBeenCalled();
  });

  it('has no route to modify or delete audit logs (append-only)', async () => {
    const cookie = cookieFor(ADMIN_ID, 'ADMIN');
    const del = await request(app).delete('/api/admin/audit-logs').set(CSRF).set('Cookie', cookie);
    const put = await request(app).put('/api/admin/audit-logs/x').set(CSRF).set('Cookie', cookie);
    expect(del.status).toBe(404);
    expect(put.status).toBe(404);
  });
});

describe('POST /api/admin/users/:id/suspend', () => {
  it('suspends the user and returns it with the number of cancelled sessions', async () => {
    adminService.suspendUser.mockResolvedValue({
      user: { id: TARGET_ID, status: 'SUSPENDED' },
      cancelledAppointments: [{ id: 'f1' }, { id: 'f2' }],
    });

    const res = await request(app).post(`/api/admin/users/${TARGET_ID}/suspend`)
      .set(CSRF).set('Cookie', cookieFor(ADMIN_ID, 'ADMIN')).send({ reason: 'Reported' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: TARGET_ID, status: 'SUSPENDED' }, cancelledAppointments: 2 });
    expect(adminService.suspendUser).toHaveBeenCalledWith(TARGET_ID, ADMIN_ID, 'Reported');
  });

  it('answers 400 for an ID that is not a UUID', async () => {
    const res = await request(app).post('/api/admin/users/42/suspend')
      .set(CSRF).set('Cookie', cookieFor(ADMIN_ID, 'ADMIN')).send({ reason: 'x' });
    expect(res.status).toBe(400);
    expect(adminService.suspendUser).not.toHaveBeenCalled();
  });

  it('passes on the service errors (e.g. 400 for self-suspension)', async () => {
    const AppError = jest.requireActual('../../src/utils/AppError');
    adminService.suspendUser.mockRejectedValue(new AppError(400, 'You cannot suspend your own account.', 'SELF_SUSPENSION'));

    const res = await request(app).post(`/api/admin/users/${ADMIN_ID}/suspend`)
      .set(CSRF).set('Cookie', cookieFor(ADMIN_ID, 'ADMIN')).send({ reason: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_SUSPENSION');
  });
});

describe('POST /api/admin/users/:id/reactivate', () => {
  it('reactivates the user', async () => {
    adminService.reactivateUser.mockResolvedValue({ id: TARGET_ID, status: 'ACTIVE' });
    const res = await request(app).post(`/api/admin/users/${TARGET_ID}/reactivate`)
      .set(CSRF).set('Cookie', cookieFor(ADMIN_ID, 'ADMIN')).send({ reason: 'Appeal' });
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('ACTIVE');
  });
});

describe('GET /api/admin/users', () => {
  it('passes the validated filters and pagination to the service', async () => {
    adminService.listUsers.mockResolvedValue([{ id: TARGET_ID }]);

    const res = await request(app).get('/api/admin/users?search=%20laura%20&role=TUTOR&status=ACTIVE&limit=5&offset=10')
      .set('Cookie', cookieFor(ADMIN_ID, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(adminService.listUsers).toHaveBeenCalledWith({
      search: 'laura', role: 'TUTOR', status: 'ACTIVE', limit: 5, offset: 10,
    });
  });

  it.each([
    ['role=ROOT'],
    ['status=BANNED'],
    ['limit=0'],
    ['limit=51'],
    ['offset=-1'],
    [`search=${'x'.repeat(101)}`],
  ])('answers 400 for %s', async (query) => {
    const res = await request(app).get(`/api/admin/users?${query}`).set('Cookie', cookieFor(ADMIN_ID, 'ADMIN'));
    expect(res.status).toBe(400);
  });
});

describe('CU-14: GET /api/admin/metrics and /api/admin/audit-logs', () => {
  it('returns the metrics', async () => {
    adminService.getMetrics.mockResolvedValue({ total_bookings: 3, cancellation_rate: 0.333 });
    const res = await request(app).get('/api/admin/metrics').set('Cookie', cookieFor(ADMIN_ID, 'ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total_bookings: 3, cancellation_rate: 0.333 });
  });

  it('returns the audit logs with the default pagination and an action filter', async () => {
    adminService.listAuditLogs.mockResolvedValue([]);
    const res = await request(app).get('/api/admin/audit-logs?action=USER_SUSPENDED')
      .set('Cookie', cookieFor(ADMIN_ID, 'ADMIN'));
    expect(res.status).toBe(200);
    expect(adminService.listAuditLogs).toHaveBeenCalledWith({ action: 'USER_SUSPENDED', limit: 20, offset: 0 });
  });

  it('answers 400 for an invalid action filter', async () => {
    const res = await request(app).get('/api/admin/audit-logs?action=drop%20table')
      .set('Cookie', cookieFor(ADMIN_ID, 'ADMIN'));
    expect(res.status).toBe(400);
  });
});

// CU-01 and CU-02 over HTTP: the real chain, controllers and services, with the
// repositories mocked. Checks the session cookie flags required by NFR-02.
const request = require('supertest');
const config = require('../../src/config/env');
const app = require('../../src/app');
const userRepository = require('../../src/repositories/userRepository');
const auditLogRepository = require('../../src/repositories/auditLogRepository');

jest.mock('../../src/repositories/userRepository');
jest.mock('../../src/repositories/auditLogRepository');

const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
// The seed hash of Password123! (cost 10), so bcrypt.compare runs for real.
const SEED_HASH = '$2a$10$dSh1q6rNiz1kO2GGWV6InufEaFEGdoA6g4L3d792j8TKpHmY6iX1W';

const student = {
  id: 'c0000000-0000-0000-0000-000000000001',
  email: 'diego.student@unimentor.edu',
  first_name: 'Diego',
  last_name: 'Sanz',
  role: 'STUDENT',
  status: 'ACTIVE',
  password_hash: SEED_HASH,
  is_locked: false,
};

function sessionCookie(res) {
  return (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
}

async function signIn() {
  userRepository.findForLogin.mockResolvedValue(student);
  const res = await request(app).post('/api/auth/login').set(CSRF)
    .send({ email: student.email, password: 'Password123!' });
  return sessionCookie(res).split(';')[0];
}

describe('POST /api/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is rejected with 403 without the CSRF header', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });

  it('creates the account and returns 201 without password_hash', async () => {
    userRepository.create.mockImplementation(async ({ email, role }) => ({ id: student.id, email, role, status: 'ACTIVE' }));

    const res = await request(app).post('/api/auth/register').set(CSRF).send({
      firstName: 'Ana', lastName: 'Ruiz', email: 'ana@myuax.com', password: 'secret123', role: 'TUTOR',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'ana@myuax.com', role: 'TUTOR' });
    expect(res.body).not.toHaveProperty('password_hash');
    // The stored hash is a real bcrypt hash with cost 12 (NFR-02).
    expect(userRepository.create.mock.calls[0][0].passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(auditLogRepository.insert).toHaveBeenCalled();
  });

  it('answers 409 for a duplicate email', async () => {
    userRepository.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));
    const res = await request(app).post('/api/auth/register').set(CSRF).send({
      firstName: 'Ana', lastName: 'Ruiz', email: 'ana@myuax.com', password: 'secret123', role: 'STUDENT',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ message: 'This email address is already in use.', code: 'EMAIL_IN_USE' });
  });

  it('answers 400 for a weak password, a foreign domain and the ADMIN role', async () => {
    const base = { firstName: 'Ana', lastName: 'Ruiz', email: 'ana@myuax.com', password: 'secret123', role: 'STUDENT' };
    const cases = [
      [{ password: 'short1' }, 'WEAK_PASSWORD'],
      [{ email: 'ana@gmail.com' }, 'INVALID_EMAIL'],
      [{ role: 'ADMIN' }, 'INVALID_ROLE'],
    ];
    for (const [override, code] of cases) {
      const res = await request(app).post('/api/auth/register').set(CSRF).send({ ...base, ...override });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(code);
    }
    expect(userRepository.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login', () => {
  const originalIsProduction = config.isProduction;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    config.isProduction = originalIsProduction;
  });

  it('sets an HttpOnly session cookie and returns the user (development flags)', async () => {
    userRepository.findForLogin.mockResolvedValue(student);

    const res = await request(app).post('/api/auth/login').set(CSRF)
      .send({ email: student.email, password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: student.id, email: student.email, first_name: 'Diego', last_name: 'Sanz', role: 'STUDENT',
    });
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=7200/);
    expect(cookie).not.toMatch(/Secure/);
    expect(userRepository.resetLoginState).toHaveBeenCalledWith(student.id);
  });

  it('uses Secure and SameSite=None in production (cross-site Vercel/Render, ADR 4)', async () => {
    config.isProduction = true;
    userRepository.findForLogin.mockResolvedValue(student);

    const res = await request(app).post('/api/auth/login').set(CSRF)
      .send({ email: student.email, password: 'Password123!' });

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=None/);
  });

  it('answers 401 with the same message for a wrong password and an unknown email', async () => {
    userRepository.findForLogin.mockResolvedValueOnce(student);
    userRepository.registerFailedLogin.mockResolvedValue(false);
    const wrongPassword = await request(app).post('/api/auth/login').set(CSRF)
      .send({ email: student.email, password: 'Wrong123!' });

    userRepository.findForLogin.mockResolvedValueOnce(null);
    const unknownEmail = await request(app).post('/api/auth/login').set(CSRF)
      .send({ email: 'nobody@unimentor.edu', password: 'Wrong123!' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe('Invalid email or password.');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
    expect(sessionCookie(wrongPassword)).toBeUndefined();
  });

  it('answers 403 for a suspended account and 429 for a locked one', async () => {
    userRepository.findForLogin.mockResolvedValueOnce({ ...student, status: 'SUSPENDED' });
    const suspended = await request(app).post('/api/auth/login').set(CSRF)
      .send({ email: student.email, password: 'Password123!' });

    userRepository.findForLogin.mockResolvedValueOnce({ ...student, is_locked: true });
    const locked = await request(app).post('/api/auth/login').set(CSRF)
      .send({ email: student.email, password: 'Password123!' });

    expect(suspended.status).toBe(403);
    expect(locked.status).toBe(429);
  });

  it('locks the account on the 5th consecutive failure and then answers 429', async () => {
    // Simulates the counter kept by the single UPDATE in userRepository.registerFailedLogin.
    let failures = 0;
    let lockedAccount = false;
    userRepository.findForLogin.mockImplementation(async () => ({ ...student, is_locked: lockedAccount }));
    userRepository.registerFailedLogin.mockImplementation(async (id, maxAttempts) => {
      failures += 1;
      lockedAccount = failures >= maxAttempts;
      return lockedAccount;
    });

    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app).post('/api/auth/login').set(CSRF)
        .send({ email: student.email, password: 'Wrong123!' });
      statuses.push(res.status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    expect(auditLogRepository.insert).toHaveBeenCalledTimes(1);
    expect(auditLogRepository.insert.mock.calls[0][0].action).toBe('ACCOUNT_LOCKED');
  });
});

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the signed-in user from the cookie', async () => {
    const cookie = await signIn();
    userRepository.findAuthState.mockResolvedValue({ id: student.id, role: 'STUDENT', status: 'ACTIVE' });
    userRepository.findPublicById.mockResolvedValue({ id: student.id, email: student.email, role: 'STUDENT' });

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: student.id, role: 'STUDENT' });
  });

  it('answers 401 without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('clears the cookie on logout', async () => {
    const res = await request(app).post('/api/auth/logout').set(CSRF);
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/token=;.*Expires=Thu, 01 Jan 1970/);
  });
});

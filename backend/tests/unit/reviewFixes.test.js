// Regression tests for the defects found when reviewing P1-P3 against a real database.
const bcrypt = jest.requireActual('bcryptjs');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  pool: { end: jest.fn() },
}));

const app = require('../../src/app');
const config = require('../../src/config/env');
const authService = require('../../src/services/authService');
const { validateMeetingUrl } = require('../../src/services/tutorService');
const { parsePagination } = require('../../src/utils/validators');

function ask(method, url) {
  return request(app)[method](url).set('X-Requested-With', 'XMLHttpRequest');
}

describe('login timing', () => {
  it('compares unknown emails against a hash with the same cost as real passwords', () => {
    expect(bcrypt.getRounds(authService.DUMMY_HASH)).toBe(authService.BCRYPT_COST);
  });
});

describe('email validation', () => {
  it('rejects a huge email without running the slow regex', async () => {
    const started = Date.now();
    await expect(authService.register({
      firstName: 'a',
      lastName: 'b',
      email: `a@${'.'.repeat(95000)}@`,
      password: 'abcd1234',
      role: 'STUDENT',
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_EMAIL' });
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe('rejectNullBytes', () => {
  it.each([
    ['a query parameter', () => ask('get', '/api/tutors?search=%00')],
    ['a JSON field', () => ask('post', '/api/auth/login').send({ email: 'a\u0000@myuax.com', password: 'x' })],
    ['a nested JSON field', () => ask('post', '/api/auth/login').send({ profile: { names: ['a\u0000'] } })],
  ])('answers 400 for a NUL byte in %s', async (_name, send) => {
    const res = await send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});

describe('GET /api/tutors input', () => {
  it.each([
    ['a repeated search', '/api/tutors?search=a&search=b'],
    ['a search that is too long', `/api/tutors?search=${'a'.repeat(101)}`],
    ['an offset beyond bigint', '/api/tutors?offset=99999999999999999999'],
    ['a limit with trailing text', '/api/tutors?limit=5abc'],
  ])('answers 400 for %s', async (_name, url) => {
    expect((await ask('get', url)).status).toBe(400);
  });
});

describe('parsePagination', () => {
  it('uses the default limit and offset', () => {
    expect(parsePagination({}, 10)).toEqual({ limit: 10, offset: 0 });
  });

  it('accepts numbers sent as text', () => {
    expect(parsePagination({ limit: '20', offset: '40' }, 10)).toEqual({ limit: 20, offset: 40 });
  });
});

describe('validateMeetingUrl', () => {
  it('rejects a link longer than the column', () => {
    expect(validateMeetingUrl(`https://zoom.us/j/${'1'.repeat(500)}`)).toBe(false);
  });
});

describe('verifyJWT', () => {
  it('clears the cookie of an expired session (CU-11, A1)', async () => {
    const expired = jwt.sign({ sub: 'x' }, config.jwtSecret, { expiresIn: -10 });

    const res = await request(app).get('/api/auth/me').set('Cookie', `token=${expired}`);

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie'][0]).toMatch(/^token=;.*Expires=Thu, 01 Jan 1970/);
  });
});

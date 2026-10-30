// Links of the request chain: verifyJWT, requireRole and csrfProtection.
const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');
const userRepository = require('../../src/repositories/userRepository');
const { verifyJWT, requireRole } = require('../../src/middlewares/authMiddleware');
const csrfProtection = require('../../src/middlewares/csrfMiddleware');

jest.mock('../../src/repositories/userRepository');

const USER_ID = 'c0000000-0000-0000-0000-000000000001';

function sign(payload = { sub: USER_ID, role: 'STUDENT' }, options = {}) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h', ...options });
}

function reqWithToken(token) {
  return { cookies: token === undefined ? {} : { token } };
}

describe('verifyJWT', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a request without the session cookie with 401', async () => {
    await expect(verifyJWT(reqWithToken(), {}, jest.fn())).rejects.toMatchObject({ status: 401 });
    expect(userRepository.findAuthState).not.toHaveBeenCalled();
  });

  it('rejects a token signed with another secret with 401', async () => {
    const token = jwt.sign({ sub: USER_ID, role: 'ADMIN' }, 'not-the-secret');
    await expect(verifyJWT(reqWithToken(token), {}, jest.fn()))
      .rejects.toMatchObject({ status: 401, message: 'Invalid session. Please sign in again.' });
  });

  it('rejects an expired token with 401', async () => {
    const token = sign({ sub: USER_ID, role: 'STUDENT' }, { expiresIn: -10 });
    await expect(verifyJWT(reqWithToken(token), {}, jest.fn()))
      .rejects.toMatchObject({ status: 401, message: 'Your session has expired. Please sign in again.' });
  });

  it('rejects a token whose user no longer exists with 401', async () => {
    userRepository.findAuthState.mockResolvedValue(null);
    await expect(verifyJWT(reqWithToken(sign()), {}, jest.fn())).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a suspended account with 403 even with a valid token (CU-13)', async () => {
    userRepository.findAuthState.mockResolvedValue({ id: USER_ID, role: 'STUDENT', status: 'SUSPENDED' });
    await expect(verifyJWT(reqWithToken(sign()), {}, jest.fn()))
      .rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' });
  });

  it('sets req.user with the role from the database and calls next', async () => {
    // The token still says STUDENT, but the database says TUTOR: the database wins.
    userRepository.findAuthState.mockResolvedValue({ id: USER_ID, role: 'TUTOR', status: 'ACTIVE' });
    const req = reqWithToken(sign());
    const next = jest.fn();

    await verifyJWT(req, {}, next);

    expect(userRepository.findAuthState).toHaveBeenCalledWith(USER_ID);
    expect(req.user).toEqual({ id: USER_ID, role: 'TUTOR' });
    expect(next).toHaveBeenCalledWith();
  });
});

describe('requireRole', () => {
  it('answers 401 when verifyJWT has not run', () => {
    expect(() => requireRole('ADMIN')({}, {}, jest.fn())).toThrow(expect.objectContaining({ status: 401 }));
  });

  it('answers 403 for a role that is not allowed', () => {
    const req = { user: { id: USER_ID, role: 'STUDENT' } };
    expect(() => requireRole('ADMIN')(req, {}, jest.fn())).toThrow(expect.objectContaining({ status: 403 }));
  });

  it('calls next for any of the allowed roles', () => {
    const next = jest.fn();
    requireRole('TUTOR', 'ADMIN')({ user: { id: USER_ID, role: 'ADMIN' } }, {}, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('csrfProtection', () => {
  const request = (method, header) => ({ method, get: () => header });

  it.each(['GET', 'HEAD', 'OPTIONS'])('lets a %s request through without the header', (method) => {
    const next = jest.fn();
    csrfProtection(request(method, undefined), {}, next);
    expect(next).toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects a %s request without the header with 403', (method) => {
    expect(() => csrfProtection(request(method, undefined), {}, jest.fn()))
      .toThrow(expect.objectContaining({ status: 403, code: 'CSRF' }));
  });

  it('lets a POST with X-Requested-With: XMLHttpRequest through', () => {
    const next = jest.fn();
    csrfProtection(request('POST', 'XMLHttpRequest'), {}, next);
    expect(next).toHaveBeenCalled();
  });
});

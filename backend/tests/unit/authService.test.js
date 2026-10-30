const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');
const authService = require('../../src/services/authService');
const userRepository = require('../../src/repositories/userRepository');
const auditLogRepository = require('../../src/repositories/auditLogRepository');

jest.mock('bcryptjs');
jest.mock('../../src/repositories/userRepository');
jest.mock('../../src/repositories/auditLogRepository');

const validInput = {
  firstName: '  Ana ',
  lastName: 'Ruiz',
  email: 'Ana.Ruiz@MYUAX.com',
  password: 'secret123',
  role: 'STUDENT',
};

const storedUser = {
  id: 'c0000000-0000-0000-0000-000000000009',
  email: 'ana.ruiz@myuax.com',
  first_name: 'Ana',
  last_name: 'Ruiz',
  role: 'STUDENT',
  status: 'ACTIVE',
  password_hash: '$2a$12$hash',
  is_locked: false,
};

describe('authService.register (CU-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bcrypt.hash.mockResolvedValue('$2a$12$hash');
  });

  it('hashes the password with cost 12, normalizes the input and writes an audit entry', async () => {
    const created = { id: storedUser.id, email: storedUser.email, role: 'STUDENT' };
    userRepository.create.mockResolvedValue(created);

    await expect(authService.register(validInput)).resolves.toEqual(created);

    expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 12);
    expect(userRepository.create).toHaveBeenCalledWith({
      firstName: 'Ana',
      lastName: 'Ruiz',
      email: 'ana.ruiz@myuax.com',
      passwordHash: '$2a$12$hash',
      role: 'STUDENT',
    });
    expect(auditLogRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_REGISTERED', targetId: storedUser.id }),
    );
  });

  it.each([
    ['a missing first name', { firstName: '' }, 'INVALID_FIRST_NAME'],
    ['a last name over 100 characters', { lastName: 'x'.repeat(101) }, 'INVALID_LAST_NAME'],
    ['a malformed email', { email: 'not-an-email' }, 'INVALID_EMAIL'],
    ['a non-university domain', { email: 'ana@gmail.com' }, 'INVALID_EMAIL'],
    ['a password without digits', { password: 'onlyletters' }, 'WEAK_PASSWORD'],
    ['a password over 72 characters', { password: `a1${'x'.repeat(71)}` }, 'WEAK_PASSWORD'],
    ['the ADMIN role', { role: 'ADMIN' }, 'INVALID_ROLE'],
    ['no role', { role: undefined }, 'INVALID_ROLE'],
  ])('rejects %s with 400', async (_label, override, code) => {
    await expect(authService.register({ ...validInput, ...override }))
      .rejects.toMatchObject({ status: 400, code });
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('rejects an empty body with 400 instead of crashing', async () => {
    await expect(authService.register()).rejects.toMatchObject({ status: 400 });
  });

  it('lists every missing password requirement (A2)', async () => {
    await expect(authService.register({ ...validInput, password: 'abc' }))
      .rejects.toThrow('Password must contain at least 8 characters and a digit.');
    expect(authService.passwordProblems(undefined)).toHaveLength(3);
  });

  it('turns the UNIQUE violation into 409 (A1)', async () => {
    userRepository.create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(authService.register(validInput))
      .rejects.toMatchObject({ status: 409, message: 'This email address is already in use.' });
  });

  it('rethrows any other database error', async () => {
    userRepository.create.mockRejectedValue(new Error('connection lost'));
    await expect(authService.register(validInput)).rejects.toThrow('connection lost');
  });
});

describe('authService.login (CU-02)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects missing credentials with 400', async () => {
    await expect(authService.login({})).rejects.toMatchObject({ status: 400 });
    await expect(authService.login()).rejects.toMatchObject({ status: 400 });
  });

  it('answers 401 for an unknown email, after a dummy bcrypt comparison', async () => {
    userRepository.findForLogin.mockResolvedValue(null);
    bcrypt.compare.mockResolvedValue(false);

    await expect(authService.login({ email: 'nobody@myuax.com', password: 'x' }))
      .rejects.toMatchObject({ status: 401, message: 'Invalid email or password.' });
    expect(bcrypt.compare).toHaveBeenCalled();
  });

  it('answers 403 for a suspended account (A2)', async () => {
    userRepository.findForLogin.mockResolvedValue({ ...storedUser, status: 'SUSPENDED' });
    await expect(authService.login({ email: storedUser.email, password: 'x' }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('answers 429 for a locked account without checking the password (A3)', async () => {
    userRepository.findForLogin.mockResolvedValue({ ...storedUser, is_locked: true });
    await expect(authService.login({ email: storedUser.email, password: 'secret123' }))
      .rejects.toMatchObject({ status: 429, message: 'Too many failed attempts. Try again in 15 minutes.' });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('counts a wrong password and answers 401', async () => {
    userRepository.findForLogin.mockResolvedValue(storedUser);
    bcrypt.compare.mockResolvedValue(false);
    userRepository.registerFailedLogin.mockResolvedValue(false);

    await expect(authService.login({ email: storedUser.email, password: 'wrong' }))
      .rejects.toMatchObject({ status: 401 });
    expect(userRepository.registerFailedLogin).toHaveBeenCalledWith(storedUser.id, 5, 15);
    expect(auditLogRepository.insert).not.toHaveBeenCalled();
  });

  it('writes ACCOUNT_LOCKED when the 5th failure locks the account', async () => {
    userRepository.findForLogin.mockResolvedValue(storedUser);
    bcrypt.compare.mockResolvedValue(false);
    userRepository.registerFailedLogin.mockResolvedValue(true);

    await expect(authService.login({ email: storedUser.email, password: 'wrong' }))
      .rejects.toMatchObject({ status: 401 });
    expect(auditLogRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCOUNT_LOCKED', targetId: storedUser.id }),
    );
  });

  it('resets the counter and returns a JWT with only sub and role', async () => {
    userRepository.findForLogin.mockResolvedValue(storedUser);
    bcrypt.compare.mockResolvedValue(true);

    const { user, token } = await authService.login({ email: ' ANA.RUIZ@myuax.com ', password: 'secret123' });

    expect(userRepository.findForLogin).toHaveBeenCalledWith('ana.ruiz@myuax.com');
    expect(userRepository.resetLoginState).toHaveBeenCalledWith(storedUser.id);
    expect(user).not.toHaveProperty('password_hash');
    expect(user).toMatchObject({ id: storedUser.id, role: 'STUDENT', first_name: 'Ana' });

    const payload = jwt.verify(token, config.jwtSecret);
    expect(payload).toMatchObject({ sub: storedUser.id, role: 'STUDENT' });
    expect(payload.exp - payload.iat).toBe(2 * 60 * 60);
  });
});

describe('authService.getCurrentUser', () => {
  it('returns the public user', async () => {
    userRepository.findPublicById.mockResolvedValue({ id: storedUser.id });
    await expect(authService.getCurrentUser(storedUser.id)).resolves.toEqual({ id: storedUser.id });
  });

  it('answers 401 when the user does not exist', async () => {
    userRepository.findPublicById.mockResolvedValue(null);
    await expect(authService.getCurrentUser(storedUser.id)).rejects.toMatchObject({ status: 401 });
  });
});

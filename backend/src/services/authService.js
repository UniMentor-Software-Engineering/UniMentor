// Business rules for registration (CU-01) and login (CU-02).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const userRepository = require('../repositories/userRepository');
const auditLogRepository = require('../repositories/auditLogRepository');
const AppError = require('../utils/AppError');

// NFR-02: bcrypt with a work factor of at least 10.
const BCRYPT_COST = 12;
// CU-02 business rule: 5 consecutive failures lock the account for 15 minutes.
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// The cookie lives exactly as long as the JWT inside it.
const SESSION_HOURS = 2;
const SESSION_MAX_AGE_MS = SESSION_HOURS * 60 * 60 * 1000;

const SELF_REGISTER_ROLES = ['STUDENT', 'TUTOR'];
const MAX_NAME_LENGTH = 100; // first_name and last_name are VARCHAR(100)
const MAX_EMAIL_LENGTH = 255;
// bcrypt ignores everything after 72 bytes, so longer passwords are rejected.
const MAX_PASSWORD_LENGTH = 72;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Compared against when the email does not exist, so the response takes as long
// as a wrong password and does not reveal which emails are registered.
const DUMMY_HASH = '$2a$10$dSh1q6rNiz1kO2GGWV6InufEaFEGdoA6g4L3d792j8TKpHmY6iX1W';

const INVALID_CREDENTIALS = 'Invalid email or password.';

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// CU-01, A2: the response lists every requirement the password misses.
function passwordProblems(password) {
  if (typeof password !== 'string') return ['at least 8 characters', 'a letter', 'a digit'];
  const problems = [];
  if (password.length < 8) problems.push('at least 8 characters');
  if (!/[A-Za-z]/.test(password)) problems.push('a letter');
  if (!/\d/.test(password)) problems.push('a digit');
  return problems;
}

function requireName(value, label, code) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new AppError(400, `${label} is required (maximum ${MAX_NAME_LENGTH} characters).`, code);
  }
  return name;
}

async function register({ firstName, lastName, email, password, role } = {}) {
  // Step 4: payload formats and field integrity.
  const cleanFirstName = requireName(firstName, 'First name', 'INVALID_FIRST_NAME');
  const cleanLastName = requireName(lastName, 'Last name', 'INVALID_LAST_NAME');

  const cleanEmail = normalizeEmail(email);
  if (!EMAIL_REGEX.test(cleanEmail) || cleanEmail.length > MAX_EMAIL_LENGTH) {
    throw new AppError(400, 'Enter a valid email address.', 'INVALID_EMAIL');
  }
  // Precondition 2: an authorized university domain.
  const domain = cleanEmail.split('@')[1];
  if (!config.allowedEmailDomains.includes(domain)) {
    throw new AppError(400, 'Use your university email address.', 'INVALID_EMAIL');
  }

  const problems = passwordProblems(password);
  if (problems.length > 0) {
    const list = problems.length > 1
      ? `${problems.slice(0, -1).join(', ')} and ${problems.at(-1)}`
      : problems[0];
    throw new AppError(400, `Password must contain ${list}.`, 'WEAK_PASSWORD');
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError(400, `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`, 'WEAK_PASSWORD');
  }

  // Nobody can register as ADMIN: admin accounts are created by the university.
  if (!SELF_REGISTER_ROLES.includes(role)) {
    throw new AppError(400, 'Role must be STUDENT or TUTOR.', 'INVALID_ROLE');
  }

  // Step 6: bcrypt hash. Steps 5 and 7: the UNIQUE constraint on email detects
  // duplicates atomically, even when two registrations with the same email arrive at once.
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  let user;
  try {
    user = await userRepository.create({
      firstName: cleanFirstName,
      lastName: cleanLastName,
      email: cleanEmail,
      passwordHash,
      role,
    });
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError(409, 'This email address is already in use.', 'EMAIL_IN_USE');
    }
    throw err;
  }

  await auditLogRepository.insert({
    actorId: user.id,
    action: 'USER_REGISTERED',
    targetType: 'USER',
    targetId: user.id,
    details: { role: user.role },
  });

  // Step 8 (welcome email) belongs to P5's NotificationService (ADR 6). When it exists,
  // call it here without awaiting a failure: a failed email must not undo the registration.

  return user;
}

async function login({ email, password } = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || typeof password !== 'string' || password.length === 0) {
    throw new AppError(400, 'Email and password are required.', 'VALIDATION_ERROR');
  }

  // Order of sequence diagram B (03-architecture): suspended -> locked -> password.
  const user = await userRepository.findForLogin(cleanEmail);
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError(401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  }
  if (user.status === 'SUSPENDED') {
    throw new AppError(403, 'Your account has been suspended. Please contact administration.', 'ACCOUNT_SUSPENDED');
  }
  if (user.is_locked) {
    throw new AppError(429, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`, 'ACCOUNT_LOCKED');
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    const nowLocked = await userRepository.registerFailedLogin(user.id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES);
    if (nowLocked) {
      await auditLogRepository.insert({
        action: 'ACCOUNT_LOCKED',
        targetType: 'USER',
        targetId: user.id,
        details: { attempts: MAX_FAILED_ATTEMPTS, minutes: LOCK_MINUTES },
      });
    }
    throw new AppError(401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  }

  await userRepository.resetLoginState(user.id);

  // Step 4: the JWT only carries the user ID and the role.
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${SESSION_HOURS}h`,
  });

  // The frontend cannot read the HttpOnly cookie, so it needs these fields to pick
  // the role-specific dashboard (step 6).
  const publicUser = {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
  };
  return { user: publicUser, token };
}

async function getCurrentUser(id) {
  const user = await userRepository.findPublicById(id);
  if (!user) {
    throw new AppError(401, 'Authentication required.', 'UNAUTHENTICATED');
  }
  return user;
}

module.exports = {
  register,
  login,
  getCurrentUser,
  passwordProblems,
  SESSION_MAX_AGE_MS,
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
};

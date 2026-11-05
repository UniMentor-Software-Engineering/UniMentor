// Creates an administrator. CU-01 forbids registering as ADMIN, so this is how the first
// admin of a real database is created, without any password stored in the repository.
//
// Usage (from backend/), with DATABASE_URL pointing to the target database:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:create-admin
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const { pool } = require('../config/db');
const userRepository = require('../repositories/userRepository');
const auditLogRepository = require('../repositories/auditLogRepository');
const { passwordProblems, BCRYPT_COST } = require('../services/authService');

const MIN_ADMIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes

async function createAdmin() {
  const { email, password, firstName, lastName } = config.newAdmin;
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD.');
  }
  const problems = passwordProblems(password);
  if (problems.length > 0 || password.length < MIN_ADMIN_PASSWORD_LENGTH || Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    throw new Error(`ADMIN_PASSWORD needs ${MIN_ADMIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_BYTES} characters, with letters and digits.`);
  }

  const user = await userRepository.create({
    firstName,
    lastName,
    email: email.trim().toLowerCase(),
    passwordHash: await bcrypt.hash(password, BCRYPT_COST),
    role: 'ADMIN',
  });
  await auditLogRepository.insert({
    action: 'ADMIN_CREATED',
    targetType: 'USER',
    targetId: user.id,
    details: { source: 'db:create-admin' },
  });
  return user;
}

createAdmin()
  .then((user) => console.log(`Administrator created: ${user.email}`))
  .catch((err) => {
    console.error(err.code === '23505' ? 'That email address is already in use.' : err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

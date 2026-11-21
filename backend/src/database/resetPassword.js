// Sets a new password for an existing account and unlocks it. The application has no
// "change password" screen, so this is how the administrator's password (or any user's,
// on request) is replaced, without storing any password in the repository.
//
// Usage (from backend/), with DATABASE_URL pointing to the target database:
//   RESET_EMAIL=... RESET_PASSWORD=... npm run db:reset-password
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const userRepository = require('../repositories/userRepository');
const auditLogRepository = require('../repositories/auditLogRepository');
const { passwordProblems, BCRYPT_COST } = require('../services/authService');

const MIN_ADMIN_PASSWORD_LENGTH = 12; // same rule as db:create-admin
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes

async function resetPassword() {
  const { email, password } = config.passwordReset;
  if (!email || !password) {
    throw new Error('Set RESET_EMAIL and RESET_PASSWORD.');
  }
  const user = await userRepository.findForLogin(email.trim().toLowerCase());
  if (!user) {
    throw new Error('No account uses that email address.');
  }

  const minLength = user.role === 'ADMIN' ? MIN_ADMIN_PASSWORD_LENGTH : 8;
  if (passwordProblems(password).length > 0 || password.length < minLength || Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    throw new Error(`RESET_PASSWORD needs ${minLength} to ${MAX_PASSWORD_BYTES} characters, with letters and digits.`);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await withTransaction(async (client) => {
    await userRepository.updatePassword(client, user.id, passwordHash);
    await auditLogRepository.insert({
      action: 'PASSWORD_RESET',
      targetType: 'USER',
      targetId: user.id,
      details: { source: 'db:reset-password' },
    }, client);
  });
  return user;
}

resetPassword()
  .then((user) => console.log(`Password changed and account unlocked: ${user.email}`))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

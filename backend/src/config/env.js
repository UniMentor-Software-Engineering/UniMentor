// Loads environment variables once and exposes them as a typed, validated config object.
// Every other module reads configuration from here, never from process.env directly.
require('dotenv').config({ quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// In production a missing variable is a deployment error: fail fast at startup.
const requiredInProduction = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_ORIGIN'];
if (isProduction) {
  const missing = requiredInProduction.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  dbSsl: process.env.DB_SSL === 'true',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  frontendOrigins: (process.env.FRONTEND_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // CU-01, precondition 2: only institutional addresses can register.
  // unimentor.edu is the domain of the seed accounts, so it is only a development default.
  allowedEmailDomains: (process.env.ALLOWED_EMAIL_DOMAINS || (isProduction ? 'myuax.com' : 'myuax.com,unimentor.edu'))
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  // npm run db:seed empties every table, so outside a local database it must be requested.
  allowSeedReset: process.env.ALLOW_SEED_RESET === 'true',
  // npm run db:create-admin (see README, Deployment).
  newAdmin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    firstName: process.env.ADMIN_FIRST_NAME || 'University',
    lastName: process.env.ADMIN_LAST_NAME || 'Administrator',
  },
};

module.exports = config;

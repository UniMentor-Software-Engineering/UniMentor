// Links of the request chain (Chain of Responsibility, Section 4.3.1).
// Each one either calls next() to pass the request on, or throws an AppError,
// which stops the chain and jumps to errorHandler.
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const userRepository = require('../repositories/userRepository');
const AppError = require('../utils/AppError');

/**
 * Authentication. Reads the JWT from the HttpOnly cookie (ADR 4), verifies it and
 * then checks the account in the database on every request (CU-13 business rule):
 * a suspended account is rejected even if its token has not expired yet, and the
 * role comes from the database, so a role change applies immediately.
 * Sets req.user = { id, role }.
 */
async function verifyJWT(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    throw new AppError(401, 'Authentication required.', 'UNAUTHENTICATED');
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Your session has expired. Please sign in again.'
      : 'Invalid session. Please sign in again.';
    throw new AppError(401, message, 'UNAUTHENTICATED');
  }

  const account = await userRepository.findAuthState(payload.sub);
  if (!account) {
    throw new AppError(401, 'Authentication required.', 'UNAUTHENTICATED');
  }
  if (account.status === 'SUSPENDED') {
    throw new AppError(403, 'Your account has been suspended. Please contact administration.', 'ACCOUNT_SUSPENDED');
  }

  req.user = { id: account.id, role: account.role };
  next();
}

/**
 * Authorization. Returns a link that lets the request through only for the given
 * roles, using the values of the user_role ENUM: requireRole('ADMIN'), requireRole('TUTOR').
 * It must come after verifyJWT, which sets req.user.
 */
function requireRole(...allowedRoles) {
  return function checkRole(req, res, next) {
    if (!req.user) {
      throw new AppError(401, 'Authentication required.', 'UNAUTHENTICATED');
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(403, 'You do not have permission to perform this action.', 'FORBIDDEN');
    }
    next();
  };
}

module.exports = { verifyJWT, requireRole };

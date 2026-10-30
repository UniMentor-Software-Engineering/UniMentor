// API layer for CU-01 and CU-02: reads the request, calls authService and writes the
// response, including the session cookie. No business rules and no SQL here.
const config = require('../config/env');
const authService = require('../services/authService');

// ADR 4 / NFR-02: HttpOnly so JavaScript never sees the token. Frontend and API are on
// different sites, so production needs SameSite=None, which browsers only accept with
// Secure. Local development runs over plain HTTP, where Secure cookies are not stored.
function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/',
  };
}

async function register(req, res) {
  const user = await authService.register(req.body);
  res.status(201).json(user);
}

async function login(req, res) {
  const { user, token } = await authService.login(req.body);
  res.cookie('token', token, { ...sessionCookieOptions(), maxAge: authService.SESSION_MAX_AGE_MS });
  res.status(200).json(user);
}

// The browser only deletes the cookie if the attributes match the ones it was set with.
function logout(req, res) {
  res.clearCookie('token', sessionCookieOptions());
  res.status(204).end();
}

// Lets the frontend know, after a page reload, whether there is a session and whose.
async function getMe(req, res) {
  const user = await authService.getCurrentUser(req.user.id);
  res.status(200).json(user);
}

module.exports = { register, login, logout, getMe, sessionCookieOptions };

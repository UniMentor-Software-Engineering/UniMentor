// Attributes of the session cookie, shared by whoever sets it (login) and whoever
// clears it (logout, verifyJWT): a browser only deletes a cookie if they match.
const config = require('../config/env');

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

module.exports = { sessionCookieOptions };

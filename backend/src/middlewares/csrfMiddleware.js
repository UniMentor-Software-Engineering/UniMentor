// CSRF protection with a custom header (ADR 4, NFR-02).
// The session cookie is SameSite=None because the frontend (Vercel) and the API (Render)
// are on different sites, so the browser would also attach it to a forged form or request
// from another site. A cross-site page cannot add a custom header without a CORS preflight,
// and CORS only accepts config.frontendOrigins. frontend/js/api.js sends this header on
// every request. Mounted in app.js for the whole API, so no route can forget it.
const AppError = require('../utils/AppError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    throw new AppError(403, 'Missing CSRF protection header.', 'CSRF');
  }
  next();
}

module.exports = csrfProtection;

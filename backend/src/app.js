// Builds and configures the Express application, without starting the HTTP server.
// Keeping it separate from server.js lets the tests import the app with Supertest.
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const config = require('./config/env');
const apiRoutes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const csrfProtection = require('./middlewares/csrfMiddleware');

const app = express();

// Render terminates HTTPS in a proxy in front of the app; trust it so that
// req.ip and req.secure reflect the real client (needed for audit logs and cookies).
app.set('trust proxy', 1);
app.disable('x-powered-by');

// NFR-02: security headers on every response. The API only serves JSON, so its
// Content-Security-Policy forbids everything; the pages' own CSP is set by Vercel
// (frontend/vercel.json). Cross-origin reads are allowed because the frontend is on
// another site (ADR 4); CORS still decides which origins can read the responses.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ADR 4: the frontend (Vercel) and the API (Render) are on different sites and the JWT
// travels in an HttpOnly cookie, so CORS must allow credentials for the known origins only.
app.use(
  cors({
    origin: config.frontendOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// First link of the chain for every API route: state-changing requests without the
// X-Requested-With header are rejected before touching the database (ADR 4).
app.use('/api', csrfProtection, apiRoutes);

// These two must be registered last.
app.use(notFound);
app.use(errorHandler);

module.exports = app;

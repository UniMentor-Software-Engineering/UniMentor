// Builds and configures the Express application, without starting the HTTP server.
// Keeping it separate from server.js lets the tests import the app with Supertest.
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const config = require('./config/env');
const apiRoutes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Render terminates HTTPS in a proxy in front of the app; trust it so that
// req.ip and req.secure reflect the real client (needed for audit logs and cookies).
app.set('trust proxy', 1);
app.disable('x-powered-by');

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

app.use('/api', apiRoutes);

// These two must be registered last.
app.use(notFound);
app.use(errorHandler);

module.exports = app;

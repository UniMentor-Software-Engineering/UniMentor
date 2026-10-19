// Entry point: starts the HTTP server (npm start / npm run dev).
const app = require('./app');
const config = require('./config/env');
const { pool } = require('./config/db');

const server = app.listen(config.port, () => {
  console.log(`UniMentor API listening on port ${config.port} (${config.nodeEnv})`);
});

// Render sends SIGTERM on every deploy/restart: stop accepting requests,
// let the current ones finish and close the database pool cleanly.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

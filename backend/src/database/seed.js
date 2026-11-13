const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const { pool } = require('../config/db');

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function isLocalDatabase() {
  try {
    return LOCAL_HOSTS.includes(new URL(config.databaseUrl).hostname);
  } catch {
    return false;
  }
}

async function runSeed() {
  // seeds.sql empties every table and creates accounts whose password is public in the README.
  if ((config.isProduction || !isLocalDatabase()) && !config.allowSeedReset) {
    console.error('Refusing to seed: this would erase all the data and create accounts with a public password.');
    console.error('To do it anyway on a demo database, set ALLOW_SEED_RESET=true.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    const seedSql = fs.readFileSync(path.join(__dirname, 'seeds.sql'), 'utf-8');
    console.log('Seeding database with test data...');
    await client.query('BEGIN');
    await client.query(seedSql);
    await client.query('COMMIT');
    console.log('Database seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();

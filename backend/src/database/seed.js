const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function runSeed() {
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
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();
// Tests against a real PostgreSQL (npm run test:db). They need TEST_DATABASE_URL and empty
// that database, so they are kept apart from the normal suite (npm test), which uses mocks.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/db/**/*.test.js'],
  testTimeout: 30000,
};

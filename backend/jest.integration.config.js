/** @type {import('jest').Config} */
// Integration tests: real Express app (supertest) against a real MySQL.
// Email/SMTP is mocked per-test; everything else is exercised end-to-end.
// Requires DB_* env pointing at a disposable database (see CI service + README).
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/integration/**/*.test.js'],
  globalSetup: '<rootDir>/__tests__/integration/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/integration/globalTeardown.js',
  // One shared database/connection pool — run serially for determinism.
  maxWorkers: 1,
  testTimeout: 30000,
};

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  // Integration tests need a live DB and run via jest.integration.config.js.
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/integration/'],
  clearMocks: true,
  // Report coverage only for the units these tests target, so thresholds stay
  // honest (the integration-heavy controllers/models that hit MySQL are out of
  // scope for unit tests).
  collectCoverageFrom: [
    'utils/query.js',
    'utils/ApiError.js',
    'utils/asyncHandler.js',
    'utils/generateToken.js',
    'middleware/authMiddleware.js',
    'controllers/bookingController.js',
    'config/userTypes.js',
  ],
  coverageThreshold: {
    global: { statements: 85, branches: 80, functions: 90, lines: 85 },
  },
};

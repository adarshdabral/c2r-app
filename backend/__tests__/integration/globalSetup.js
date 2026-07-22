// Runs once before the integration suite: ensures the schema exists in the
// target (disposable) database. DB connection details come from DB_* env.
module.exports = async () => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

  const { createTables } = require('../../server');
  await createTables();
};

// Closes the shared MySQL pool so Jest can exit cleanly.
module.exports = async () => {
  const db = require('../../config/db');
  await db.end();
};

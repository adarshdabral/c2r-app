const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Most managed MySQL providers (Aiven, Railway, Clever Cloud, RDS over the
// public internet) require TLS. Enable with DB_SSL=true. Default is OFF so a
// local MySQL is unaffected. Set DB_SSL_REJECT_UNAUTHORIZED=true to enforce a
// verified CA (needs the provider's CA cert); otherwise it accepts the
// provider's certificate without pinning it.
const ssl =
  process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
    : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;

const db = require('../config/db');

const findUserByEmail = async (email) => {
  const [rows] = await db.execute(
    'SELECT id, name, email, password, role, user_type, is_verified, is_suspended, otp, otp_expiry, created_at FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] || null;
};

const findUserById = async (id) => {
  const [rows] = await db.execute(
    'SELECT id, name, email, role, user_type, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
};

const createUser = async ({ name, email, password, role, userType = null, otp, otpExpiry }) => {
  const [result] = await db.execute(
    'INSERT INTO users (name, email, password, role, user_type, otp, otp_expiry, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, email, password, role, userType, otp, otpExpiry, false]
  );
  return result.insertId;
};

const USER_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  email: 'email',
  created_at: 'created_at'
};

const USER_ROLES = ['user', 'recycler', 'admin'];

/* ================= LIST USERS (admin: filter/search/sort/paginate) ================= */
const listUsers = async ({ role, search, sortColumn = 'id', sortOrder = 'DESC', limit = 20, offset = 0 } = {}) => {
  const where = [];
  const values = [];

  if (role) {
    where.push('role = ?');
    values.push(role);
  }
  if (search) {
    where.push('(name LIKE ? OR email LIKE ?)');
    const like = `%${search}%`;
    values.push(like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = USER_SORT_COLUMNS[sortColumn] || USER_SORT_COLUMNS.id;

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, values);
  const [rows] = await db.query(
    `SELECT id, name, email, role, user_type, is_verified, is_suspended, created_at
     FROM users ${whereSql}
     ORDER BY ${orderBy} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return { rows, total };
};

const updateUserRole = async (id, role) => {
  const [result] = await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  return result.affectedRows;
};

const deleteUserById = async (id) => {
  const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows;
};

// Admin account suspension toggle. Suspended users are blocked at login.
const setUserSuspended = async (id, suspended) => {
  const [result] = await db.execute(
    'UPDATE users SET is_suspended = ? WHERE id = ?',
    [suspended ? 1 : 0, id]
  );
  return result.affectedRows;
};

const updateUserProfile = async (id, { name, email }) => {
  const [result] = await db.execute(
    'UPDATE users SET name = ?, email = ? WHERE id = ?',
    [name, email, id]
  );
  return result.affectedRows;
};

const updateUserOTP = async (email, otp, otpExpiry) => {
  const [result] = await db.execute(
    'UPDATE users SET otp = ?, otp_expiry = ? WHERE email = ?',
    [otp, otpExpiry, email]
  );
  return result.affectedRows;
};

const verifyUserOTP = async (email) => {
  const [result] = await db.execute(
    'UPDATE users SET is_verified = true, otp = NULL, otp_expiry = NULL WHERE email = ?',
    [email]
  );
  return result.affectedRows;
};

// Password reset: store a single-use token + expiry, look it up, then swap the
// password and clear the token in one shot so a token can never be reused.
const setResetToken = async (email, token, tokenExpiry) => {
  const [result] = await db.execute(
    'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
    [token, tokenExpiry, email]
  );
  return result.affectedRows;
};

const findUserByResetToken = async (token) => {
  const [rows] = await db.execute(
    'SELECT id, email, reset_token_expiry FROM users WHERE reset_token = ? LIMIT 1',
    [token]
  );
  return rows[0];
};

const updatePasswordByResetToken = async (token, hashedPassword) => {
  const [result] = await db.execute(
    'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE reset_token = ?',
    [hashedPassword, token]
  );
  return result.affectedRows;
};

// Authenticated password change: read the current hash to verify, then swap it.
const getPasswordById = async (id) => {
  const [rows] = await db.execute('SELECT password FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? rows[0].password : null;
};

const updatePasswordById = async (id, hashedPassword) => {
  const [result] = await db.execute(
    'UPDATE users SET password = ? WHERE id = ?',
    [hashedPassword, id]
  );
  return result.affectedRows;
};

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  updateUserProfile,
  updateUserOTP,
  verifyUserOTP,
  setResetToken,
  findUserByResetToken,
  updatePasswordByResetToken,
  getPasswordById,
  updatePasswordById,
  listUsers,
  updateUserRole,
  deleteUserById,
  setUserSuspended,
  USER_ROLES
};
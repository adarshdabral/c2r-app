const db = require('../config/db');

const STATION_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  capacity: 'capacity'
};

/* ================= LIST STATIONS (optional search/sort/paginate) ================= */
const getAllStations = async ({ search, sortColumn = 'id', sortOrder = 'ASC', limit = 50, offset = 0 } = {}) => {
  const where = [];
  const values = [];

  if (search) {
    where.push('(name LIKE ? OR address LIKE ?)');
    const like = `%${search}%`;
    values.push(like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = STATION_SORT_COLUMNS[sortColumn] || STATION_SORT_COLUMNS.id;

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM stations ${whereSql}`, values);
  const [rows] = await db.query(
    `SELECT id, name, latitude, longitude, address, capacity
     FROM stations ${whereSql}
     ORDER BY ${orderBy} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return { rows, total };
};

const getNearestStations = async (lat, lng, limit = 10) => {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const parsedLimit = Number.isInteger(Number(limit)) ? Number(limit) : 10;
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    throw new Error('Invalid coordinates');
  }

  const query = `
    SELECT id, name, address, latitude, longitude,
    (6371 * ACOS(
      COS(RADIANS(?)) * COS(RADIANS(latitude)) *
      COS(RADIANS(longitude) - RADIANS(?)) +
      SIN(RADIANS(?)) * SIN(RADIANS(latitude))
    )) AS distance
    FROM stations
    ORDER BY distance ASC
    LIMIT ?
  `;

  const values = [parsedLat, parsedLng, parsedLat, parsedLimit];
  const [rows] = await db.query(query, values);

  return rows;
};

const findStationById = async (id) => {
  const [rows] = await db.execute(
    'SELECT id, name, latitude, longitude, address, capacity FROM stations WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
};

const createStation = async ({ name, latitude, longitude, address, capacity }) => {
  const [result] = await db.execute(
    'INSERT INTO stations (name, latitude, longitude, address, capacity) VALUES (?, ?, ?, ?, ?)',
    [name, latitude, longitude, address, capacity]
  );
  return result.insertId;
};

const updateStation = async (id, { name, latitude, longitude, address, capacity }) => {
  const [result] = await db.execute(
    `UPDATE stations
     SET name = ?, latitude = ?, longitude = ?, address = ?, capacity = ?
     WHERE id = ?`,
    [name, latitude, longitude, address, capacity, id]
  );
  return result.affectedRows;
};

const deleteStationById = async (id) => {
  const [result] = await db.execute('DELETE FROM stations WHERE id = ?', [id]);
  return result.affectedRows;
};

module.exports = {
  getAllStations,
  getNearestStations,
  findStationById,
  createStation,
  updateStation,
  deleteStationById
};

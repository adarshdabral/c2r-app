const {
  getAllStations,
  getNearestStations: getNearestStationsFromDB,
  findStationById,
  createStation,
  updateStation,
  deleteStationById
} = require('../models/stationModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parsePagination, parseSort, parseSearch, buildMeta, setPaginationHeaders } = require('../utils/query');

const SORT_KEYS = { id: 'id', name: 'name', capacity: 'capacity' };

const parseStationId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Valid station id is required');
  return id;
};

// Shared body validation for create/update.
const validateStationBody = (body) => {
  const { name, latitude, longitude, address, capacity } = body;
  if (!name || !address) throw ApiError.badRequest('name and address are required');
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    throw ApiError.badRequest('latitude and longitude must be valid numbers');
  }
  const cap = Number(capacity);
  return {
    name: String(name).trim(),
    latitude: Number(latitude),
    longitude: Number(longitude),
    address: String(address).trim(),
    capacity: Number.isFinite(cap) && cap >= 0 ? cap : 0
  };
};

const getStations = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });
  const { column, order } = parseSort(req.query, SORT_KEYS, 'id', 'ASC');
  const search = parseSearch(req.query);

  const { rows, total } = await getAllStations({ search, sortColumn: column, sortOrder: order, limit, offset });

  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

const getStationById = asyncHandler(async (req, res) => {
  const station = await findStationById(parseStationId(req.params.id));
  if (!station) throw ApiError.notFound('Station not found');
  return res.status(200).json(station);
});

const getNearestStations = asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw ApiError.badRequest('Valid lat and lng query params are required');
  }

  const stations = await getNearestStationsFromDB(lat, lng);
  return res.status(200).json(
    stations.map((station) => ({
      ...station,
      distance: Number(Number(station.distance).toFixed(2))
    }))
  );
});

const createStationHandler = asyncHandler(async (req, res) => {
  const payload = validateStationBody(req.body);
  const id = await createStation(payload);
  return res.status(201).json({ id, message: 'Station created successfully' });
});

const updateStationHandler = asyncHandler(async (req, res) => {
  const stationId = parseStationId(req.params.id);
  const payload = validateStationBody(req.body);

  const affected = await updateStation(stationId, payload);
  if (!affected) throw ApiError.notFound('Station not found');

  return res.status(200).json({ id: stationId, message: 'Station updated successfully' });
});

const deleteStationHandler = asyncHandler(async (req, res) => {
  const stationId = parseStationId(req.params.id);
  const affected = await deleteStationById(stationId);
  if (!affected) throw ApiError.notFound('Station not found');
  return res.status(200).json({ message: 'Station deleted successfully' });
});

module.exports = {
  getStations,
  getStationById,
  getNearestStations,
  createStation: createStationHandler,
  updateStation: updateStationHandler,
  deleteStation: deleteStationHandler
};

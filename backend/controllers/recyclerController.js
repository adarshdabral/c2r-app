const { getNearestStores } = require('../models/storeModel');
const { remainingCapacity, hasCapacity } = require('../models/storeModel');

// Legacy alias for GET /api/recyclers/nearest. Recycler location no longer lives
// on the user row — search now targets stores. Kept so older clients keep
// working; new clients should call GET /api/stores/nearest.
const getNearest = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const limit = Number(req.query.limit) || 20;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'Valid lat and lng query params are required' });
    }

    const { rows: stores } = await getNearestStores(lat, lng, { limit });
    const result = stores.map((s) => ({
      id: s.id,
      recyclerId: s.recyclerId,
      name: s.storeName,
      storeName: s.storeName,
      address: s.address,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      distance: Number(Number(s.distance).toFixed(2)),
      remainingCapacityKg: remainingCapacity(s),
      hasCapacity: hasCapacity(s)
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error('[getNearestStores]', error);
    return res.status(500).json({ message: 'Failed to fetch nearest stores' });
  }
};

module.exports = { getNearest };

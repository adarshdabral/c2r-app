const express = require('express');

const {
  getStations,
  getStationById,
  getNearestStations,
  createStation,
  updateStation,
  deleteStation
} = require('../controllers/stationController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', getStations);
router.get('/nearest', getNearestStations);
router.get('/:id', getStationById);
router.post('/', protect, requireRole('admin'), createStation);
router.put('/:id', protect, requireRole('admin'), updateStation);
router.delete('/:id', protect, requireRole('admin'), deleteStation);

module.exports = router;

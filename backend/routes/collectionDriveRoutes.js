const express = require('express');
const { protect, requireRole } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/collectionDriveController');

const router = express.Router();

router.use(protect);

// Static paths before /:id.
router.get('/mine', requireRole('user'), ctrl.mine);
router.get('/hosting', requireRole('recycler', 'admin'), ctrl.hosting);
router.get('/hosting/analytics', requireRole('recycler', 'admin'), ctrl.hostingAnalytics);

router.get('/', ctrl.list);
router.post('/', requireRole('recycler', 'admin'), ctrl.create);

router.get('/:id', ctrl.getOne);
router.patch('/:id/status', requireRole('recycler', 'admin'), ctrl.setStatus);
router.post('/:id/rsvp', requireRole('user'), ctrl.rsvp);
router.delete('/:id/rsvp', requireRole('user'), ctrl.cancelRsvp);
router.get('/:id/attendees', requireRole('recycler', 'admin'), ctrl.attendees);

// Attendance / QR check-in + analytics.
router.get('/:id/my-qr', requireRole('user'), ctrl.myQr);
router.post('/:id/check-in', requireRole('recycler', 'admin'), ctrl.checkIn);
router.get('/:id/analytics', requireRole('recycler', 'admin'), ctrl.driveAnalytics);

// Drive completion report (host | admin).
router.get('/:id/report', requireRole('recycler', 'admin'), ctrl.getReport);
router.post('/:id/report', requireRole('recycler', 'admin'), ctrl.generateReport);
router.get('/:id/report/download', requireRole('recycler', 'admin'), ctrl.downloadReport);

module.exports = router;

const express = require('express');
const { protect, requireRole } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/siteContentController');

const router = express.Router();

// ---- Public (no auth): the home/marketing surface + media bytes ----
router.get('/', ctrl.getPublicContent);
router.get('/media/:key', ctrl.getSettingMedia);
router.get('/items/:id/media', ctrl.getItemMedia);

// ---- Admin CRUD ----
router.put('/settings/:key', protect, requireRole('admin'), ctrl.putSetting);
router.get('/admin/items/:collection', protect, requireRole('admin'), ctrl.listItemsAdmin);
router.post('/admin/items/:collection', protect, requireRole('admin'), ctrl.createItem);
router.patch('/admin/items/:id', protect, requireRole('admin'), ctrl.updateItem);
router.delete('/admin/items/:id', protect, requireRole('admin'), ctrl.deleteItem);

module.exports = router;

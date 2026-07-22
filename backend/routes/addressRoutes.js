const express = require('express');

const { list, create, update, makeDefault, remove } = require('../controllers/addressController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Saved addresses belong to citizens (role 'user').
router.use(protect, requireRole('user'));

router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.patch('/:id/default', makeDefault);
router.delete('/:id', remove);

module.exports = router;

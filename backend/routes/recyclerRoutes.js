const express = require('express');
const { getNearest } = require('../controllers/recyclerController');

const router = express.Router();

router.get('/nearest', getNearest);

module.exports = router;

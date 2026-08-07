const express = require('express');
const { getFeatures } = require('../controllers/featureController');

const router = express.Router();

// Public read of the resolved flag map — safe to expose (booleans only) and
// needed before auth so the login/landing UI can already respect the flags.
router.get('/', getFeatures);

module.exports = router;

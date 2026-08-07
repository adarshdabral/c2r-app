const asyncHandler = require('../utils/asyncHandler');
const { getTaxonomy } = require('../models/ewasteModel');

// GET /api/ewaste/categories — the full category→appliance taxonomy for the
// booking selector. Any authenticated user.
const getCategories = asyncHandler(async (req, res) => {
  res.json({ categories: await getTaxonomy() });
});

module.exports = { getCategories };

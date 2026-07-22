const ApiError = require('./ApiError');

/**
 * Normalise a scheduling payload's e-waste categories into a validated,
 * de-duplicated array. Users may now select MULTIPLE categories per pickup /
 * drop-off (one total quantity).
 *
 * Accepts either the multi-select `wasteCategories` (array) or the legacy single
 * `wasteCategory` (a string, possibly already comma-joined) so older clients and
 * stored rows keep working. Throws ApiError.badRequest on empty / unknown values.
 *
 * @param {object} input     request body (uses wasteCategories ?? wasteCategory)
 * @param {string[]} allowed  the master WASTE_TYPES list
 * @returns {string[]} validated, de-duplicated categories (order preserved)
 */
const normalizeWasteCategories = (input = {}, allowed = []) => {
  const raw = input.wasteCategories != null ? input.wasteCategories : input.wasteCategory;
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const cats = [...new Set(list.map((c) => String(c).trim()).filter(Boolean))];

  if (cats.length === 0) {
    throw ApiError.badRequest('At least one e-waste category is required');
  }
  const invalid = cats.filter((c) => !allowed.includes(c));
  if (invalid.length) {
    throw ApiError.badRequest(
      `Invalid e-waste category: ${invalid.join(', ')}. Must be one of: ${allowed.join(', ')}`
    );
  }
  return cats;
};

module.exports = { normalizeWasteCategories };

// Segmentation categories for role='user'. Extend by appending a string;
// no controller, model, or middleware change is required.
// Keep in sync with frontend/lib/userTypes.ts.
// Personas: Consumer→individual, Organization→small_business, Bulk Producer→
// bulk_producer. 'manufacturer' is the one new persona (product/EPR features).
const USER_TYPES = ['individual', 'small_business', 'bulk_producer', 'manufacturer'];

const DEFAULT_USER_TYPE = 'individual';

const isValidUserType = (value) => USER_TYPES.includes(value);

module.exports = { USER_TYPES, DEFAULT_USER_TYPE, isValidUserType };

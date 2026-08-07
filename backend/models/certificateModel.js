const db = require('../config/db');

/** Data Sanitization Certificates — one per request, PDF stored as base64. */

const create = async (c) => {
  await db.execute(
    `INSERT INTO certificates
      (request_type, request_id, certificate_no, verification_id, recycler_id,
       sanitization_method, sanitized_on, authorised_person, designation, pdf_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.requestType, c.requestId, c.certificateNo, c.verificationId, c.recyclerId ?? null,
      c.sanitizationMethod, c.sanitizedOn, c.authorisedPerson, c.designation ?? null, c.pdfData,
    ]
  );
};

const META_COLS =
  'id, request_type, request_id, certificate_no, verification_id, recycler_id, ' +
  "sanitization_method, DATE_FORMAT(sanitized_on, '%Y-%m-%d') AS sanitized_on, " +
  'authorised_person, designation, created_at';

const getByRequest = async (requestType, requestId) => {
  const [rows] = await db.query(
    `SELECT ${META_COLS} FROM certificates WHERE request_type = ? AND request_id = ? LIMIT 1`,
    [requestType, requestId]
  );
  return rows[0] || null;
};

const getPdf = async (requestType, requestId) => {
  const [rows] = await db.query(
    'SELECT certificate_no, pdf_data FROM certificates WHERE request_type = ? AND request_id = ? LIMIT 1',
    [requestType, requestId]
  );
  return rows[0] || null;
};

const getByVerificationId = async (verificationId) => {
  const [rows] = await db.query(
    `SELECT ${META_COLS} FROM certificates WHERE verification_id = ? LIMIT 1`,
    [verificationId]
  );
  return rows[0] || null;
};

module.exports = { create, getByRequest, getPdf, getByVerificationId };

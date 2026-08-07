const db = require('../config/db');

const META =
  'id, drive_id, report_no, generated_by, attendee_count, created_at';

const upsert = async (r) => {
  await db.execute(
    `INSERT INTO collection_drive_reports
      (drive_id, report_no, generated_by, attendee_count, pdf_data, xls_data)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       report_no = VALUES(report_no),
       generated_by = VALUES(generated_by),
       attendee_count = VALUES(attendee_count),
       pdf_data = VALUES(pdf_data),
       xls_data = VALUES(xls_data)`,
    [r.driveId, r.reportNo, r.generatedBy ?? null, r.attendeeCount, r.pdfData, r.xlsData]
  );
};

const getByDrive = async (driveId) => {
  const [rows] = await db.query(
    `SELECT ${META} FROM collection_drive_reports WHERE drive_id = ? LIMIT 1`,
    [driveId]
  );
  return rows[0] || null;
};

const getFiles = async (driveId) => {
  const [rows] = await db.query(
    'SELECT report_no, pdf_data, xls_data FROM collection_drive_reports WHERE drive_id = ? LIMIT 1',
    [driveId]
  );
  return rows[0] || null;
};

module.exports = { upsert, getByDrive, getFiles };

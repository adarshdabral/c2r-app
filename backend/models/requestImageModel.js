const db = require('../config/db');

/**
 * Base64 image storage for a pickup/drop-off request. `uploaded_by` separates
 * the user's "before" images from the recycler's "collected waste" images.
 * Stored in the DB (not the filesystem) so images survive Render redeploys.
 */

const addImages = async (requestType, requestId, uploadedBy, uploaderId, images) => {
  for (const im of images) {
    await db.execute(
      `INSERT INTO request_images (request_type, request_id, uploaded_by, uploader_id, mime_type, data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [requestType, requestId, uploadedBy, uploaderId ?? null, im.mimeType, im.data]
    );
  }
};

const countImages = async (requestType, requestId, uploadedBy) => {
  const [[{ n }]] = await db.query(
    'SELECT COUNT(*) AS n FROM request_images WHERE request_type = ? AND request_id = ? AND uploaded_by = ?',
    [requestType, requestId, uploadedBy]
  );
  return n;
};

/** Both image sets for a request as ready-to-render data URLs, grouped by side. */
const getGrouped = async (requestType, requestId) => {
  const [rows] = await db.query(
    `SELECT id, uploaded_by, mime_type, data, created_at
     FROM request_images WHERE request_type = ? AND request_id = ? ORDER BY id`,
    [requestType, requestId]
  );
  const toItem = (r) => ({
    id: r.id,
    dataUrl: `data:${r.mime_type};base64,${r.data}`,
    createdAt: r.created_at,
  });
  return {
    user: rows.filter((r) => r.uploaded_by === 'user').map(toItem),
    recycler: rows.filter((r) => r.uploaded_by === 'recycler').map(toItem),
  };
};

const deleteImage = async (id, requestType, requestId, uploadedBy) => {
  const [res] = await db.execute(
    'DELETE FROM request_images WHERE id = ? AND request_type = ? AND request_id = ? AND uploaded_by = ?',
    [id, requestType, requestId, uploadedBy]
  );
  return res.affectedRows > 0;
};

module.exports = { addImages, countImages, getGrouped, deleteImage };

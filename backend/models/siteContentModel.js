const db = require('../config/db');

/**
 * Website content CMS storage.
 *
 * Two shapes:
 *  - Singletons (`site_settings`): one row per key — hero video, impact image,
 *    hero heading/subheading, etc. Media is base64 in `media_data`.
 *  - Collections (`site_media_items`): ordered lists — the home carousel and the
 *    FAQ gallery. Each item is an image (base64) with an optional caption; FAQ
 *    items may also carry a question/answer in title/body.
 *
 * Media payloads (base64 data URLs) are never returned in list shapes — only the
 * presence of media is signalled. Bytes are served on a dedicated media route so
 * list responses stay small.
 */

// Whitelisted singleton keys — anything else is rejected at the model boundary.
const SETTING_KEYS = ['hero_video', 'impact_image', 'hero_heading', 'hero_subheading'];
const COLLECTIONS = ['carousel', 'faq_gallery'];

const isSettingKey = (k) => SETTING_KEYS.includes(k);
const isCollection = (c) => COLLECTIONS.includes(c);

/* ----------------------------- Singletons ----------------------------- */

// Public/light shape: text + whether media exists + its type, but not the bytes.
const mapSetting = (row) => ({
  key: row.setting_key,
  text: row.text_value,
  hasMedia: !!row.media_data,
  mediaType: row.media_type || null,
  updatedAt: row.updated_at
});

const getAllSettings = async () => {
  const [rows] = await db.query(
    `SELECT setting_key, text_value, media_type, updated_at,
            (media_data IS NOT NULL) AS has_media
       FROM site_settings`
  );
  return rows.map((r) => ({
    key: r.setting_key,
    text: r.text_value,
    hasMedia: !!r.has_media,
    mediaType: r.media_type || null,
    updatedAt: r.updated_at
  }));
};

const getSetting = async (key) => {
  const [rows] = await db.query(
    `SELECT setting_key, text_value, media_type, updated_at,
            (media_data IS NOT NULL) AS has_media
       FROM site_settings WHERE setting_key = ? LIMIT 1`,
    [key]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    key: r.setting_key,
    text: r.text_value,
    hasMedia: !!r.has_media,
    mediaType: r.media_type || null,
    updatedAt: r.updated_at
  };
};

// Returns { mediaData, mediaType } or null — used by the media-serving route.
const getSettingMedia = async (key) => {
  const [rows] = await db.query(
    'SELECT media_data, media_type FROM site_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  if (!rows[0] || !rows[0].media_data) return null;
  return { mediaData: rows[0].media_data, mediaType: rows[0].media_type || null };
};

// Upsert a singleton. `patch` may include text, mediaData, mediaType. Only the
// provided fields are written (COALESCE keeps existing values on update), so a
// caption edit doesn't wipe the image and vice versa.
const upsertSetting = async (key, { text, mediaData, mediaType, updatedBy } = {}) => {
  await db.execute(
    `INSERT INTO site_settings (setting_key, text_value, media_data, media_type, updated_by)
       VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       text_value = COALESCE(VALUES(text_value), text_value),
       media_data = COALESCE(VALUES(media_data), media_data),
       media_type = COALESCE(VALUES(media_type), media_type),
       updated_by = VALUES(updated_by)`,
    [
      key,
      text ?? null,
      mediaData ?? null,
      mediaType ?? null,
      updatedBy ?? null
    ]
  );
  return getSetting(key);
};

/* ---------------------------- Collections ---------------------------- */

const mapItem = (row) => ({
  id: row.id,
  collection: row.collection,
  title: row.title,
  body: row.body,
  hasMedia: !!row.has_media,
  mediaType: row.media_type || null,
  linkUrl: row.link_url,
  sortOrder: row.sort_order,
  isActive: !!row.is_active,
  createdAt: row.created_at
});

// `activeOnly` filters to published items (public read); admins see everything.
const listItems = async (collection, { activeOnly = false } = {}) => {
  const where = ['collection = ?'];
  const params = [collection];
  if (activeOnly) where.push('is_active = TRUE');
  const [rows] = await db.query(
    `SELECT id, collection, title, body, media_type, link_url, sort_order,
            is_active, created_at, (media_data IS NOT NULL) AS has_media
       FROM site_media_items
      WHERE ${where.join(' AND ')}
      ORDER BY sort_order ASC, id ASC`,
    params
  );
  return rows.map(mapItem);
};

const getItem = async (id) => {
  const [rows] = await db.query(
    `SELECT id, collection, title, body, media_type, link_url, sort_order,
            is_active, created_at, (media_data IS NOT NULL) AS has_media
       FROM site_media_items WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? mapItem(rows[0]) : null;
};

const getItemMedia = async (id) => {
  const [rows] = await db.query(
    'SELECT media_data, media_type FROM site_media_items WHERE id = ? LIMIT 1',
    [id]
  );
  if (!rows[0] || !rows[0].media_data) return null;
  return { mediaData: rows[0].media_data, mediaType: rows[0].media_type || null };
};

const createItem = async (item) => {
  const [res] = await db.execute(
    `INSERT INTO site_media_items
      (collection, title, body, media_data, media_type, link_url, sort_order, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.collection,
      item.title ?? null,
      item.body ?? null,
      item.mediaData ?? null,
      item.mediaType ?? null,
      item.linkUrl ?? null,
      item.sortOrder ?? 0,
      item.isActive === undefined ? true : !!item.isActive,
      item.createdBy ?? null
    ]
  );
  return getItem(res.insertId);
};

// Partial update. Only keys present in `patch` are written. Passing mediaData
// replaces the image; omitting it leaves the existing image untouched.
const updateItem = async (id, patch = {}) => {
  const sets = [];
  const params = [];
  const map = {
    title: 'title',
    body: 'body',
    mediaData: 'media_data',
    mediaType: 'media_type',
    linkUrl: 'link_url',
    sortOrder: 'sort_order',
    isActive: 'is_active'
  };
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(key === 'isActive' ? !!patch[key] : patch[key]);
    }
  }
  if (!sets.length) return getItem(id);
  params.push(id);
  await db.execute(`UPDATE site_media_items SET ${sets.join(', ')} WHERE id = ?`, params);
  return getItem(id);
};

const deleteItem = async (id) => {
  const [res] = await db.execute('DELETE FROM site_media_items WHERE id = ?', [id]);
  return res.affectedRows > 0;
};

module.exports = {
  SETTING_KEYS,
  COLLECTIONS,
  isSettingKey,
  isCollection,
  getAllSettings,
  getSetting,
  getSettingMedia,
  upsertSetting,
  listItems,
  getItem,
  getItemMedia,
  createItem,
  updateItem,
  deleteItem
};

const db = require('../config/db');

/**
 * The CPCB e-waste taxonomy (data-driven): active categories, each with its
 * active appliances/items, ordered. Backs the category→appliance selector.
 */
const getTaxonomy = async () => {
  const [cats] = await db.query(
    'SELECT id, name, code FROM ewaste_categories WHERE is_active = 1 ORDER BY sort_order, name'
  );
  const [items] = await db.query(
    'SELECT id, category_id, name FROM ewaste_items WHERE is_active = 1 ORDER BY sort_order, name'
  );
  const byCat = new Map();
  for (const it of items) {
    if (!byCat.has(it.category_id)) byCat.set(it.category_id, []);
    byCat.get(it.category_id).push({ id: it.id, name: it.name });
  }
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    items: byCat.get(c.id) || [],
  }));
};

/**
 * Validate + normalise incoming selections against the live taxonomy so we never
 * store bogus ids/names. Accepts `[{ categoryId, itemIds: [id,...] }]` (or a
 * single `itemId`). A category with no items = a whole-category selection. Bad
 * ids are skipped (backward-compatible). Returns
 * `[{ categoryId, categoryName, itemId, itemName }]`.
 */
const normalizeSelections = async (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const taxonomy = await getTaxonomy();
  const catById = new Map(taxonomy.map((c) => [c.id, c]));
  const out = [];
  for (const sel of raw) {
    const cat = catById.get(Number(sel?.categoryId));
    if (!cat) continue;
    const itemIds = Array.isArray(sel.itemIds)
      ? sel.itemIds
      : sel.itemId != null
        ? [sel.itemId]
        : [];
    if (itemIds.length === 0) {
      out.push({ categoryId: cat.id, categoryName: cat.name, itemId: null, itemName: null });
      continue;
    }
    for (const iid of itemIds) {
      const item = cat.items.find((it) => it.id === Number(iid));
      if (item) {
        out.push({ categoryId: cat.id, categoryName: cat.name, itemId: item.id, itemName: item.name });
      }
    }
  }
  return out;
};

/** Persist normalised selections for a request. Optional connection for txns. */
const setRequestItems = async (requestType, requestId, selections, conn = db) => {
  if (!Array.isArray(selections) || selections.length === 0) return;
  for (const s of selections) {
    await conn.execute(
      `INSERT INTO request_items (request_type, request_id, category_id, item_id, category_name, item_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [requestType, requestId, s.categoryId, s.itemId ?? null, s.categoryName, s.itemName ?? null]
    );
  }
};

/**
 * Selected items for a request, grouped by category for display:
 * `[{ categoryId, categoryName, items: [{ id, name }] }]`.
 */
const getRequestItems = async (requestType, requestId) => {
  const [rows] = await db.query(
    `SELECT category_id, category_name, item_id, item_name
     FROM request_items WHERE request_type = ? AND request_id = ? ORDER BY id`,
    [requestType, requestId]
  );
  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.category_id)) {
      byCat.set(r.category_id, { categoryId: r.category_id, categoryName: r.category_name, items: [] });
    }
    if (r.item_id != null) byCat.get(r.category_id).items.push({ id: r.item_id, name: r.item_name });
  }
  return [...byCat.values()];
};

/**
 * Attach `items` (grouped by category) to many already-mapped request objects in
 * a single query — avoids N+1 in list endpoints. Mutates + returns `rows`.
 */
const attachItemsToMany = async (requestType, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const ids = rows.map((r) => r.id).filter((v) => v != null);
  if (ids.length === 0) return rows;
  const placeholders = ids.map(() => '?').join(',');
  const [items] = await db.query(
    `SELECT request_id, category_id, category_name, item_id, item_name
     FROM request_items
     WHERE request_type = ? AND request_id IN (${placeholders}) ORDER BY id`,
    [requestType, ...ids]
  );
  const byReq = new Map();
  for (const it of items) {
    if (!byReq.has(it.request_id)) byReq.set(it.request_id, new Map());
    const cm = byReq.get(it.request_id);
    if (!cm.has(it.category_id)) {
      cm.set(it.category_id, { categoryId: it.category_id, categoryName: it.category_name, items: [] });
    }
    if (it.item_id != null) cm.get(it.category_id).items.push({ id: it.item_id, name: it.item_name });
  }
  for (const r of rows) {
    r.items = byReq.has(r.id) ? [...byReq.get(r.id).values()] : [];
  }
  return rows;
};

module.exports = {
  getTaxonomy,
  normalizeSelections,
  setRequestItems,
  getRequestItems,
  attachItemsToMany,
};

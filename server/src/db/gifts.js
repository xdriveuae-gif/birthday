function mapGiftRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listAllGifts(db) {
  return db.prepare('SELECT * FROM gifts ORDER BY created_at DESC, id DESC').all().map(mapGiftRow);
}

export function listActiveGifts(db) {
  return db.prepare('SELECT * FROM gifts WHERE active = 1 ORDER BY id ASC').all().map(mapGiftRow);
}

export function getGiftById(db, id) {
  return mapGiftRow(db.prepare('SELECT * FROM gifts WHERE id = ?').get(id));
}

export function createGift(db, { name, imageUrl, productUrl, active }) {
  const result = db
    .prepare('INSERT INTO gifts (name, image_url, product_url, active) VALUES (?, ?, ?, ?)')
    .run(name, imageUrl ?? null, productUrl, active ? 1 : 0);
  return getGiftById(db, result.lastInsertRowid);
}

export function updateGift(db, id, { name, imageUrl, productUrl, active }) {
  db.prepare(
    `UPDATE gifts SET name = ?, image_url = ?, product_url = ?, active = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, imageUrl ?? null, productUrl, active ? 1 : 0, id);
  return getGiftById(db, id);
}

export function setGiftActive(db, id, active) {
  db.prepare(`UPDATE gifts SET active = ?, updated_at = datetime('now') WHERE id = ?`).run(active ? 1 : 0, id);
  return getGiftById(db, id);
}

export function deleteGift(db, id) {
  db.prepare('DELETE FROM gifts WHERE id = ?').run(id);
}

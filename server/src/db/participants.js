function mapParticipantRow(row) {
  return {
    id: row.id,
    name: row.name,
    giftId: row.gift_id,
    giftName: row.gift_name ?? null,
    giftImageUrl: row.gift_image_url ?? null,
    createdAt: row.created_at,
  };
}

export function listWonGiftIds(db) {
  return new Set(db.prepare('SELECT DISTINCT gift_id FROM participants').all().map((r) => r.gift_id));
}

export function insertParticipant(db, { name, giftId }) {
  const result = db.prepare('INSERT INTO participants (name, gift_id) VALUES (?, ?)').run(name, giftId);
  const row = db.prepare('SELECT * FROM participants WHERE id = ?').get(result.lastInsertRowid);
  return mapParticipantRow(row);
}

export function listParticipants(db, { sort = 'newest', search = '' } = {}) {
  const order = sort === 'oldest' ? 'ASC' : 'DESC';
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.gift_id, p.created_at, g.name AS gift_name, g.image_url AS gift_image_url
       FROM participants p
       LEFT JOIN gifts g ON g.id = p.gift_id
       WHERE p.name LIKE ?
       ORDER BY p.created_at ${order}, p.id ${order}`
    )
    .all(`%${search}%`);
  return rows.map(mapParticipantRow);
}

export function countParticipants(db) {
  return db.prepare('SELECT COUNT(*) AS count FROM participants').get().count;
}

export function deleteParticipant(db, id) {
  db.prepare('DELETE FROM participants WHERE id = ?').run(id);
}

export function deleteAllParticipants(db) {
  db.prepare('DELETE FROM participants').run();
}

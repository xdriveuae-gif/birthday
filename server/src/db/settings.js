export function getAllSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    allowRepeatGifts: map.allow_repeat_gifts === 'true',
    wheelEnabled: map.wheel_enabled === 'true',
    cliqAlias: map.cliq_alias ?? 'OH98',
  };
}

export function updateSettings(db, { allowRepeatGifts, wheelEnabled, cliqAlias } = {}) {
  const stmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  if (allowRepeatGifts !== undefined) stmt.run(allowRepeatGifts ? 'true' : 'false', 'allow_repeat_gifts');
  if (wheelEnabled !== undefined) stmt.run(wheelEnabled ? 'true' : 'false', 'wheel_enabled');
  if (cliqAlias !== undefined) stmt.run(cliqAlias, 'cliq_alias');
  return getAllSettings(db);
}

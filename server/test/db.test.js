import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, seedAdminIfEmpty, runInTransaction } from '../src/db/index.js';
import { getAllSettings, updateSettings } from '../src/db/settings.js';

test('initDb creates tables and seeds default settings', () => {
  const db = initDb(':memory:');
  const settings = getAllSettings(db);
  assert.deepEqual(settings, { allowRepeatGifts: false, wheelEnabled: true, cliqAlias: 'OH98' });
});

test('getAllSettings includes cliqAlias, updateSettings can change it', () => {
  const db = initDb(':memory:');
  assert.equal(getAllSettings(db).cliqAlias, 'OH98');
  updateSettings(db, { cliqAlias: 'AB12' });
  assert.equal(getAllSettings(db).cliqAlias, 'AB12');
  assert.equal(getAllSettings(db).wheelEnabled, true);
});

test('initDb can be called on a fresh :memory: db without error', () => {
  assert.doesNotThrow(() => initDb(':memory:'));
});

test('updateSettings updates only provided keys', () => {
  const db = initDb(':memory:');
  updateSettings(db, { allowRepeatGifts: true });
  assert.deepEqual(getAllSettings(db), { allowRepeatGifts: true, wheelEnabled: true, cliqAlias: 'OH98' });
  updateSettings(db, { wheelEnabled: false });
  assert.deepEqual(getAllSettings(db), { allowRepeatGifts: true, wheelEnabled: false, cliqAlias: 'OH98' });
});

test('seedAdminIfEmpty inserts once and skips on second call', () => {
  const db = initDb(':memory:');
  const firstInsert = seedAdminIfEmpty(db, 'admin', 'hash-a');
  const secondInsert = seedAdminIfEmpty(db, 'someone-else', 'hash-b');
  assert.equal(firstInsert, true);
  assert.equal(secondInsert, false);
  const row = db.prepare('SELECT username, password_hash FROM admin_users').get();
  assert.equal(row.username, 'admin');
  assert.equal(row.password_hash, 'hash-a');
});

test('runInTransaction commits on success', () => {
  const db = initDb(':memory:');
  const result = runInTransaction(db, () => {
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('a', 'h');
    return 'ok';
  });
  assert.equal(result, 'ok');
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM admin_users').get();
  assert.equal(count, 1);
});

test('runInTransaction rolls back on thrown error and rethrows', () => {
  const db = initDb(':memory:');
  assert.throws(() => {
    runInTransaction(db, () => {
      db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('a', 'h');
      throw new Error('boom');
    });
  }, /boom/);
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM admin_users').get();
  assert.equal(count, 0);
});

test('initDb seeds a default cliq_alias setting', () => {
  const db = initDb(':memory:');
  const row = db.prepare("SELECT value FROM settings WHERE key = 'cliq_alias'").get();
  assert.equal(row.value, 'OH98');
});

test('participants.gift_id is nullable and outcome defaults to gift', () => {
  const db = initDb(':memory:');
  const gift = db
    .prepare('INSERT INTO gifts (name, product_url, active) VALUES (?, ?, ?)')
    .run('AirPods', 'https://example.com/airpods', 1);
  db.prepare('INSERT INTO participants (name, gift_id) VALUES (?, ?)').run('Ahmad', gift.lastInsertRowid);
  db.prepare('INSERT INTO participants (name, gift_id) VALUES (?, ?)').run('Sara', null);
  const rows = db.prepare('SELECT name, gift_id, outcome FROM participants ORDER BY id').all();
  assert.equal(rows[0].outcome, 'gift');
  assert.equal(rows[1].gift_id, null);
  assert.equal(rows[1].outcome, 'gift');
});

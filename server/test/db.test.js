import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, seedAdminIfEmpty, runInTransaction } from '../src/db/index.js';
import { getAllSettings, updateSettings } from '../src/db/settings.js';

test('initDb creates tables and seeds default settings', () => {
  const db = initDb(':memory:');
  const settings = getAllSettings(db);
  assert.deepEqual(settings, { allowRepeatGifts: false, wheelEnabled: true });
});

test('initDb can be called on a fresh :memory: db without error', () => {
  assert.doesNotThrow(() => initDb(':memory:'));
});

test('updateSettings updates only provided keys', () => {
  const db = initDb(':memory:');
  updateSettings(db, { allowRepeatGifts: true });
  assert.deepEqual(getAllSettings(db), { allowRepeatGifts: true, wheelEnabled: true });
  updateSettings(db, { wheelEnabled: false });
  assert.deepEqual(getAllSettings(db), { allowRepeatGifts: true, wheelEnabled: false });
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

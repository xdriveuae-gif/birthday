import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initDb, seedAdminIfEmpty, runInTransaction } from '../src/db/index.js';
import { getAllSettings, updateSettings } from '../src/db/settings.js';
import { insertParticipant, listParticipants } from '../src/db/participants.js';

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

test('initDb migrates a pre-existing database with the old participants schema', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bday-migration-'));
  const dbPath = path.join(root, 'app.db');

  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`
    CREATE TABLE gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_url TEXT,
      product_url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gift_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const gift = oldDb.prepare('INSERT INTO gifts (name, product_url, active) VALUES (?, ?, ?)').run('Mouse', 'https://example.com/mouse', 1);
  oldDb.prepare('INSERT INTO participants (name, gift_id) VALUES (?, ?)').run('OldRecord', gift.lastInsertRowid);
  oldDb.close();

  const db = initDb(dbPath);

  const columns = db.prepare('PRAGMA table_info(participants)').all();
  const outcomeColumn = columns.find((c) => c.name === 'outcome');
  const giftIdColumn = columns.find((c) => c.name === 'gift_id');
  assert.ok(outcomeColumn);
  assert.equal(giftIdColumn.notnull, 0);

  const rows = listParticipants(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'OldRecord');
  assert.equal(rows[0].outcome, 'gift');

  const cashParticipant = insertParticipant(db, { name: 'CashPerson', outcome: 'cash' });
  assert.equal(cashParticipant.giftId, null);

  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

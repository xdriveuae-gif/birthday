import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function initDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_url TEXT,
      product_url TEXT NOT NULL,
      price TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gift_id INTEGER REFERENCES gifts(id),
      outcome TEXT NOT NULL DEFAULT 'gift',
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
  `);
  const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertDefault.run('allow_repeat_gifts', 'false');
  insertDefault.run('wheel_enabled', 'true');
  insertDefault.run('cliq_alias', 'OH98');
  migrateParticipantsTable(db);
  migrateGiftsTable(db);
  migrateParticipantsSessionId(db);
  return db;
}

function migrateParticipantsSessionId(db) {
  const columns = db.prepare('PRAGMA table_info(participants)').all();
  const hasSessionId = columns.some((c) => c.name === 'session_id');
  if (hasSessionId) return;
  db.exec('ALTER TABLE participants ADD COLUMN session_id TEXT');
}

function migrateGiftsTable(db) {
  const columns = db.prepare('PRAGMA table_info(gifts)').all();
  const hasPrice = columns.some((c) => c.name === 'price');
  if (hasPrice) return;
  db.exec('ALTER TABLE gifts ADD COLUMN price TEXT');
}

function migrateParticipantsTable(db) {
  const columns = db.prepare('PRAGMA table_info(participants)').all();
  const hasOutcome = columns.some((c) => c.name === 'outcome');
  const giftIdColumn = columns.find((c) => c.name === 'gift_id');
  const giftIdIsNullable = !giftIdColumn || giftIdColumn.notnull === 0;
  if (hasOutcome && giftIdIsNullable) return;

  db.exec(`
    CREATE TABLE participants_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gift_id INTEGER REFERENCES gifts(id),
      outcome TEXT NOT NULL DEFAULT 'gift',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO participants_migrated (id, name, gift_id, outcome, created_at)
      SELECT id, name, gift_id, 'gift', created_at FROM participants;
    DROP TABLE participants;
    ALTER TABLE participants_migrated RENAME TO participants;
  `);
}

export function runInTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function seedAdminIfEmpty(db, username, passwordHash) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM admin_users').get();
  if (count > 0) return false;
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  return true;
}

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// The host runs multiple Node processes against this same SQLite file on
// startup, racing to create/migrate the schema. node:sqlite's busy_timeout
// does not reliably unblock once the lock holder releases it (verified
// empirically — a waiting connection can block for the full timeout and
// still throw), so retry each startup write ourselves with a real backoff
// instead of relying on it.
function withLockRetry(fn, { retries = 30, delayMs = 150 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (err) {
      const isBusy = err?.errcode === 5 || /locked|busy/i.test(err?.message ?? '');
      if (!isBusy || attempt >= retries) throw err;
      // Jitter: multiple processes starting within milliseconds of each
      // other would otherwise retry in lockstep and keep re-colliding.
      const jitteredDelay = delayMs + Math.floor(Math.random() * delayMs);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, jitteredDelay);
    }
  }
}

export function initDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  // A small native cushion on top of our own retry loop above — harmless,
  // but kept short since our outer retries already provide the real backoff.
  db.exec('PRAGMA busy_timeout = 200');
  // WAL mode relies on shared-memory (mmap) and proper advisory file locking,
  // which SQLite's own docs warn is unreliable over network filesystems —
  // exactly what a host's "persistent storage" directory often is. DELETE
  // mode (the long-standing default rollback journal) is the safer choice
  // for new databases. But leaving WAL once a file is already in it requires
  // *zero* other connections to that file — not just no active transaction —
  // and with this host always running multiple long-lived server processes
  // against the same file, that condition never naturally occurs. Retrying
  // it (even with backoff/jitter) just deadlocks forever and crashes the
  // app. So: only attempt it when nothing's currently open against the
  // file, and if that one attempt fails, keep running in WAL rather than
  // crash — this app's write volume is tiny enough that WAL's network-FS
  // risk is a lesser evil than an unavailable server.
  try {
    const { journal_mode: currentMode } = db.prepare('PRAGMA journal_mode').get();
    if (String(currentMode).toLowerCase() === 'wal') {
      db.exec('PRAGMA journal_mode = DELETE');
    }
  } catch (err) {
    console.warn('Could not leave WAL journal mode (other connections likely still open); continuing in WAL.', err.message);
  }
  db.exec('PRAGMA foreign_keys = OFF');
  withLockRetry(() =>
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
    `)
  );
  withLockRetry(() => {
    const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    insertDefault.run('allow_repeat_gifts', 'false');
    insertDefault.run('wheel_enabled', 'true');
    insertDefault.run('cliq_alias', 'OH98');
  });
  migrateParticipantsTable(db);
  migrateGiftsTable(db);
  migrateParticipantsSessionId(db);
  return db;
}

function migrateParticipantsSessionId(db) {
  const columns = db.prepare('PRAGMA table_info(participants)').all();
  const hasSessionId = columns.some((c) => c.name === 'session_id');
  if (hasSessionId) return;
  withLockRetry(() => db.exec('ALTER TABLE participants ADD COLUMN session_id TEXT'));
}

function migrateGiftsTable(db) {
  const columns = db.prepare('PRAGMA table_info(gifts)').all();
  const hasPrice = columns.some((c) => c.name === 'price');
  if (hasPrice) return;
  withLockRetry(() => db.exec('ALTER TABLE gifts ADD COLUMN price TEXT'));
}

function migrateParticipantsTable(db) {
  const columns = db.prepare('PRAGMA table_info(participants)').all();
  const hasOutcome = columns.some((c) => c.name === 'outcome');
  const giftIdColumn = columns.find((c) => c.name === 'gift_id');
  const giftIdIsNullable = !giftIdColumn || giftIdColumn.notnull === 0;
  if (hasOutcome && giftIdIsNullable) return;

  withLockRetry(() =>
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
    `)
  );
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
  // Same startup race as initDb's own writes: multiple processes may reach
  // this INSERT within the same window.
  withLockRetry(() => db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, passwordHash));
  return true;
}

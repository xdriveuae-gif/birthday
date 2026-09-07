# Birthday Gift Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete birthday gift wheel web app: a funny/flashy public spin flow (name → wheel → gift → WhatsApp share) backed by a server-authoritative spin, plus a protected admin console for gifts, participants, and settings.

**Architecture:** Monorepo (`client/` Vite+React+Tailwind+Framer Motion SPA, `server/` Express+node:sqlite API) deployed as one Node process — Express serves the built SPA and the API from the same origin in production, Vite dev server proxies `/api` to Express in development.

**Tech Stack:** Node.js 24.x (ESM, `"type": "module"`), Express 4, Node's built-in `node:sqlite` module (`DatabaseSync` — see amendment note below), bcryptjs, express-session with a custom `node:sqlite`-backed store, helmet, express-rate-limit, zod, multer, Node's built-in `node:test` + supertest for server tests; React 18, Vite, Tailwind CSS, Framer Motion, react-router-dom, vitest for pure-logic unit tests.

**Spec:** [docs/superpowers/specs/2026-09-07-birthday-gift-wheel-design.md](../specs/2026-09-07-birthday-gift-wheel-design.md)

> **Amendment (made during Task 1 execution):** The original version of this
> plan pinned `better-sqlite3` + `connect-sqlite3`. Both were replaced with
> Node's built-in `node:sqlite` module (plus a small custom session store)
> after two independent verification passes showed `better-sqlite3` cannot
> install at all on the machine this project is being built on (no Python/
> node-gyp toolchain; native-module prebuild fetching for Node 24 proved
> unreliable — a plain `npm install` aborted completely, emptying
> `node_modules` of every package). Every task below already reflects the
> `node:sqlite`-based implementation — this note exists only to explain why,
> since the spec text still shows its original approval date. See the SDD
> ledger for the full verification trail.

## Global Constraints

- Server picks the gift; the client never determines the outcome (spec §4).
- Gift selection is **uniform random** among eligible gifts — no weighting (spec §4).
- `GET /api/gifts/public` and `GET /api/settings/public` are decorative/idle-state only; the authoritative wheel segments for an actual spin come back **in the `/api/spin` response itself** (spec §4).
- No sound plays automatically on page load — only after a user gesture (spec §10).
- All `/api/admin/*` routes require an authenticated session via `requireAdmin` middleware (spec §5).
- Passwords hashed with bcrypt (bcryptjs, cost 12), never stored or logged in plaintext (spec §5, §11).
- All SQL uses `node:sqlite` prepared statements (`db.prepare(sql).run/get/all()`) with bound `?` parameters — no string-concatenated SQL (spec §11).
- Uploaded gift images: MIME allow-list `image/jpeg`, `image/png`, `image/webp` only, 5MB max, server-generated UUID filenames (spec §6, §11).
- Env vars (from `.env` at repo root): `PORT`, `NODE_ENV`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SQLITE_PATH`, `UPLOADS_DIR` (spec §14).
- Exact copy to reuse verbatim across client tasks (do not invent variants):
  - Landing headline: `🎂 WELCOME TO MY BIRTHDAY 🎂`
  - Landing subtitle: `Congratulations! You have been selected to buy me a gift.`
  - Name input label: `What's your name?` / placeholder: `Enter your name...`
  - Landing button: `LET'S GO! 🎉`
  - Wheel button: `SPIN THE WHEEL 🎰`
  - Wheel flavor text: `Your wallet is about to get lighter 💸`
  - Result headline: `🎉 THE WHEEL HAS SPOKEN 🎉`
  - Result sub-line: `Your gift is:`
  - Result joke line: `Sorry. No take-backs.`
  - WhatsApp button: `📱 SEND TO MY WHATSAPP`

---

## Task 1: Repo scaffolding & server health check

**Files:**
- Create: `package.json` (repo root)
- Create: `.gitignore`
- Create: `.env.example`
- Create: `server/package.json`
- Create: `server/src/app.js`
- Create: `server/src/index.js`
- Test: `server/test/health.test.js`

**Interfaces:**
- Produces: `createApp(options): express.Application` where `options = { isProduction: boolean }` (more fields added by later tasks — this task only needs `isProduction`). Exposes `GET /api/health` → `{ ok: true }`.

- [ ] **Step 1: Create root config files**

`package.json`:
```json
{
  "name": "birthday-gift-game",
  "private": true,
  "scripts": {
    "install:all": "npm install --prefix server && npm install --prefix client",
    "dev": "concurrently -n SERVER,CLIENT -c blue,green \"npm run dev --prefix server\" \"npm run dev --prefix client\"",
    "build": "npm run build --prefix client",
    "start": "npm run start --prefix server",
    "test": "npm test --prefix server"
  },
  "devDependencies": {
    "concurrently": "^9.0.1"
  }
}
```

`.gitignore`:
```
node_modules/
server/node_modules/
client/node_modules/
client/dist/
server/data/
.env
npm-debug.log*
*.log
```

`.env.example`:
```
PORT=3000
NODE_ENV=development
SESSION_SECRET=change-me-to-a-long-random-string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-to-a-strong-password
SQLITE_PATH=server/data/app.db
UPLOADS_DIR=server/data/uploads
```

- [ ] **Step 2: Create server package.json**

`server/package.json`:
```json
{
  "name": "server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test test/*.test.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "express-session": "^1.18.0",
    "helmet": "^7.1.0",
    "multer": "^1.4.5-lts.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 3: Write the failing test**

`server/test/health.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('GET /api/health returns ok', async () => {
  const app = createApp({ isProduction: false });
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});
```

- [ ] **Step 4: Install dependencies and run test to verify it fails**

Run:
```bash
npm install --prefix server
npm test --prefix server
```
Expected: FAIL — `app.js` does not exist / does not export `createApp`.

- [ ] **Step 5: Write minimal `app.js` and `index.js`**

`server/src/app.js`:
```js
import express from 'express';

export function createApp({ isProduction }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  return app;
}
```

`server/src/index.js`:
```js
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;

const app = createApp({ isProduction });

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore .env.example server/package.json server/package-lock.json server/src/app.js server/src/index.js server/test/health.test.js
git commit -m "Scaffold repo and server with health check endpoint"
```

---

## Task 2: Database layer — schema init, settings, admin seeding

**Files:**
- Create: `server/src/db/index.js`
- Create: `server/src/db/settings.js`
- Create: `server/src/lib/password.js`
- Test: `server/test/db.test.js`
- Test: `server/test/password.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks. Uses Node's built-in `node:sqlite` module (`DatabaseSync`) — no npm dependency, ships with Node 22.5+; this project targets Node 24.x (see Global Constraints / plan header amendment).
- Produces:
  - `initDb(dbPath: string): DatabaseSync` — creates tables (including a `sessions` table used by Task 9's session store) if missing, seeds default settings rows.
  - `runInTransaction(db, fn: () => T): T` — runs `fn` inside `BEGIN`/`COMMIT`, rolling back on any thrown error and rethrowing. `node:sqlite`'s `DatabaseSync` has no built-in `.transaction()` helper (unlike better-sqlite3), so this wraps the same guarantee manually.
  - `seedAdminIfEmpty(db, username: string, passwordHash: string): boolean` — inserts an admin row only if `admin_users` is empty; returns whether it inserted.
  - `getAllSettings(db): { allowRepeatGifts: boolean, wheelEnabled: boolean }`
  - `updateSettings(db, { allowRepeatGifts?: boolean, wheelEnabled?: boolean }): same shape as getAllSettings`
  - `hashPassword(plain: string): string`
  - `verifyPassword(plain: string, hash: string): boolean`

- [ ] **Step 1: Write failing tests**

`server/test/db.test.js`:
```js
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
```

`server/test/password.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

test('hashPassword produces a hash that verifyPassword accepts', () => {
  const hash = hashPassword('correct-horse-battery-staple');
  assert.notEqual(hash, 'correct-horse-battery-staple');
  assert.equal(verifyPassword('correct-horse-battery-staple', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — modules under `src/db/` and `src/lib/password.js` don't exist yet.

- [ ] **Step 3: Implement `db/index.js`**

```js
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function initDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
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
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gift_id INTEGER NOT NULL REFERENCES gifts(id),
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
  return db;
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
```

- [ ] **Step 4: Implement `db/settings.js`**

```js
export function getAllSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    allowRepeatGifts: map.allow_repeat_gifts === 'true',
    wheelEnabled: map.wheel_enabled === 'true',
  };
}

export function updateSettings(db, { allowRepeatGifts, wheelEnabled } = {}) {
  const stmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  if (allowRepeatGifts !== undefined) stmt.run(allowRepeatGifts ? 'true' : 'false', 'allow_repeat_gifts');
  if (wheelEnabled !== undefined) stmt.run(wheelEnabled ? 'true' : 'false', 'wheel_enabled');
  return getAllSettings(db);
}
```

- [ ] **Step 5: Implement `lib/password.js`**

```js
import bcrypt from 'bcryptjs';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS (all tests in `db.test.js` and `password.test.js`)

- [ ] **Step 7: Commit**

```bash
git add server/src/db/index.js server/src/db/settings.js server/src/lib/password.js server/test/db.test.js server/test/password.test.js
git commit -m "Add database init, settings, and password hashing"
```

---

## Task 3: Database layer — gifts and participants data access

**Files:**
- Create: `server/src/db/gifts.js`
- Create: `server/src/db/participants.js`
- Test: `server/test/gifts-db.test.js`
- Test: `server/test/participants-db.test.js`

**Interfaces:**
- Consumes: `initDb` from Task 2.
- Produces:
  - `listAllGifts(db): Gift[]`, `listActiveGifts(db): Gift[]`, `getGiftById(db, id): Gift|null`, `createGift(db, {name, imageUrl, productUrl, active}): Gift`, `updateGift(db, id, {name, imageUrl, productUrl, active}): Gift`, `setGiftActive(db, id, active): Gift`, `deleteGift(db, id): void`
    where `Gift = { id, name, imageUrl, productUrl, active: boolean, createdAt, updatedAt }`
  - `listWonGiftIds(db): Set<number>`, `insertParticipant(db, {name, giftId}): Participant`, `listParticipants(db, {sort, search}): ParticipantWithGift[]`, `countParticipants(db): number`, `deleteParticipant(db, id): void`, `deleteAllParticipants(db): void`
    where `Participant = { id, name, giftId, createdAt }` and `ParticipantWithGift` adds `giftName`, `giftImageUrl`.

- [ ] **Step 1: Write failing tests**

`server/test/gifts-db.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { listAllGifts, listActiveGifts, getGiftById, createGift, updateGift, setGiftActive, deleteGift } from '../src/db/gifts.js';

function setup() {
  return initDb(':memory:');
}

test('createGift then getGiftById round-trips fields', () => {
  const db = setup();
  const created = createGift(db, { name: 'AirPods', imageUrl: '/uploads/gifts/a.jpg', productUrl: 'https://example.com/airpods', active: true });
  const fetched = getGiftById(db, created.id);
  assert.equal(fetched.name, 'AirPods');
  assert.equal(fetched.imageUrl, '/uploads/gifts/a.jpg');
  assert.equal(fetched.productUrl, 'https://example.com/airpods');
  assert.equal(fetched.active, true);
});

test('listActiveGifts only returns active gifts', () => {
  const db = setup();
  createGift(db, { name: 'Active Gift', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  createGift(db, { name: 'Inactive Gift', imageUrl: null, productUrl: 'https://example.com/b', active: false });
  const active = listActiveGifts(db);
  assert.equal(active.length, 1);
  assert.equal(active[0].name, 'Active Gift');
});

test('listAllGifts returns both active and inactive', () => {
  const db = setup();
  createGift(db, { name: 'One', imageUrl: null, productUrl: 'https://example.com/1', active: true });
  createGift(db, { name: 'Two', imageUrl: null, productUrl: 'https://example.com/2', active: false });
  assert.equal(listAllGifts(db).length, 2);
});

test('updateGift changes fields and setGiftActive toggles active', () => {
  const db = setup();
  const gift = createGift(db, { name: 'PS5', imageUrl: null, productUrl: 'https://example.com/ps5', active: true });
  const updated = updateGift(db, gift.id, { name: 'PS5 Pro', imageUrl: '/uploads/gifts/ps5.jpg', productUrl: 'https://example.com/ps5pro', active: true });
  assert.equal(updated.name, 'PS5 Pro');
  const toggled = setGiftActive(db, gift.id, false);
  assert.equal(toggled.active, false);
});

test('deleteGift removes the row', () => {
  const db = setup();
  const gift = createGift(db, { name: 'Temp', imageUrl: null, productUrl: 'https://example.com/t', active: true });
  deleteGift(db, gift.id);
  assert.equal(getGiftById(db, gift.id), null);
});
```

`server/test/participants-db.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { listWonGiftIds, insertParticipant, listParticipants, countParticipants, deleteParticipant, deleteAllParticipants } from '../src/db/participants.js';

function setup() {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'AirPods', imageUrl: '/uploads/gifts/a.jpg', productUrl: 'https://example.com/a', active: true });
  return { db, gift };
}

test('insertParticipant then listWonGiftIds includes that gift', () => {
  const { db, gift } = setup();
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  assert.deepEqual(listWonGiftIds(db), new Set([gift.id]));
});

test('listParticipants joins gift name and image, supports search and sort', () => {
  const { db, gift } = setup();
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  insertParticipant(db, { name: 'Sara', giftId: gift.id });
  const all = listParticipants(db, { sort: 'newest', search: '' });
  assert.equal(all.length, 2);
  assert.equal(all[0].name, 'Sara'); // newest first
  assert.equal(all[0].giftName, 'AirPods');
  const filtered = listParticipants(db, { sort: 'newest', search: 'ahm' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'Ahmad');
});

test('countParticipants, deleteParticipant, deleteAllParticipants', () => {
  const { db, gift } = setup();
  const p1 = insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  insertParticipant(db, { name: 'Sara', giftId: gift.id });
  assert.equal(countParticipants(db), 2);
  deleteParticipant(db, p1.id);
  assert.equal(countParticipants(db), 1);
  deleteAllParticipants(db);
  assert.equal(countParticipants(db), 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `src/db/gifts.js` and `src/db/participants.js` don't exist.

- [ ] **Step 3: Implement `db/gifts.js`**

```js
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
```

- [ ] **Step 4: Implement `db/participants.js`**

```js
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
```

Note: `order` is one of two fixed internal literals (`'ASC'`/`'DESC'`), never user input, so this is not a SQL-injection vector despite the interpolation.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/db/gifts.js server/src/db/participants.js server/test/gifts-db.test.js server/test/participants-db.test.js
git commit -m "Add gifts and participants data access layer"
```

---

## Task 4: Spin service (core business logic)

**Files:**
- Create: `server/src/services/spin.js`
- Test: `server/test/spin-service.test.js`

**Interfaces:**
- Consumes: `getAllSettings`, `listActiveGifts`, `listWonGiftIds`, `insertParticipant` from Tasks 2–3; `runInTransaction` from Task 2.
- Produces:
  - `class SpinError extends Error { status: number; code: string; message: string }`
  - `performSpin(db, rawName: string): { participant: Participant, gift: Gift, wheelSegments: Gift[] }` — throws `SpinError` for invalid name (400 `INVALID_NAME`), disabled wheel (403 `WHEEL_DISABLED`), or no eligible gifts (409 `NO_GIFTS_LEFT`).

- [ ] **Step 1: Write failing tests**

`server/test/spin-service.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { updateSettings } from '../src/db/settings.js';
import { performSpin, SpinError } from '../src/services/spin.js';

function setupWithGifts(count = 3) {
  const db = initDb(':memory:');
  const gifts = [];
  for (let i = 0; i < count; i++) {
    gifts.push(createGift(db, { name: `Gift ${i}`, imageUrl: null, productUrl: `https://example.com/${i}`, active: true }));
  }
  return { db, gifts };
}

test('rejects empty or too-long names', () => {
  const { db } = setupWithGifts();
  assert.throws(() => performSpin(db, '   '), SpinError);
  assert.throws(() => performSpin(db, 'a'.repeat(51)), SpinError);
});

test('rejects spin when wheel is disabled', () => {
  const { db } = setupWithGifts();
  updateSettings(db, { wheelEnabled: false });
  try {
    performSpin(db, 'Ahmad');
    assert.fail('expected SpinError');
  } catch (err) {
    assert.ok(err instanceof SpinError);
    assert.equal(err.status, 403);
    assert.equal(err.code, 'WHEEL_DISABLED');
  }
});

test('returns 409 when no eligible gifts exist', () => {
  const db = initDb(':memory:'); // no gifts at all
  try {
    performSpin(db, 'Ahmad');
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'NO_GIFTS_LEFT');
  }
});

test('a successful spin records a participant and returns the winning gift among wheelSegments', () => {
  const { db, gifts } = setupWithGifts();
  const result = performSpin(db, 'Ahmad');
  assert.equal(result.participant.name, 'Ahmad');
  const winnerIds = gifts.map((g) => g.id);
  assert.ok(winnerIds.includes(result.gift.id));
  assert.ok(result.wheelSegments.some((g) => g.id === result.gift.id));
  assert.equal(result.wheelSegments.length, gifts.length);
});

test('when allow_repeat_gifts is false, a won gift becomes ineligible for future spins', () => {
  const { db, gifts } = setupWithGifts(1);
  performSpin(db, 'Ahmad');
  try {
    performSpin(db, 'Sara');
    assert.fail('expected SpinError since the only gift is already won');
  } catch (err) {
    assert.equal(err.code, 'NO_GIFTS_LEFT');
  }
});

test('when allow_repeat_gifts is true, the same gift can be won again', () => {
  const { db } = setupWithGifts(1);
  updateSettings(db, { allowRepeatGifts: true });
  performSpin(db, 'Ahmad');
  const second = performSpin(db, 'Sara');
  assert.ok(second.gift);
});

test('inactive gifts are never eligible', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Inactive', imageUrl: null, productUrl: 'https://example.com/x', active: false });
  try {
    performSpin(db, 'Ahmad');
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.code, 'NO_GIFTS_LEFT');
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `src/services/spin.js` does not exist.

- [ ] **Step 3: Implement `services/spin.js`**

```js
import { runInTransaction } from '../db/index.js';
import { getAllSettings } from '../db/settings.js';
import { listActiveGifts } from '../db/gifts.js';
import { listWonGiftIds, insertParticipant } from '../db/participants.js';

export class SpinError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function performSpin(db, rawName) {
  const name = String(rawName ?? '').trim();
  if (!name || name.length > 50) {
    throw new SpinError(400, 'INVALID_NAME', 'Please enter a name between 1 and 50 characters.');
  }

  return runInTransaction(db, () => {
    const settings = getAllSettings(db);
    if (!settings.wheelEnabled) {
      throw new SpinError(403, 'WHEEL_DISABLED', 'The wheel is taking a nap. Ask the birthday human to turn it back on.');
    }

    const activeGifts = listActiveGifts(db);
    const wonGiftIds = settings.allowRepeatGifts ? new Set() : listWonGiftIds(db);
    const eligible = activeGifts.filter((g) => !wonGiftIds.has(g.id));

    if (eligible.length === 0) {
      throw new SpinError(409, 'NO_GIFTS_LEFT', 'There are no gifts left on the wheel right now.');
    }

    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    const participant = insertParticipant(db, { name, giftId: winner.id });

    return { participant, gift: winner, wheelSegments: eligible };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/spin.js server/test/spin-service.test.js
git commit -m "Add server-authoritative spin service with atomic gift selection"
```

---

## Task 5: Admin authentication — requireAdmin middleware + login/logout/me

**Files:**
- Create: `server/src/middleware/requireAdmin.js`
- Create: `server/src/routes/adminAuth.js`
- Test: `server/test/require-admin.test.js`
- Test: `server/test/admin-auth.test.js`

**Interfaces:**
- Consumes: `verifyPassword` (Task 2), `seedAdminIfEmpty`/`initDb` (Task 2) for test setup.
- Produces:
  - `requireAdmin(req, res, next)` — Express middleware; 401 JSON if `req.session.adminId` is not set.
  - `createAdminAuthRouter(db, options?: { loginLimiter?: RequestHandler }): Router` with `POST /login`, `POST /logout`, `GET /me`.

- [ ] **Step 1: Write failing tests**

`server/test/require-admin.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { requireAdmin } from '../src/middleware/requireAdmin.js';

function buildApp() {
  const app = express();
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.get('/protected', requireAdmin, (req, res) => res.json({ ok: true }));
  app.post('/fake-login', (req, res) => {
    req.session.adminId = 1;
    res.json({ ok: true });
  });
  return app;
}

test('requireAdmin blocks unauthenticated requests', async () => {
  const res = await request(buildApp()).get('/protected');
  assert.equal(res.status, 401);
});

test('requireAdmin allows requests with an authenticated session', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await agent.post('/fake-login');
  const res = await agent.get('/protected');
  assert.equal(res.status, 200);
});
```

`server/test/admin-auth.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { initDb, seedAdminIfEmpty } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { createAdminAuthRouter } from '../src/routes/adminAuth.js';

function buildTestApp() {
  const db = initDb(':memory:');
  seedAdminIfEmpty(db, 'admin', hashPassword('secret123'));
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
  app.use('/api/admin', createAdminAuthRouter(db));
  return app;
}

test('rejects login with wrong password', async () => {
  const res = await request(buildTestApp()).post('/api/admin/login').send({ username: 'admin', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('rejects login with missing fields', async () => {
  const res = await request(buildTestApp()).post('/api/admin/login').send({ username: 'admin' });
  assert.equal(res.status, 400);
});

test('GET /me is 401 when not logged in', async () => {
  const res = await request(buildTestApp()).get('/api/admin/me');
  assert.equal(res.status, 401);
});

test('login then /me returns the username, logout then /me is 401 again', async () => {
  const app = buildTestApp();
  const agent = request.agent(app);

  const loginRes = await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.username, 'admin');

  const meRes = await agent.get('/api/admin/me');
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.username, 'admin');

  const logoutRes = await agent.post('/api/admin/logout');
  assert.equal(logoutRes.status, 200);

  const meAfterLogout = await agent.get('/api/admin/me');
  assert.equal(meAfterLogout.status, 401);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `src/middleware/requireAdmin.js` and `src/routes/adminAuth.js` don't exist.

- [ ] **Step 3: Implement `middleware/requireAdmin.js`**

```js
export function requireAdmin(req, res, next) {
  if (req.session?.adminId) return next();
  return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Admin login required.' } });
}
```

- [ ] **Step 4: Implement `routes/adminAuth.js`**

```js
import { Router } from 'express';
import { verifyPassword } from '../lib/password.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export function createAdminAuthRouter(db, { loginLimiter } = {}) {
  const router = Router();
  const limiter = loginLimiter ?? ((req, res, next) => next());

  router.post('/login', limiter, (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Username and password are required.' } });
    }
    const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect username or password.' } });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: { code: 'SESSION_ERROR', message: 'Could not start session.' } });
      req.session.adminId = admin.id;
      req.session.username = admin.username;
      res.json({ username: admin.username });
    });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  router.get('/me', requireAdmin, (req, res) => {
    res.json({ username: req.session.username });
  });

  return router;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/middleware/requireAdmin.js server/src/routes/adminAuth.js server/test/require-admin.test.js server/test/admin-auth.test.js
git commit -m "Add admin session authentication (login, logout, me, requireAdmin)"
```

---

## Task 6: Public routes — spin, gifts/public, settings/public

**Files:**
- Create: `server/src/routes/spin.js`
- Create: `server/src/routes/publicGifts.js`
- Create: `server/src/routes/publicSettings.js`
- Test: `server/test/public-routes.test.js`

**Interfaces:**
- Consumes: `performSpin`/`SpinError` (Task 4), `listActiveGifts` (Task 3), `getAllSettings` (Task 2).
- Produces:
  - `createSpinRouter(db): Router` — `POST /` → `{ participant, gift, wheelSegments }` or `{ error: { code, message } }`.
  - `createPublicGiftsRouter(db): Router` — `GET /` → `{ gifts: [{id, name, imageUrl}] }` (active only, no `productUrl`).
  - `createPublicSettingsRouter(db): Router` — `GET /` → `{ wheelEnabled: boolean }`.

- [ ] **Step 1: Write failing tests**

`server/test/public-routes.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { updateSettings } from '../src/db/settings.js';
import { createSpinRouter } from '../src/routes/spin.js';
import { createPublicGiftsRouter } from '../src/routes/publicGifts.js';
import { createPublicSettingsRouter } from '../src/routes/publicSettings.js';

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/spin', createSpinRouter(db));
  app.use('/api/gifts/public', createPublicGiftsRouter(db));
  app.use('/api/settings/public', createPublicSettingsRouter(db));
  return app;
}

test('GET /api/gifts/public only lists active gifts, without productUrl', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Active', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  createGift(db, { name: 'Inactive', imageUrl: null, productUrl: 'https://example.com/b', active: false });
  const res = await request(buildApp(db)).get('/api/gifts/public');
  assert.equal(res.status, 200);
  assert.equal(res.body.gifts.length, 1);
  assert.equal(res.body.gifts[0].name, 'Active');
  assert.equal(res.body.gifts[0].productUrl, undefined);
});

test('GET /api/settings/public reflects wheelEnabled', async () => {
  const db = initDb(':memory:');
  updateSettings(db, { wheelEnabled: false });
  const res = await request(buildApp(db)).get('/api/settings/public');
  assert.deepEqual(res.body, { wheelEnabled: false });
});

test('POST /api/spin returns 400 for missing name', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/spin').send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_NAME');
});

test('POST /api/spin returns the winning gift and wheelSegments on success', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  const res = await request(buildApp(db)).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(res.status, 200);
  assert.equal(res.body.gift.name, 'AirPods');
  assert.equal(res.body.gift.productUrl, 'https://example.com/airpods');
  assert.equal(res.body.wheelSegments.length, 1);
});

test('POST /api/spin returns 409 when there are no gifts at all', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'NO_GIFTS_LEFT');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — the three route modules don't exist yet.

- [ ] **Step 3: Implement `routes/spin.js`**

```js
import { Router } from 'express';
import { performSpin, SpinError } from '../services/spin.js';

export function createSpinRouter(db) {
  const router = Router();
  router.post('/', (req, res, next) => {
    try {
      const { participant, gift, wheelSegments } = performSpin(db, req.body?.name);
      res.json({
        participant: { id: participant.id, name: participant.name, createdAt: participant.createdAt },
        gift: { id: gift.id, name: gift.name, imageUrl: gift.imageUrl, productUrl: gift.productUrl },
        wheelSegments: wheelSegments.map((g) => ({ id: g.id, name: g.name, imageUrl: g.imageUrl })),
      });
    } catch (err) {
      if (err instanceof SpinError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });
  return router;
}
```

- [ ] **Step 4: Implement `routes/publicGifts.js` and `routes/publicSettings.js`**

```js
// routes/publicGifts.js
import { Router } from 'express';
import { listActiveGifts } from '../db/gifts.js';

export function createPublicGiftsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const gifts = listActiveGifts(db).map((g) => ({ id: g.id, name: g.name, imageUrl: g.imageUrl }));
    res.json({ gifts });
  });
  return router;
}
```

```js
// routes/publicSettings.js
import { Router } from 'express';
import { getAllSettings } from '../db/settings.js';

export function createPublicSettingsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const { wheelEnabled } = getAllSettings(db);
    res.json({ wheelEnabled });
  });
  return router;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/spin.js server/src/routes/publicGifts.js server/src/routes/publicSettings.js server/test/public-routes.test.js
git commit -m "Add public spin, gifts, and settings routes"
```

---

## Task 7: Admin gifts CRUD + image upload

**Files:**
- Create: `server/src/routes/adminGifts.js`
- Test: `server/test/admin-gifts.test.js`

**Interfaces:**
- Consumes: `listAllGifts`, `getGiftById`, `createGift`, `updateGift`, `setGiftActive`, `deleteGift` (Task 3).
- Produces: `createAdminGiftsRouter(db, uploadsDir): Router` with `GET /`, `POST /`, `PUT /:id`, `PATCH /:id/active`, `DELETE /:id`. Uploaded images are written under `<uploadsDir>/gifts/<uuid>.<ext>` and referenced as `imageUrl: /uploads/gifts/<uuid>.<ext>`.

- [ ] **Step 1: Write failing tests**

`server/test/admin-gifts.test.js`:
```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb } from '../src/db/index.js';
import { createAdminGiftsRouter } from '../src/routes/adminGifts.js';

const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const tmpDirs = [];
function buildApp() {
  const db = initDb(':memory:');
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bday-uploads-'));
  tmpDirs.push(uploadsDir);
  const app = express();
  app.use(express.json());
  app.use('/api/admin/gifts', createAdminGiftsRouter(db, uploadsDir));
  return app;
}

after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test('creates a gift with an image and lists it', async () => {
  const app = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'AirPods')
    .field('productUrl', 'https://example.com/airpods')
    .field('active', 'true')
    .attach('image', PNG_BUFFER, { filename: 'airpods.png', contentType: 'image/png' });
  assert.equal(createRes.status, 201);
  assert.match(createRes.body.gift.imageUrl, /^\/uploads\/gifts\/.+\.png$/);

  const listRes = await request(app).get('/api/admin/gifts');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.gifts.length, 1);
});

test('rejects an invalid product URL', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Bad')
    .field('productUrl', 'not-a-url')
    .field('active', 'true');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');
});

test('rejects a non-image file', async () => {
  const app = buildApp();
  const res = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Evil')
    .field('productUrl', 'https://example.com/evil')
    .field('active', 'true')
    .attach('image', Buffer.from('not an image'), { filename: 'evil.txt', contentType: 'text/plain' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_FILE_TYPE');
});

test('rejects an image larger than 5MB', async () => {
  const app = buildApp();
  const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 1);
  const res = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Big')
    .field('productUrl', 'https://example.com/big')
    .field('active', 'true')
    .attach('image', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'FILE_TOO_LARGE');
});

test('updates a gift and toggles active', async () => {
  const app = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'PS5')
    .field('productUrl', 'https://example.com/ps5')
    .field('active', 'true');
  const id = createRes.body.gift.id;

  const updateRes = await request(app)
    .put(`/api/admin/gifts/${id}`)
    .field('name', 'PS5 Pro')
    .field('productUrl', 'https://example.com/ps5pro')
    .field('active', 'true');
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.gift.name, 'PS5 Pro');

  const toggleRes = await request(app).patch(`/api/admin/gifts/${id}/active`).send({ active: false });
  assert.equal(toggleRes.status, 200);
  assert.equal(toggleRes.body.gift.active, false);
});

test('deletes a gift', async () => {
  const app = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Temp')
    .field('productUrl', 'https://example.com/temp')
    .field('active', 'true');
  const id = createRes.body.gift.id;
  const deleteRes = await request(app).delete(`/api/admin/gifts/${id}`);
  assert.equal(deleteRes.status, 200);
  const listRes = await request(app).get('/api/admin/gifts');
  assert.equal(listRes.body.gifts.length, 0);
});

test('returns 404 for unknown gift id on update/delete', async () => {
  const app = buildApp();
  const updateRes = await request(app)
    .put('/api/admin/gifts/999')
    .field('name', 'X')
    .field('productUrl', 'https://example.com/x')
    .field('active', 'true');
  assert.equal(updateRes.status, 404);
  const deleteRes = await request(app).delete('/api/admin/gifts/999');
  assert.equal(deleteRes.status, 404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `src/routes/adminGifts.js` does not exist.

- [ ] **Step 3: Implement `routes/adminGifts.js`**

```js
import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { listAllGifts, getGiftById, createGift, updateGift, setGiftActive, deleteGift } from '../db/gifts.js';

const ALLOWED_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const giftFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  productUrl: z
    .string()
    .trim()
    .min(1, 'Product URL is required')
    .refine((u) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Must be a valid http(s) URL'),
  active: z.enum(['true', 'false']).transform((v) => v === 'true'),
});

function createUploadMiddleware(uploadsDir) {
  const dest = path.join(uploadsDir, 'gifts');
  fs.mkdirSync(dest, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => cb(null, `${randomUUID()}${ALLOWED_MIME[file.mimetype] ?? ''}`),
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
      cb(new Error('INVALID_FILE_TYPE'));
    },
  });
}

function deleteUploadedFile(uploadsDir, imageUrl) {
  if (!imageUrl) return;
  const filePath = path.join(uploadsDir, imageUrl.replace(/^\/uploads\//, ''));
  fs.unlink(filePath, () => {});
}

export function createAdminGiftsRouter(db, uploadsDir) {
  const router = Router();
  const uploadSingle = createUploadMiddleware(uploadsDir).single('image');

  function handleUpload(req, res, next) {
    uploadSingle(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: 'Image must be 5MB or smaller.' } });
      }
      if (err) {
        return res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'Only JPEG, PNG, or WEBP images are allowed.' } });
      }
      next();
    });
  }

  router.get('/', (req, res) => {
    res.json({ gifts: listAllGifts(db) });
  });

  router.post('/', handleUpload, (req, res) => {
    const parsed = giftFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } });
    }
    const imageUrl = req.file ? `/uploads/gifts/${req.file.filename}` : null;
    const gift = createGift(db, { ...parsed.data, imageUrl });
    res.status(201).json({ gift });
  });

  router.put('/:id', handleUpload, (req, res) => {
    const existing = getGiftById(db, req.params.id);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gift not found.' } });
    const parsed = giftFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } });
    }
    let imageUrl = existing.imageUrl;
    if (req.file) {
      deleteUploadedFile(uploadsDir, existing.imageUrl);
      imageUrl = `/uploads/gifts/${req.file.filename}`;
    }
    const gift = updateGift(db, req.params.id, { ...parsed.data, imageUrl });
    res.json({ gift });
  });

  router.patch('/:id/active', (req, res) => {
    const existing = getGiftById(db, req.params.id);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gift not found.' } });
    const schema = z.object({ active: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'active must be a boolean.' } });
    res.json({ gift: setGiftActive(db, req.params.id, parsed.data.active) });
  });

  router.delete('/:id', (req, res) => {
    const existing = getGiftById(db, req.params.id);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gift not found.' } });
    deleteUploadedFile(uploadsDir, existing.imageUrl);
    deleteGift(db, req.params.id);
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/adminGifts.js server/test/admin-gifts.test.js
git commit -m "Add admin gift CRUD routes with image upload validation"
```

---

## Task 8: Admin participants, settings, and stats routes

**Files:**
- Create: `server/src/routes/adminParticipants.js`
- Create: `server/src/routes/adminSettings.js`
- Create: `server/src/routes/adminStats.js`
- Test: `server/test/admin-participants.test.js`
- Test: `server/test/admin-settings-stats.test.js`

**Interfaces:**
- Consumes: `listParticipants`, `deleteParticipant`, `deleteAllParticipants` (Task 3); `getAllSettings`, `updateSettings` (Task 2); `listAllGifts` (Task 3); `countParticipants`, `listWonGiftIds` (Task 3).
- Produces:
  - `createAdminParticipantsRouter(db): Router` — `GET /?sort=newest|oldest&search=`, `DELETE /:id`, `POST /reset`.
  - `createAdminSettingsRouter(db): Router` — `GET /`, `PUT /` with `{ allowRepeatGifts?, wheelEnabled? }`.
  - `createAdminStatsRouter(db): Router` — `GET /` → `{ totalParticipants, totalGifts, activeGifts, giftsAssigned, giftsRemaining }` (`giftsRemaining` is `null` when `allowRepeatGifts` is true).

- [ ] **Step 1: Write failing tests**

`server/test/admin-participants.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { insertParticipant } from '../src/db/participants.js';
import { createAdminParticipantsRouter } from '../src/routes/adminParticipants.js';

function buildApp() {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  const app = express();
  app.use(express.json());
  app.use('/api/admin/participants', createAdminParticipantsRouter(db));
  return { app, db, gift };
}

test('lists participants newest first by default, with total', async () => {
  const { app, db, gift } = buildApp();
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  insertParticipant(db, { name: 'Sara', giftId: gift.id });
  const res = await request(app).get('/api/admin/participants');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.participants[0].name, 'Sara');
});

test('supports search and oldest sort', async () => {
  const { app, db, gift } = buildApp();
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  insertParticipant(db, { name: 'Sara', giftId: gift.id });
  const res = await request(app).get('/api/admin/participants?sort=oldest&search=ahm');
  assert.equal(res.body.participants.length, 1);
  assert.equal(res.body.participants[0].name, 'Ahmad');
});

test('deletes a single participant', async () => {
  const { app, db, gift } = buildApp();
  const p = insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  const res = await request(app).delete(`/api/admin/participants/${p.id}`);
  assert.equal(res.status, 200);
  const list = await request(app).get('/api/admin/participants');
  assert.equal(list.body.total, 0);
});

test('resets all participants', async () => {
  const { app, db, gift } = buildApp();
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  insertParticipant(db, { name: 'Sara', giftId: gift.id });
  const res = await request(app).post('/api/admin/participants/reset');
  assert.equal(res.status, 200);
  const list = await request(app).get('/api/admin/participants');
  assert.equal(list.body.total, 0);
});
```

`server/test/admin-settings-stats.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { insertParticipant } from '../src/db/participants.js';
import { createAdminSettingsRouter } from '../src/routes/adminSettings.js';
import { createAdminStatsRouter } from '../src/routes/adminStats.js';

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/settings', createAdminSettingsRouter(db));
  app.use('/api/admin/stats', createAdminStatsRouter(db));
  return app;
}

test('GET/PUT settings round-trip', async () => {
  const db = initDb(':memory:');
  const app = buildApp(db);
  const getRes = await request(app).get('/api/admin/settings');
  assert.deepEqual(getRes.body, { allowRepeatGifts: false, wheelEnabled: true });

  const putRes = await request(app).put('/api/admin/settings').send({ allowRepeatGifts: true });
  assert.equal(putRes.status, 200);
  assert.deepEqual(putRes.body, { allowRepeatGifts: true, wheelEnabled: true });
});

test('rejects invalid settings payload', async () => {
  const db = initDb(':memory:');
  const app = buildApp(db);
  const res = await request(app).put('/api/admin/settings').send({ wheelEnabled: 'yes' });
  assert.equal(res.status, 400);
});

test('stats reflect gifts and participants, giftsRemaining is null when repeats allowed', async () => {
  const db = initDb(':memory:');
  const app = buildApp(db);
  const g1 = createGift(db, { name: 'A', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  createGift(db, { name: 'B (inactive)', imageUrl: null, productUrl: 'https://example.com/b', active: false });
  insertParticipant(db, { name: 'Ahmad', giftId: g1.id });

  const res1 = await request(app).get('/api/admin/stats');
  assert.equal(res1.body.totalParticipants, 1);
  assert.equal(res1.body.totalGifts, 2);
  assert.equal(res1.body.activeGifts, 1);
  assert.equal(res1.body.giftsAssigned, 1);
  assert.equal(res1.body.giftsRemaining, 0);

  await request(app).put('/api/admin/settings').send({ allowRepeatGifts: true });
  const res2 = await request(app).get('/api/admin/stats');
  assert.equal(res2.body.giftsRemaining, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — the three route modules don't exist yet.

- [ ] **Step 3: Implement `routes/adminParticipants.js`**

```js
import { Router } from 'express';
import { listParticipants, deleteParticipant, deleteAllParticipants } from '../db/participants.js';

export function createAdminParticipantsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
    const search = String(req.query.search ?? '');
    const participants = listParticipants(db, { sort, search });
    res.json({ participants, total: participants.length });
  });

  router.delete('/:id', (req, res) => {
    deleteParticipant(db, req.params.id);
    res.json({ ok: true });
  });

  router.post('/reset', (req, res) => {
    deleteAllParticipants(db);
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 4: Implement `routes/adminSettings.js` and `routes/adminStats.js`**

```js
// routes/adminSettings.js
import { Router } from 'express';
import { z } from 'zod';
import { getAllSettings, updateSettings } from '../db/settings.js';

const settingsSchema = z.object({
  allowRepeatGifts: z.boolean().optional(),
  wheelEnabled: z.boolean().optional(),
});

export function createAdminSettingsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => res.json(getAllSettings(db)));
  router.put('/', (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid settings payload.' } });
    }
    res.json(updateSettings(db, parsed.data));
  });
  return router;
}
```

```js
// routes/adminStats.js
import { Router } from 'express';
import { listAllGifts } from '../db/gifts.js';
import { countParticipants, listWonGiftIds } from '../db/participants.js';
import { getAllSettings } from '../db/settings.js';

export function createAdminStatsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const gifts = listAllGifts(db);
    const activeGifts = gifts.filter((g) => g.active);
    const settings = getAllSettings(db);
    const wonGiftIds = listWonGiftIds(db);
    const giftsRemaining = settings.allowRepeatGifts ? null : activeGifts.filter((g) => !wonGiftIds.has(g.id)).length;
    res.json({
      totalParticipants: countParticipants(db),
      totalGifts: gifts.length,
      activeGifts: activeGifts.length,
      giftsAssigned: countParticipants(db),
      giftsRemaining,
    });
  });
  return router;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/adminParticipants.js server/src/routes/adminSettings.js server/src/routes/adminStats.js server/test/admin-participants.test.js server/test/admin-settings-stats.test.js
git commit -m "Add admin participants, settings, and stats routes"
```

---

## Task 9: App assembly — security middleware, rate limiting, prod static serving

**Files:**
- Create: `server/src/lib/sqliteSessionStore.js`
- Test: `server/test/sqlite-session-store.test.js`
- Modify: `server/src/app.js`
- Modify: `server/src/index.js`
- Test: `server/test/app-integration.test.js`

**Interfaces:**
- Consumes: every router factory from Tasks 5–8, `requireAdmin` (Task 5), `initDb`/`seedAdminIfEmpty` (Task 2) — including the `sessions` table `initDb` already creates.
- Produces:
  - `class SqliteSessionStore extends session.Store` — `get(sid, cb)`, `set(sid, sessionData, cb)`, `destroy(sid, cb)`, `touch(sid, sessionData, cb)`, backed by the `sessions` table on the same `node:sqlite` database (no separate file, no extra dependency — replaces the originally-planned `connect-sqlite3`).
  - `createApp({ db, uploadsDir, sessionSecret, clientDistDir, isProduction }): express.Application` — the final shape of the app used both by tests and by `index.js`. Note there is no `sessionsDir` parameter: sessions live in the same database file as everything else.

- [ ] **Step 1: Write the failing session-store test**

`server/test/sqlite-session-store.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { SqliteSessionStore } from '../src/lib/sqliteSessionStore.js';

function getAsync(store, sid) {
  return new Promise((resolve, reject) => store.get(sid, (err, data) => (err ? reject(err) : resolve(data))));
}
function setAsync(store, sid, data) {
  return new Promise((resolve, reject) => store.set(sid, data, (err) => (err ? reject(err) : resolve())));
}
function destroyAsync(store, sid) {
  return new Promise((resolve, reject) => store.destroy(sid, (err) => (err ? reject(err) : resolve())));
}

test('set then get round-trips session data', async () => {
  const db = initDb(':memory:');
  const store = new SqliteSessionStore(db);
  await setAsync(store, 'sid-1', { cookie: { maxAge: 60000 }, adminId: 1 });
  const data = await getAsync(store, 'sid-1');
  assert.deepEqual(data, { cookie: { maxAge: 60000 }, adminId: 1 });
});

test('get returns null for an unknown sid', async () => {
  const db = initDb(':memory:');
  const store = new SqliteSessionStore(db);
  assert.equal(await getAsync(store, 'does-not-exist'), null);
});

test('get returns null for an expired session', async () => {
  const db = initDb(':memory:');
  const store = new SqliteSessionStore(db);
  await setAsync(store, 'sid-1', { cookie: { maxAge: -1000 } });
  assert.equal(await getAsync(store, 'sid-1'), null);
});

test('destroy removes the session', async () => {
  const db = initDb(':memory:');
  const store = new SqliteSessionStore(db);
  await setAsync(store, 'sid-1', { cookie: { maxAge: 60000 } });
  await destroyAsync(store, 'sid-1');
  assert.equal(await getAsync(store, 'sid-1'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server`
Expected: FAIL — `src/lib/sqliteSessionStore.js` does not exist.

- [ ] **Step 3: Implement `lib/sqliteSessionStore.js`**

```js
import session from 'express-session';

export class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const maxAge = sessionData.cookie?.maxAge ?? 8 * 60 * 60 * 1000;
      const expires = Date.now() + maxAge;
      this.db
        .prepare(
          `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`
        )
        .run(sid, JSON.stringify(sessionData), expires);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 5: Write the failing integration test**

`server/test/app-integration.test.js`:
```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, seedAdminIfEmpty } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { createApp } from '../src/app.js';

const tmpDirs = [];
function buildRealApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bday-app-'));
  tmpDirs.push(root);
  const db = initDb(path.join(root, 'app.db'));
  seedAdminIfEmpty(db, 'admin', hashPassword('secret123'));
  const uploadsDir = path.join(root, 'uploads');
  return createApp({ db, uploadsDir, sessionSecret: 'test-secret', clientDistDir: null, isProduction: false });
}

after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test('GET /api/health works through the fully assembled app', async () => {
  const res = await request(buildRealApp()).get('/api/health');
  assert.deepEqual(res.body, { ok: true });
});

test('admin routes are 401 without login, then reachable after login', async () => {
  const app = buildRealApp();
  const unauth = await request(app).get('/api/admin/gifts');
  assert.equal(unauth.status, 401);

  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' }).expect(200);
  const authed = await agent.get('/api/admin/gifts');
  assert.equal(authed.status, 200);
});

test('full flow: admin creates a gift, then a public spin wins it', async () => {
  const app = buildRealApp();
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' }).expect(200);

  const createRes = await agent
    .post('/api/admin/gifts')
    .field('name', 'AirPods')
    .field('productUrl', 'https://example.com/airpods')
    .field('active', 'true')
    .expect(201);
  assert.equal(createRes.body.gift.name, 'AirPods');

  const spinRes = await request(app).post('/api/spin').send({ name: 'Ahmad' }).expect(200);
  assert.equal(spinRes.body.gift.name, 'AirPods');

  const participantsRes = await agent.get('/api/admin/participants').expect(200);
  assert.equal(participantsRes.body.total, 1);
  assert.equal(participantsRes.body.participants[0].name, 'Ahmad');
});
```

- [ ] **Step 6: Run tests to verify the new integration test fails**

Run: `npm test --prefix server`
Expected: FAIL — current `createApp` only accepts `{ isProduction }` and has no routers/session wired.

- [ ] **Step 7: Rewrite `src/app.js`**

```js
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { requireAdmin } from './middleware/requireAdmin.js';
import { SqliteSessionStore } from './lib/sqliteSessionStore.js';
import { createSpinRouter } from './routes/spin.js';
import { createPublicGiftsRouter } from './routes/publicGifts.js';
import { createPublicSettingsRouter } from './routes/publicSettings.js';
import { createAdminAuthRouter } from './routes/adminAuth.js';
import { createAdminGiftsRouter } from './routes/adminGifts.js';
import { createAdminParticipantsRouter } from './routes/adminParticipants.js';
import { createAdminSettingsRouter } from './routes/adminSettings.js';
import { createAdminStatsRouter } from './routes/adminStats.js';

export function createApp({ db, uploadsDir, sessionSecret, clientDistDir, isProduction } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use(
    session({
      store: db ? new SqliteSessionStore(db) : undefined,
      secret: sessionSecret || 'dev-only-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: !!isProduction,
        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );

  if (uploadsDir) app.use('/uploads', express.static(uploadsDir));

  const spinLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

  app.use('/api/spin', spinLimiter, createSpinRouter(db));
  app.use('/api/gifts/public', createPublicGiftsRouter(db));
  app.use('/api/settings/public', createPublicSettingsRouter(db));

  app.use('/api/admin', createAdminAuthRouter(db, { loginLimiter }));
  app.use('/api/admin/gifts', requireAdmin, createAdminGiftsRouter(db, uploadsDir));
  app.use('/api/admin/participants', requireAdmin, createAdminParticipantsRouter(db));
  app.use('/api/admin/settings', requireAdmin, createAdminSettingsRouter(db));
  app.use('/api/admin/stats', requireAdmin, createAdminStatsRouter(db));

  if (isProduction && clientDistDir) {
    app.use(express.static(clientDistDir));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDistDir, 'index.html')));
  }

  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
  });

  return app;
}
```

Note: `sessionSecret || 'dev-only-secret'` is a safety net purely so `createApp({ isProduction: false })` (as called by the Task 1 health-check test, with no `sessionSecret`) keeps working — `index.js` still hard-fails startup if `SESSION_SECRET` is missing from the real `.env` (Step 8 below), so this fallback is never reachable in a real deployment. Similarly, `store: db ? new SqliteSessionStore(db) : undefined` keeps that same Task 1 test working when `db` isn't passed at all — every other caller of `createApp` always passes a real `db`.

- [ ] **Step 8: Rewrite `src/index.js`**

```js
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, seedAdminIfEmpty } from './db/index.js';
import { hashPassword } from './lib/password.js';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;
const repoRoot = path.resolve(__dirname, '../..');
const dbPath = path.resolve(repoRoot, process.env.SQLITE_PATH || 'server/data/app.db');
const uploadsDir = path.resolve(repoRoot, process.env.UPLOADS_DIR || 'server/data/uploads');
const clientDistDir = path.join(repoRoot, 'client/dist');
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  console.error('SESSION_SECRET is not set. Copy .env.example to .env at the repo root and configure it.');
  process.exit(1);
}

const db = initDb(dbPath);

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminUsername && adminPassword) {
  const created = seedAdminIfEmpty(db, adminUsername, hashPassword(adminPassword));
  if (created) console.log(`Admin account "${adminUsername}" created.`);
} else {
  console.warn('ADMIN_USERNAME/ADMIN_PASSWORD not set in .env — skipping admin seed.');
}

const app = createApp({ db, uploadsDir, sessionSecret, clientDistDir, isProduction });

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
```

- [ ] **Step 9: Run the full server test suite to verify everything passes, including Task 1's original health check**

Run: `npm test --prefix server`
Expected: PASS for all test files (health, db, password, gifts-db, participants-db, spin-service, require-admin, admin-auth, public-routes, admin-gifts, admin-participants, admin-settings-stats, sqlite-session-store, app-integration).

- [ ] **Step 10: Manually verify the server boots**

Run:
```bash
cp .env.example .env
```
Edit `.env` and set `SESSION_SECRET` to any random string, `ADMIN_USERNAME`/`ADMIN_PASSWORD` to real values, then:
```bash
npm run dev --prefix server
```
Expected: console prints `Admin account "..." created.` and `Server listening on http://localhost:3000`. Visit `http://localhost:3000/api/health` and confirm `{"ok":true}`. Stop the server with Ctrl+C when confirmed.

- [ ] **Step 11: Commit**

```bash
git add server/src/app.js server/src/index.js server/src/lib/sqliteSessionStore.js server/test/sqlite-session-store.test.js server/test/app-integration.test.js
git commit -m "Assemble full Express app: sessions, security headers, rate limiting, prod static serving"
```

---

## Task 10: Client scaffold (Vite + React + Tailwind)

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.js`
- Create: `client/tailwind.config.js`
- Create: `client/postcss.config.js`
- Create: `client/index.html`
- Create: `client/src/main.jsx`
- Create: `client/src/index.css`
- Create: `client/src/App.jsx`

**Interfaces:**
- Produces: a running Vite dev server on port 5173 proxying `/api` and `/uploads` to `http://localhost:3000`; `vitest` configured with `environment: 'jsdom'` for later pure-logic tests.

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "framer-motion": "^11.5.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.11",
    "vite": "^5.4.6",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create Vite, Tailwind, and PostCSS configs**

`client/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
```

`client/tailwind.config.js`:
```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        party: {
          pink: '#ff3ea5',
          purple: '#7c3aed',
          yellow: '#ffd60a',
          teal: '#06d6a0',
          orange: '#ff6b35',
        },
      },
      fontFamily: {
        display: ['"Baloo 2"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

`client/postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>🎂 Birthday Gift Wheel</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `main.jsx`, `index.css`, and a minimal `App.jsx`**

`client/src/main.jsx`:
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

`client/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}

body {
  font-family: 'Baloo 2', system-ui, sans-serif;
  background: linear-gradient(135deg, #7c3aed, #ff3ea5);
  min-height: 100vh;
}
```

`client/src/App.jsx` (placeholder content only for this task — real routing is added in Task 14 once the Landing page exists):
```jsx
export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center text-white">
      <h1 className="font-display text-3xl font-extrabold">🎂 Birthday Gift Wheel</h1>
    </div>
  );
}
```

- [ ] **Step 5: Install dependencies and verify the dev server renders a styled page**

Run:
```bash
npm install --prefix client
npm run dev --prefix client
```
Open the app in the browser tool at `http://localhost:5173`. Verify: a purple-to-pink gradient background fills the viewport, and the white "🎂 Birthday Gift Wheel" heading is centered in a large bold display font (confirms Tailwind and the Google Font are both loading correctly). Stop the dev server once confirmed.

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/package-lock.json client/vite.config.js client/tailwind.config.js client/postcss.config.js client/index.html client/src/main.jsx client/src/index.css client/src/App.jsx
git commit -m "Scaffold client with Vite, React, Tailwind, and dev proxy"
```

---

## Task 11: Client core libs — api.js, AppContext, useReducedMotion

**Files:**
- Create: `client/src/lib/api.js`
- Create: `client/src/lib/api.test.js`
- Create: `client/src/state/AppContext.jsx`
- Create: `client/src/lib/useReducedMotion.js`

**Interfaces:**
- Produces:
  - `ApiError extends Error { status, code, message }`
  - `getJson(path)`, `postJson(path, data)`, `putJson(path, data)`, `patchJson(path, data)`, `del(path)`, `postForm(path, formData)`, `putForm(path, formData)` — all return the parsed JSON body on success, throw `ApiError` on a non-2xx response.
  - `<AppProvider>` / `useAppContext()` → `{ name, setName, result, setResult }` where `result` is `null` or `{ participant, gift, wheelSegments }` from a spin response.
  - `useReducedMotion(): boolean`

- [ ] **Step 1: Write the failing test for `api.js`**

`client/src/lib/api.test.js`:
```js
import { describe, test, expect, vi, afterEach } from 'vitest';
import { getJson, postJson } from './api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api helpers', () => {
  test('getJson returns parsed body on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hello: 'world' }) })
    );
    const result = await getJson('/api/whatever');
    expect(result).toEqual({ hello: 'world' });
  });

  test('getJson throws ApiError with server-provided code/message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'NO_GIFTS_LEFT', message: 'No gifts left.' } }),
      })
    );
    await expect(getJson('/api/spin')).rejects.toMatchObject({
      status: 409,
      code: 'NO_GIFTS_LEFT',
      message: 'No gifts left.',
    });
  });

  test('postJson sends a JSON body with same-origin credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    await postJson('/api/spin', { name: 'Ahmad' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/spin',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ name: 'Ahmad' }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix client`
Expected: FAIL — `src/lib/api.js` does not exist.

- [ ] **Step 3: Implement `lib/api.js`**

```js
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parseResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? 'Something went wrong.');
  }
  return body;
}

export async function getJson(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  return parseResponse(res);
}

export async function postJson(path, data) {
  const res = await fetch(path, {
    method: 'POST',
    headers: JSON_HEADERS,
    credentials: 'same-origin',
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

export async function putJson(path, data) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: JSON_HEADERS,
    credentials: 'same-origin',
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

export async function patchJson(path, data) {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    credentials: 'same-origin',
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

export async function del(path) {
  const res = await fetch(path, { method: 'DELETE', credentials: 'same-origin' });
  return parseResponse(res);
}

export async function postForm(path, formData) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', body: formData });
  return parseResponse(res);
}

export async function putForm(path, formData) {
  const res = await fetch(path, { method: 'PUT', credentials: 'same-origin', body: formData });
  return parseResponse(res);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix client`
Expected: PASS

- [ ] **Step 5: Implement `state/AppContext.jsx` and `lib/useReducedMotion.js`** (no dedicated automated test — thin React state/DOM wrappers verified in later UI tasks)

`client/src/state/AppContext.jsx`:
```jsx
import { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [name, setName] = useState('');
  const [result, setResult] = useState(null);

  const value = { name, setName, result, setResult };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
```

`client/src/lib/useReducedMotion.js`:
```js
import { useEffect, useState } from 'react';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return reduced;
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/api.js client/src/lib/api.test.js client/src/state/AppContext.jsx client/src/lib/useReducedMotion.js
git commit -m "Add client API wrapper, app state context, and reduced-motion hook"
```

---

## Task 12: Sound system

**Files:**
- Create: `client/src/lib/sound.js`
- Create: `client/src/lib/sound.test.js`
- Create: `client/src/components/SoundToggle.jsx`

**Interfaces:**
- Produces: `isMuted(): boolean`, `setMuted(value: boolean): void`, `playClick()`, `playTick()`, `playWhirStart()`, `playCelebration()` — all synth tones via Web Audio, all no-ops when muted; `<SoundToggle />` component.

- [ ] **Step 1: Write the failing test**

`client/src/lib/sound.test.js`:
```js
import { describe, test, expect, beforeEach } from 'vitest';
import { isMuted, setMuted } from './sound.js';

describe('sound mute state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('setMuted persists to localStorage and isMuted reflects it', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(localStorage.getItem('bday-muted')).toBe('true');

    setMuted(false);
    expect(isMuted()).toBe(false);
    expect(localStorage.getItem('bday-muted')).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix client`
Expected: FAIL — `src/lib/sound.js` does not exist.

- [ ] **Step 3: Implement `lib/sound.js`**

```js
let audioCtx = null;
let muted = (() => {
  try {
    return localStorage.getItem('bday-muted') === 'true';
  } catch {
    return false;
  }
})();

function getContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone({ frequency, duration, type = 'sine', gain = 0.15, delay = 0 }) {
  if (muted) return;
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  const startTime = ctx.currentTime + delay;
  gainNode.gain.setValueAtTime(gain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gainNode).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem('bday-muted', String(value));
  } catch {
    // ignore storage failures (private browsing, etc.)
  }
}

export function playClick() {
  playTone({ frequency: 660, duration: 0.08, type: 'square', gain: 0.12 });
}

export function playTick() {
  playTone({ frequency: 900, duration: 0.03, type: 'square', gain: 0.08 });
}

export function playWhirStart() {
  if (muted) return;
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 4);
  gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4);
  osc.connect(gainNode).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 4);
}

export function playCelebration() {
  if (muted) return;
  [523.25, 659.25, 783.99].forEach((frequency, i) => {
    playTone({ frequency, duration: 0.3, type: 'triangle', gain: 0.15, delay: i * 0.12 });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix client`
Expected: PASS

- [ ] **Step 5: Implement `components/SoundToggle.jsx`**

```jsx
import { useState } from 'react';
import { isMuted, setMuted, playClick } from '../lib/sound.js';

export function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted());

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playClick();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      className="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl backdrop-blur transition hover:bg-white/30 active:scale-90"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/sound.js client/src/lib/sound.test.js client/src/components/SoundToggle.jsx
git commit -m "Add Web Audio synth sound effects and mute toggle"
```

---

## Task 13: Wheel math (pure logic)

**Files:**
- Create: `client/src/components/Wheel/wheelMath.js`
- Create: `client/src/components/Wheel/wheelMath.test.js`

**Interfaces:**
- Produces:
  - `getSegmentAngles(index, total): { startAngle, endAngle, midAngle }` (degrees, 0 = top, clockwise)
  - `getTargetRotation({ segmentIndex, totalSegments, previousRotation = 0, fullSpins = 6 }): number` — always greater than `previousRotation`, always lands exactly on the target segment's midpoint modulo 360.
  - `describeSlicePath(cx, cy, radius, startAngle, endAngle): string` (SVG path `d` attribute for one pie slice)
  - `SEGMENT_COLORS: string[]`, `colorForSegment(index): string` (cycles through the palette)

- [ ] **Step 1: Write the failing tests**

`client/src/components/Wheel/wheelMath.test.js`:
```js
import { describe, test, expect } from 'vitest';
import { getSegmentAngles, getTargetRotation, colorForSegment, SEGMENT_COLORS } from './wheelMath.js';

describe('getSegmentAngles', () => {
  test('divides the circle evenly across segments', () => {
    expect(getSegmentAngles(0, 4)).toEqual({ startAngle: 0, endAngle: 90, midAngle: 45 });
    expect(getSegmentAngles(2, 4)).toEqual({ startAngle: 180, endAngle: 270, midAngle: 225 });
  });
});

describe('getTargetRotation', () => {
  test('always spins forward by at least fullSpins full turns', () => {
    const rotation = getTargetRotation({ segmentIndex: 0, totalSegments: 4, previousRotation: 0, fullSpins: 6 });
    expect(rotation).toBeGreaterThanOrEqual(6 * 360);
  });

  test('ends exactly on the target segment midpoint regardless of previous rotation', () => {
    for (const previousRotation of [0, 123, 700, 4000]) {
      const rotation = getTargetRotation({ segmentIndex: 1, totalSegments: 4, previousRotation, fullSpins: 5 });
      const { midAngle } = getSegmentAngles(1, 4);
      const expectedMod = ((-midAngle % 360) + 360) % 360;
      expect(rotation % 360).toBeCloseTo(expectedMod, 5);
      expect(rotation).toBeGreaterThan(previousRotation);
    }
  });

  test('a later spin always rotates further than the one before it', () => {
    const first = getTargetRotation({ segmentIndex: 2, totalSegments: 5, previousRotation: 0 });
    const second = getTargetRotation({ segmentIndex: 0, totalSegments: 5, previousRotation: first });
    expect(second).toBeGreaterThan(first);
  });
});

describe('colorForSegment', () => {
  test('cycles through the fixed palette', () => {
    expect(colorForSegment(0)).toBe(SEGMENT_COLORS[0]);
    expect(colorForSegment(SEGMENT_COLORS.length)).toBe(SEGMENT_COLORS[0]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix client`
Expected: FAIL — `wheelMath.js` does not exist.

- [ ] **Step 3: Implement `wheelMath.js`**

```js
export function getSegmentAngles(index, total) {
  const segmentSize = 360 / total;
  const startAngle = index * segmentSize;
  const endAngle = startAngle + segmentSize;
  const midAngle = startAngle + segmentSize / 2;
  return { startAngle, endAngle, midAngle };
}

export function getTargetRotation({ segmentIndex, totalSegments, previousRotation = 0, fullSpins = 6 }) {
  const { midAngle } = getSegmentAngles(segmentIndex, totalSegments);
  const targetMod = ((-midAngle % 360) + 360) % 360;
  const currentMod = ((previousRotation % 360) + 360) % 360;
  let delta = targetMod - currentMod;
  if (delta <= 0) delta += 360;
  return previousRotation + fullSpins * 360 + delta;
}

function polarToCartesian(cx, cy, radius, angleDegreesFromTop) {
  const angleRad = (angleDegreesFromTop * Math.PI) / 180;
  return {
    x: cx + radius * Math.sin(angleRad),
    y: cy - radius * Math.cos(angleRad),
  };
}

export function describeSlicePath(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, 'Z'].join(
    ' '
  );
}

export const SEGMENT_COLORS = ['#ff3ea5', '#7c3aed', '#ffd60a', '#06d6a0', '#ff6b35', '#3b82f6', '#f43f5e', '#22c55e'];

export function colorForSegment(index) {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix client`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Wheel/wheelMath.js client/src/components/Wheel/wheelMath.test.js
git commit -m "Add pure wheel angle/rotation math with unit tests"
```

---

## Task 14: Landing page + floating background + first App routing

**Files:**
- Create: `client/src/components/FloatingBirthdayBits.jsx`
- Create: `client/src/pages/Landing.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `useAppContext` (Task 11), `useReducedMotion` (Task 11), `SoundToggle` (Task 12), `playClick` (Task 12).
- Produces: `<FloatingBirthdayBits count?={number} />`; route `/` renders `Landing`, which on valid submit sets `name` in context and navigates to `/wheel`.

- [ ] **Step 1: Implement `components/FloatingBirthdayBits.jsx`**

```jsx
import { motion } from 'framer-motion';
import { useReducedMotion } from '../lib/useReducedMotion.js';

const EMOJIS = ['🎈', '🎉', '🎂', '✨', '🎁', '🥳', '🍰', '🎊'];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function FloatingBirthdayBits({ count = 14 }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;

  const bits = Array.from({ length: count }, (_, i) => ({
    id: i,
    emoji: EMOJIS[i % EMOJIS.length],
    left: randomBetween(0, 100),
    size: randomBetween(1.5, 3),
    duration: randomBetween(10, 20),
    delay: randomBetween(0, 6),
  }));

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {bits.map((bit) => (
        <motion.span
          key={bit.id}
          className="absolute select-none"
          style={{ left: `${bit.left}%`, fontSize: `${bit.size}rem`, bottom: '-10%' }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: '-120vh', opacity: [0, 1, 1, 0] }}
          transition={{ duration: bit.duration, delay: bit.delay, repeat: Infinity, ease: 'linear' }}
        >
          {bit.emoji}
        </motion.span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement `pages/Landing.jsx`**

```jsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../state/AppContext.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';
import { playClick } from '../lib/sound.js';

export default function Landing() {
  const { name, setName } = useAppContext();
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Come on, everyone has a name 😏');
      return;
    }
    if (trimmed.length > 50) {
      setError("That's not a name, that's a novel 📖");
      return;
    }
    setError('');
    setName(trimmed);
    playClick();
    navigate('/wheel');
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits />
      <motion.h1
        initial={{ opacity: 0, y: -30, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
        className="font-display text-4xl font-extrabold drop-shadow-lg sm:text-5xl"
      >
        🎂 WELCOME TO MY BIRTHDAY 🎂
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-4 max-w-md text-lg font-semibold text-white/90 sm:text-xl"
      >
        Congratulations! You have been selected to buy me a gift.
      </motion.p>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5 }}
        className="mt-10 flex w-full max-w-sm flex-col items-center gap-3"
      >
        <label htmlFor="name" className="text-lg font-bold">
          What's your name?
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name..."
          maxLength={50}
          className="w-full rounded-2xl border-4 border-white/40 bg-white/10 px-5 py-3 text-center text-xl font-semibold text-white placeholder-white/60 outline-none backdrop-blur focus:border-white"
        />
        {error && (
          <p role="alert" className="font-semibold text-yellow-200">
            {error}
          </p>
        )}
        <motion.button
          type="submit"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          className="mt-2 rounded-full bg-party-yellow px-10 py-4 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20 transition"
        >
          LET'S GO! 🎉
        </motion.button>
      </motion.form>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `App.jsx` to wire routing for the first time**

```jsx
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import Landing from './pages/Landing.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    </AppProvider>
  );
}
```

- [ ] **Step 4: Verify manually in the browser**

Run: `npm run dev --prefix client`

Open `http://localhost:5173`. Verify: floating emoji drift upward in the background, the headline and subtitle animate in, clicking "LET'S GO! 🎉" with an empty name shows the funny validation message instead of navigating, and typing a name then clicking the button navigates to `/wheel` (which will render blank for now — that route is added in Task 15). Confirm the 🔊 mute toggle appears fixed in the top-right corner.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/FloatingBirthdayBits.jsx client/src/pages/Landing.jsx client/src/App.jsx
git commit -m "Add landing page with name entry and floating background"
```

---

## Task 15: Spin wheel component and page

**Files:**
- Create: `client/src/components/Wheel/Wheel.jsx`
- Create: `client/src/pages/Wheel.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `getSegmentAngles`, `describeSlicePath`, `colorForSegment`, `getTargetRotation` (Task 13); `getJson`, `postJson`, `ApiError` (Task 11); `useAppContext` (Task 11); `playWhirStart`, `playTick`, `playCelebration` (Task 12); `FloatingBirthdayBits` (Task 14).
- Produces: `<Wheel segments={{id,name}[]} rotation={number} spinning={boolean} />`; route `/wheel` — redirects to `/` if no name is set, fetches idle gift/settings state, spins via `POST /api/spin`, then sets `result` in context and navigates to `/result`.

- [ ] **Step 1: Implement `components/Wheel/Wheel.jsx`**

```jsx
import { motion } from 'framer-motion';
import { getSegmentAngles, describeSlicePath, colorForSegment } from './wheelMath.js';

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 8;

export function Wheel({ segments, rotation, spinning }) {
  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <div
        className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/4 text-4xl drop-shadow-lg"
        aria-hidden="true"
      >
        🔻
      </div>
      <motion.svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        animate={{ rotate: rotation }}
        transition={spinning ? { duration: 5, ease: [0.15, 0.85, 0.25, 1] } : { duration: 0 }}
        className="rounded-full border-8 border-white shadow-2xl"
      >
        {segments.map((segment, index) => {
          const { startAngle, endAngle, midAngle } = getSegmentAngles(index, segments.length);
          const path = describeSlicePath(CENTER, CENTER, RADIUS, startAngle, endAngle);
          const labelRad = (midAngle * Math.PI) / 180;
          const labelX = CENTER + RADIUS * 0.62 * Math.sin(labelRad);
          const labelY = CENTER - RADIUS * 0.62 * Math.cos(labelRad);
          return (
            <g key={segment.id}>
              <path d={path} fill={colorForSegment(index)} stroke="white" strokeWidth={2} />
              <text
                x={labelX}
                y={labelY}
                fill="white"
                fontSize={13}
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${midAngle}, ${labelX}, ${labelY})`}
              >
                {segment.name.length > 14 ? `${segment.name.slice(0, 13)}…` : segment.name}
              </text>
            </g>
          );
        })}
      </motion.svg>
    </div>
  );
}
```

- [ ] **Step 2: Implement `pages/Wheel.jsx`**

```jsx
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppContext } from '../state/AppContext.jsx';
import { Wheel } from '../components/Wheel/Wheel.jsx';
import { getTargetRotation } from '../components/Wheel/wheelMath.js';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';
import { getJson, postJson, ApiError } from '../lib/api.js';
import { playWhirStart, playTick, playCelebration } from '../lib/sound.js';

export default function WheelPage() {
  const { name, setResult } = useAppContext();
  const navigate = useNavigate();
  const [segments, setSegments] = useState([]);
  const [wheelEnabled, setWheelEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState('');
  const tickTimerRef = useRef(null);

  useEffect(() => {
    if (!name) {
      navigate('/');
      return;
    }
    async function loadIdleState() {
      try {
        const [giftsRes, settingsRes] = await Promise.all([
          getJson('/api/gifts/public'),
          getJson('/api/settings/public'),
        ]);
        setSegments(giftsRes.gifts);
        setWheelEnabled(settingsRes.wheelEnabled);
      } catch {
        setError('Could not load the wheel. Please refresh and try again.');
      } finally {
        setLoading(false);
      }
    }
    loadIdleState();
  }, [name, navigate]);

  useEffect(() => () => clearInterval(tickTimerRef.current), []);

  async function handleSpin() {
    if (spinning) return;
    setError('');
    setSpinning(true);
    try {
      const response = await postJson('/api/spin', { name });
      const finalSegments = response.wheelSegments;
      setSegments(finalSegments);
      const winningIndex = finalSegments.findIndex((g) => g.id === response.gift.id);
      const nextRotation = getTargetRotation({
        segmentIndex: winningIndex,
        totalSegments: finalSegments.length,
        previousRotation: rotation,
      });

      playWhirStart();
      let ticks = 0;
      tickTimerRef.current = setInterval(() => {
        ticks += 1;
        playTick();
        if (ticks > 24) clearInterval(tickTimerRef.current);
      }, 180);

      setRotation(nextRotation);
      window.setTimeout(() => {
        clearInterval(tickTimerRef.current);
        playCelebration();
        setResult({ participant: response.participant, gift: response.gift });
        navigate('/result');
      }, 5200);
    } catch (err) {
      setSpinning(false);
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={8} />
      <h2 className="font-display text-3xl font-extrabold drop-shadow sm:text-4xl">
        Your wallet is about to get lighter 💸
      </h2>

      {loading && <p className="text-lg font-semibold">Loading the wheel of destiny...</p>}

      {!loading && segments.length === 0 && (
        <p className="max-w-sm text-lg font-semibold text-yellow-200">
          No gifts are configured yet — bug the birthday human about it! 😅
        </p>
      )}

      {!loading && segments.length > 0 && <Wheel segments={segments} rotation={rotation} spinning={spinning} />}

      {error && (
        <p role="alert" className="max-w-sm font-semibold text-yellow-200">
          {error}
        </p>
      )}

      {!loading && segments.length > 0 && (
        <motion.button
          type="button"
          onClick={handleSpin}
          disabled={spinning || !wheelEnabled}
          whileHover={{ scale: spinning ? 1 : 1.05 }}
          whileTap={{ scale: spinning ? 1 : 0.92 }}
          className="rounded-full bg-party-yellow px-12 py-5 text-2xl font-extrabold text-purple-900 shadow-lg shadow-black/20 transition disabled:opacity-50"
        >
          {spinning ? 'SPINNING...' : wheelEnabled ? 'SPIN THE WHEEL 🎰' : 'The wheel is taking a nap 😴'}
        </motion.button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the `/wheel` route to `App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import Landing from './pages/Landing.jsx';
import WheelPage from './pages/Wheel.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/wheel" element={<WheelPage />} />
      </Routes>
    </AppProvider>
  );
}
```

- [ ] **Step 4: Verify manually against the real backend**

Set up `.env` per Task 9 Step 6 if not already done, then run both processes:
```bash
npm run dev
```
In a second terminal, seed one gift through the already-working admin API (built in Tasks 5–9) so the wheel has something to show:
```bash
curl -c cookies.txt -X POST http://localhost:3000/api/admin/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"<your ADMIN_PASSWORD>\"}"
curl -b cookies.txt -X POST http://localhost:3000/api/admin/gifts -F "name=AirPods" -F "productUrl=https://example.com/airpods" -F "active=true"
```
In the browser, go through Landing → enter a name → `/wheel`. Verify the wheel renders an "AirPods" segment, clicking "SPIN THE WHEEL 🎰" disables the button, spins the wheel for a few seconds with tick sounds (if unmuted), and lands exactly on the AirPods segment before navigating to `/result` (blank for now — added in Task 16).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Wheel/Wheel.jsx client/src/pages/Wheel.jsx client/src/App.jsx
git commit -m "Add spin wheel component and wheel page wired to the spin API"
```

---

## Task 16: Result page, confetti, and WhatsApp share

**Files:**
- Create: `client/src/components/Confetti.jsx`
- Create: `client/src/pages/Result.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `useAppContext` (Task 11), `useReducedMotion` (Task 11), `FloatingBirthdayBits` (Task 14).
- Produces: route `/result` — redirects to `/` if no `result` is in context; renders the gift, a random funny line, and a `https://wa.me/?text=...` share link built from the gift's `name` and `productUrl`.

- [ ] **Step 1: Implement `components/Confetti.jsx`**

```jsx
import { motion } from 'framer-motion';
import { useReducedMotion } from '../lib/useReducedMotion.js';

const COLORS = ['#ff3ea5', '#7c3aed', '#ffd60a', '#06d6a0', '#ff6b35'];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function Confetti({ count = 60 }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;

  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: randomBetween(0, 100),
    color: COLORS[i % COLORS.length],
    size: randomBetween(6, 12),
    duration: randomBetween(2.5, 4.5),
    delay: randomBetween(0, 0.6),
    rotate: randomBetween(0, 360),
  }));

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-[-5%] block"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.4, backgroundColor: p.color }}
          initial={{ y: 0, opacity: 1, rotate: 0 }}
          animate={{ y: '110vh', opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement `pages/Result.jsx`**

```jsx
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppContext } from '../state/AppContext.jsx';
import { Confetti } from '../components/Confetti.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';

const JOKES = [
  'Sorry. No take-backs.',
  "Yep... that's what you're buying me 😂",
  'The wheel has spoken. Democracy was never an option.',
  'May the odds be ever in my favor 😈',
];

export default function Result() {
  const { name, result, setName, setResult } = useAppContext();
  const navigate = useNavigate();
  const joke = useMemo(() => JOKES[Math.floor(Math.random() * JOKES.length)], []);

  useEffect(() => {
    if (!result) navigate('/');
  }, [result, navigate]);

  if (!result) return null;

  const { gift } = result;
  const message = [
    '🎁 Birthday Gift Assignment 🎁',
    '',
    "I spun the wheel and apparently I'm responsible for getting you:",
    '',
    `🎁 ${gift.name}`,
    '',
    'Apparently the wheel has spoken 😂',
    '',
    'Get it here:',
    gift.productUrl,
  ].join('\n');
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  function handleBackToStart() {
    setName('');
    setResult(null);
    navigate('/');
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden px-6 py-12 text-center text-white">
      <Confetti />
      <FloatingBirthdayBits count={6} />

      <motion.h1
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 12 }}
        className="font-display text-4xl font-extrabold drop-shadow-lg sm:text-5xl"
      >
        🎉 THE WHEEL HAS SPOKEN 🎉
      </motion.h1>

      <p className="text-lg font-semibold text-white/90">Hey {name},</p>
      <p className="text-lg font-semibold text-white/90">Your gift is:</p>

      <motion.div
        initial={{ y: 40, opacity: 0, rotate: -6 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 180 }}
        className="w-full max-w-xs rounded-3xl bg-white/15 p-6 shadow-2xl backdrop-blur"
      >
        {gift.imageUrl && (
          <img src={gift.imageUrl} alt={gift.name} className="mx-auto mb-4 h-40 w-40 rounded-2xl object-cover shadow-lg" />
        )}
        <p className="font-display text-2xl font-extrabold">{gift.name}</p>
        <p className="mt-2 text-sm font-semibold text-white/80">{joke}</p>
      </motion.div>

      <motion.a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        className="rounded-full bg-[#25D366] px-10 py-4 text-xl font-extrabold text-white shadow-lg shadow-black/20"
      >
        📱 SEND TO MY WHATSAPP
      </motion.a>

      <button type="button" onClick={handleBackToStart} className="text-sm font-semibold text-white/70 underline">
        Back to start
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add the `/result` route to `App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import Landing from './pages/Landing.jsx';
import WheelPage from './pages/Wheel.jsx';
import Result from './pages/Result.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/wheel" element={<WheelPage />} />
        <Route path="/result" element={<Result />} />
      </Routes>
    </AppProvider>
  );
}
```

- [ ] **Step 4: Verify manually end-to-end**

Continue from Task 15's running servers. Go through Landing → Wheel → spin. Verify: confetti falls, the gift card animates in with the seeded "AirPods" name (no image yet since none was uploaded), a random joke line appears, and clicking "📱 SEND TO MY WHATSAPP" opens `wa.me` in a new tab with the message pre-filled containing "AirPods" and `https://example.com/airpods`. Use the browser tool's `read_page` to confirm the anchor's `href` contains the URL-encoded gift name and product URL before actually opening WhatsApp.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Confetti.jsx client/src/pages/Result.jsx client/src/App.jsx
git commit -m "Add result page with confetti celebration and WhatsApp share"
```

---

## Task 17: Admin login page + authenticated layout guard

**Files:**
- Create: `client/src/pages/admin/Login.jsx`
- Create: `client/src/components/AdminLayout.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `getJson`, `postJson`, `ApiError` (Task 11).
- Produces: `<AdminLayout />` — on mount calls `GET /api/admin/me`; renders nav + `<Outlet />` if authenticated, otherwise redirects to `/admin/login`. Route `/admin/login` renders `AdminLogin`, which posts to `/api/admin/login` and navigates to `/admin` on success.

- [ ] **Step 1: Implement `components/AdminLayout.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { getJson, postJson } from '../lib/api.js';

export function AdminLayout() {
  const [status, setStatus] = useState('checking');
  const [username, setUsername] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getJson('/api/admin/me')
      .then((res) => {
        if (cancelled) return;
        setUsername(res.username);
        setStatus('authed');
      })
      .catch(() => {
        if (!cancelled) navigate('/admin/login');
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleLogout() {
    await postJson('/api/admin/logout', {});
    navigate('/admin/login');
  }

  if (status === 'checking') {
    return <div className="p-8 text-center text-white">Checking admin session...</div>;
  }

  const navLinkClass = ({ isActive }) =>
    `rounded-full px-4 py-2 text-sm font-bold transition ${
      isActive ? 'bg-white text-purple-900' : 'bg-white/10 text-white hover:bg-white/20'
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-pink-800 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <NavLink to="/admin" end className={navLinkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/admin/gifts" className={navLinkClass}>
            Gifts
          </NavLink>
          <NavLink to="/admin/participants" className={navLinkClass}>
            Participants
          </NavLink>
          <NavLink to="/admin/settings" className={navLinkClass}>
            Settings
          </NavLink>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white/70">Signed in as {username}</span>
          <button type="button" onClick={handleLogout} className="rounded-full bg-white/10 px-4 py-2 font-bold hover:bg-white/20">
            Log out
          </button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Implement `pages/admin/Login.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postJson, ApiError } from '../../lib/api.js';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await postJson('/api/admin/login', { username, password });
      navigate('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-900 to-pink-800 px-6 text-white">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-3xl bg-white/10 p-8 backdrop-blur">
        <h1 className="mb-6 text-center font-display text-2xl font-extrabold">🎂 Admin Login</h1>
        <label className="mb-1 block text-sm font-bold" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          autoComplete="username"
        />
        <label className="mb-1 block text-sm font-bold" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          autoComplete="current-password"
        />
        {error && (
          <p role="alert" className="mb-4 font-semibold text-yellow-200">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-party-yellow py-3 font-extrabold text-purple-900 disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Wire `/admin/login` and `/admin` into `App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import { AdminLayout } from './components/AdminLayout.jsx';
import Landing from './pages/Landing.jsx';
import WheelPage from './pages/Wheel.jsx';
import Result from './pages/Result.jsx';
import AdminLogin from './pages/admin/Login.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/wheel" element={<WheelPage />} />
        <Route path="/result" element={<Result />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />} />
      </Routes>
    </AppProvider>
  );
}
```

(`/admin` has no child pages yet — the nav shell will render with a blank content area until Task 18 adds nested routes. This is expected for this commit.)

- [ ] **Step 4: Verify manually**

With `npm run dev` running from Task 15, navigate to `http://localhost:5173/admin`. Verify it redirects to `/admin/login`. Try a wrong password — verify the friendly error appears. Log in with the real `ADMIN_USERNAME`/`ADMIN_PASSWORD` from `.env` — verify it lands on `/admin` showing the nav bar with "Signed in as admin" and an empty content area below. Click "Log out" and verify it returns to `/admin/login`, then confirm visiting `/admin` again redirects to login (session actually cleared).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/admin/Login.jsx client/src/components/AdminLayout.jsx client/src/App.jsx
git commit -m "Add admin login page and authenticated layout guard"
```

---

## Task 18: Admin dashboard, confirm dialog, and settings page

**Files:**
- Create: `client/src/components/StatCard.jsx`
- Create: `client/src/components/ConfirmDialog.jsx`
- Create: `client/src/pages/admin/Dashboard.jsx`
- Create: `client/src/pages/admin/Settings.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `getJson`, `putJson`, `postJson` (Task 11).
- Produces: `<StatCard emoji label value />`; `<ConfirmDialog open title description confirmLabel onConfirm onCancel />` (reused by Tasks 19–20 for other destructive actions); route `/admin` (index) renders the dashboard; route `/admin/settings` renders the settings page with the "reset all results" destructive action gated behind `ConfirmDialog`.

- [ ] **Step 1: Implement `components/StatCard.jsx`**

```jsx
export function StatCard({ emoji, label, value }) {
  return (
    <div className="rounded-2xl bg-white/10 p-6 text-center shadow-lg backdrop-blur">
      <div className="text-4xl">{emoji}</div>
      <div className="mt-2 text-3xl font-extrabold">{value}</div>
      <div className="mt-1 text-sm font-semibold text-white/70">{label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `components/ConfirmDialog.jsx`**

```jsx
import { motion, AnimatePresence } from 'framer-motion';

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-sm rounded-3xl bg-purple-900 p-6 text-white shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <h2 id="confirm-dialog-title" className="mb-2 text-xl font-extrabold">
              {title}
            </h2>
            <p className="mb-6 text-sm text-white/80">{description}</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onCancel} className="rounded-full bg-white/10 px-5 py-2 font-bold hover:bg-white/20">
                Cancel
              </button>
              <button type="button" onClick={onConfirm} className="rounded-full bg-red-600 px-5 py-2 font-bold hover:bg-red-500">
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Implement `pages/admin/Dashboard.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { getJson } from '../../lib/api.js';
import { StatCard } from '../../components/StatCard.jsx';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getJson('/api/admin/stats')
      .then(setStats)
      .catch(() => setError('Could not load stats.'));
  }, []);

  if (error) return <p className="font-semibold text-yellow-200">{error}</p>;
  if (!stats) return <p>Loading stats...</p>;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard emoji="🎉" label="Participants" value={stats.totalParticipants} />
      <StatCard emoji="🎁" label="Gifts" value={stats.totalGifts} />
      <StatCard emoji="✅" label="Active Gifts" value={stats.activeGifts} />
      <StatCard emoji="🔥" label="Gifts Assigned" value={stats.giftsAssigned} />
      <StatCard emoji="📦" label="Gifts Remaining" value={stats.giftsRemaining ?? '∞'} />
    </div>
  );
}
```

- [ ] **Step 4: Implement `pages/admin/Settings.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { getJson, putJson, postJson } from '../../lib/api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    getJson('/api/admin/settings').then(setSettings);
  }, []);

  async function updateSetting(key, value) {
    const updated = await putJson('/api/admin/settings', { [key]: value });
    setSettings(updated);
  }

  async function handleReset() {
    await postJson('/api/admin/participants/reset', {});
    setConfirmingReset(false);
    setMessage('All results have been reset. Every gift is available again.');
  }

  if (!settings) return <p>Loading settings...</p>;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between rounded-2xl bg-white/10 p-5">
        <div>
          <p className="font-bold">Wheel enabled</p>
          <p className="text-sm text-white/70">Turn the wheel off to pause spinning for everyone.</p>
        </div>
        <input
          type="checkbox"
          checked={settings.wheelEnabled}
          onChange={(e) => updateSetting('wheelEnabled', e.target.checked)}
          className="h-6 w-6"
        />
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-white/10 p-5">
        <div>
          <p className="font-bold">Allow repeat gifts</p>
          <p className="text-sm text-white/70">If off, each gift can only be won once.</p>
        </div>
        <input
          type="checkbox"
          checked={settings.allowRepeatGifts}
          onChange={(e) => updateSetting('allowRepeatGifts', e.target.checked)}
          className="h-6 w-6"
        />
      </div>

      <div className="rounded-2xl bg-red-500/20 p-5">
        <p className="font-bold">Reset all results</p>
        <p className="mb-3 text-sm text-white/80">
          Deletes every participant record and makes all gifts available again. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => setConfirmingReset(true)}
          className="rounded-full bg-red-500 px-5 py-2 font-bold text-white"
        >
          Reset all results
        </button>
      </div>

      {message && <p className="font-semibold text-green-200">{message}</p>}

      <ConfirmDialog
        open={confirmingReset}
        title="Reset all results?"
        description="This permanently deletes every participant record and makes all gifts available again. This cannot be undone."
        confirmLabel="Yes, delete everything"
        onConfirm={handleReset}
        onCancel={() => setConfirmingReset(false)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Nest Dashboard and Settings under `/admin` in `App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import { AdminLayout } from './components/AdminLayout.jsx';
import Landing from './pages/Landing.jsx';
import WheelPage from './pages/Wheel.jsx';
import Result from './pages/Result.jsx';
import AdminLogin from './pages/admin/Login.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminSettings from './pages/admin/Settings.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/wheel" element={<WheelPage />} />
        <Route path="/result" element={<Result />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
```

- [ ] **Step 6: Verify manually**

Log into `/admin`. Verify the dashboard shows 5 stat cards with real numbers matching the seeded gift/participant from earlier tasks. Go to the "Settings" nav tab, toggle "Allow repeat gifts" on and off — reload the page and confirm the checkbox reflects the persisted value. Click "Reset all results" — verify the `ConfirmDialog` appears, cancel it (nothing happens), click it again and confirm — verify the success message appears and the dashboard's "Gifts Assigned" count drops to 0.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/StatCard.jsx client/src/components/ConfirmDialog.jsx client/src/pages/admin/Dashboard.jsx client/src/pages/admin/Settings.jsx client/src/App.jsx
git commit -m "Add admin dashboard, reusable confirm dialog, and settings page"
```

---

## Task 19: Admin gift management page

**Files:**
- Create: `client/src/pages/admin/Gifts.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `getJson`, `postForm`, `putForm`, `patchJson`, `del`, `ApiError` (Task 11); `ConfirmDialog` (Task 18).
- Produces: route `/admin/gifts` — full CRUD UI: add/edit form with image file input + live preview, table with thumbnail/name/URL/active toggle/edit/delete, delete gated behind `ConfirmDialog`.

- [ ] **Step 1: Implement `pages/admin/Gifts.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { getJson, postForm, putForm, patchJson, del, ApiError } from '../../lib/api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';

const EMPTY_FORM = { name: '', productUrl: '', active: true, imageFile: null };

export default function AdminGifts() {
  const [gifts, setGifts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  async function loadGifts() {
    const res = await getJson('/api/admin/gifts');
    setGifts(res.gifts);
  }

  useEffect(() => {
    loadGifts();
  }, []);

  function handleImageChange(e) {
    const file = e.target.files?.[0] ?? null;
    setForm((f) => ({ ...f, imageFile: file }));
    setImagePreview(file ? URL.createObjectURL(file) : null);
  }

  function startEdit(gift) {
    setEditingId(gift.id);
    setForm({ name: gift.name, productUrl: gift.productUrl, active: gift.active, imageFile: null });
    setImagePreview(gift.imageUrl);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImagePreview(null);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const body = new FormData();
    body.set('name', form.name);
    body.set('productUrl', form.productUrl);
    body.set('active', String(form.active));
    if (form.imageFile) body.set('image', form.imageFile);

    try {
      if (editingId) {
        await putForm(`/api/admin/gifts/${editingId}`, body);
      } else {
        await postForm('/api/admin/gifts', body);
      }
      resetForm();
      await loadGifts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the gift.');
    }
  }

  async function toggleActive(gift) {
    await patchJson(`/api/admin/gifts/${gift.id}/active`, { active: !gift.active });
    await loadGifts();
  }

  async function confirmDelete() {
    await del(`/api/admin/gifts/${deletingId}`);
    setDeletingId(null);
    await loadGifts();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="max-w-lg space-y-4 rounded-2xl bg-white/10 p-6">
        <h2 className="font-display text-xl font-extrabold">{editingId ? 'Edit gift' : 'Add gift'}</h2>

        <div>
          <label className="mb-1 block text-sm font-bold" htmlFor="gift-name">
            Gift Name
          </label>
          <input
            id="gift-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            maxLength={100}
            className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold" htmlFor="gift-url">
            Gift URL
          </label>
          <input
            id="gift-url"
            type="url"
            value={form.productUrl}
            onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))}
            required
            placeholder="https://example.com/product"
            className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold" htmlFor="gift-image">
            Gift Image
          </label>
          <input
            id="gift-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
            className="w-full text-sm"
          />
          {imagePreview && <img src={imagePreview} alt="Preview" className="mt-3 h-24 w-24 rounded-xl object-cover" />}
        </div>

        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            className="h-5 w-5"
          />
          Active
        </label>

        {error && <p className="font-semibold text-yellow-200">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="rounded-full bg-party-yellow px-6 py-3 font-extrabold text-purple-900">
            {editingId ? 'Save changes' : 'Add gift'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="rounded-full bg-white/20 px-6 py-3 font-bold">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl bg-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/20 text-white/70">
              <th className="p-3">Image</th>
              <th className="p-3">Name</th>
              <th className="p-3">URL</th>
              <th className="p-3">Active</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {gifts.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-white/60">
                  No gifts yet — add your first one above.
                </td>
              </tr>
            )}
            {gifts.map((gift) => (
              <tr key={gift.id} className="border-b border-white/10">
                <td className="p-3">
                  {gift.imageUrl ? (
                    <img src={gift.imageUrl} alt={gift.name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <span className="text-white/40">—</span>
                  )}
                </td>
                <td className="p-3 font-bold">{gift.name}</td>
                <td className="max-w-[200px] truncate p-3">
                  <a href={gift.productUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {gift.productUrl}
                  </a>
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => toggleActive(gift)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${gift.active ? 'bg-green-500' : 'bg-white/20'}`}
                  >
                    {gift.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(gift)}
                      className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(gift.id)}
                      className="rounded-full bg-red-500/80 px-3 py-1 text-xs font-bold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete this gift?"
        description="This permanently removes the gift. Past participants who already won it keep their record, shown as '(gift removed)'."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the `/admin/gifts` route to `App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import { AdminLayout } from './components/AdminLayout.jsx';
import Landing from './pages/Landing.jsx';
import WheelPage from './pages/Wheel.jsx';
import Result from './pages/Result.jsx';
import AdminLogin from './pages/admin/Login.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminGifts from './pages/admin/Gifts.jsx';
import AdminSettings from './pages/admin/Settings.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/wheel" element={<WheelPage />} />
        <Route path="/result" element={<Result />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="gifts" element={<AdminGifts />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
```

- [ ] **Step 3: Verify manually**

Go to `/admin/gifts`. Add a new gift with a real image file, a name, and a URL — verify it appears in the table with a thumbnail. Click "Edit" on it, change the name, save — verify the table updates. Click the "Active" pill to toggle it to "Inactive" — then open the public wheel at `/wheel` in a new tab and confirm that gift no longer appears as a segment (re-enable it afterward if you want it for later verification steps). Click "Delete", confirm via the dialog, and verify the row disappears.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/Gifts.jsx client/src/App.jsx
git commit -m "Add admin gift management page with image upload and preview"
```

---

## Task 20: Admin participants page

**Files:**
- Create: `client/src/pages/admin/Participants.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `getJson`, `del` (Task 11); `ConfirmDialog` (Task 18).
- Produces: route `/admin/participants` — searchable/sortable table (name, gift name + thumbnail, date, time, total count), per-row delete gated behind `ConfirmDialog`. A participant whose gift was deleted shows "(gift removed)" instead of erroring (per spec §6).

- [ ] **Step 1: Implement `pages/admin/Participants.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { getJson, del } from '../../lib/api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';

export default function AdminParticipants() {
  const [participants, setParticipants] = useState([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  async function load() {
    const params = new URLSearchParams({ sort, search });
    const res = await getJson(`/api/admin/participants?${params.toString()}`);
    setParticipants(res.participants);
    setTotal(res.total);
  }

  useEffect(() => {
    load();
  }, [sort, search]);

  async function confirmDelete() {
    await del(`/api/admin/participants/${deletingId}`);
    setDeletingId(null);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold">Total participants: {total}</p>
        <div className="flex gap-3">
          <input
            type="search"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-full border-2 border-white/30 bg-white/10 px-4 py-2 text-sm outline-none focus:border-white"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-full border-2 border-white/30 bg-white/10 px-4 py-2 text-sm outline-none focus:border-white"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/20 text-white/70">
              <th className="p-3">Name</th>
              <th className="p-3">Gift</th>
              <th className="p-3">Date</th>
              <th className="p-3">Time</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-white/60">
                  No one has spun the wheel yet.
                </td>
              </tr>
            )}
            {participants.map((p) => {
              const date = new Date(p.createdAt);
              return (
                <tr key={p.id} className="border-b border-white/10">
                  <td className="p-3 font-bold">{p.name}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {p.giftImageUrl && <img src={p.giftImageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />}
                      <span>{p.giftName ?? '(gift removed)'}</span>
                    </div>
                  </td>
                  <td className="p-3">{date.toLocaleDateString()}</td>
                  <td className="p-3">{date.toLocaleTimeString()}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => setDeletingId(p.id)}
                      className="rounded-full bg-red-500/80 px-3 py-1 text-xs font-bold"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete this participant?"
        description="This permanently removes their spin record."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the `/admin/participants` route to `App.jsx`** (final routing state)

```jsx
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import { AdminLayout } from './components/AdminLayout.jsx';
import Landing from './pages/Landing.jsx';
import WheelPage from './pages/Wheel.jsx';
import Result from './pages/Result.jsx';
import AdminLogin from './pages/admin/Login.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminGifts from './pages/admin/Gifts.jsx';
import AdminParticipants from './pages/admin/Participants.jsx';
import AdminSettings from './pages/admin/Settings.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/wheel" element={<WheelPage />} />
        <Route path="/result" element={<Result />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="gifts" element={<AdminGifts />} />
          <Route path="participants" element={<AdminParticipants />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
```

- [ ] **Step 3: Verify manually**

Go to `/admin/participants`. Verify the table lists everyone who has spun so far with correct name, gift, date, and time, and that "Total participants" matches. Type part of a name into the search box and confirm the table filters live. Switch the sort dropdown to "Oldest first" and confirm order flips. Delete one participant via the confirm dialog and verify the row disappears and the total decrements. Delete a gift from `/admin/gifts` that has a participant attached to it, then confirm that participant's row now shows "(gift removed)" instead of breaking.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/Participants.jsx client/src/App.jsx
git commit -m "Add admin participants page with search, sort, and delete"
```

---

## Task 21: Production build wiring and verification

**Files:**
- Modify: `package.json` (root)
- Modify: `server/package.json`
- Modify: `client/package.json`

**Interfaces:** none new — this task pins a supported Node range and verifies the production code path built in Task 9 (`isProduction` static serving + SPA fallback) actually works end-to-end, since every prior manual verification ran in dev mode only.

- [ ] **Step 1: Pin a Node engine range in all three `package.json` files**

Add this key to `package.json`, `server/package.json`, and `client/package.json` — this project's server code uses the built-in `node:sqlite` module (Task 2 amendment), which does not exist before Node 22.5 and needed an `--experimental-sqlite` flag on some versions in that range; `>=22.12.0` is the documented safe floor, though this plan was built and verified against Node 24.x specifically, which is what the README recommends pinning to for both local dev and deployment:
```json
"engines": {
  "node": ">=22.12.0"
}
```
**Merge this key into the existing file — do not overwrite/recreate any of the three `package.json` files.** Every other field (scripts, dependencies) must stay exactly as earlier tasks left them.

- [ ] **Step 2: Build the client**

Run:
```bash
npm run build
```
Expected: completes without errors and creates `client/dist/index.html` plus a `client/dist/assets/` directory.

- [ ] **Step 3: Run the server in production mode**

Edit `.env` and set `NODE_ENV=production`, then run:
```bash
npm start
```
Expected: console prints `Server listening on http://localhost:3000` (no Vite dev server involved this time — one process serves everything).

- [ ] **Step 4: Verify the single-origin production behavior**

In another terminal:
```bash
curl -i http://localhost:3000/api/health
curl -s http://localhost:3000/ | head -c 200
curl -s http://localhost:3000/wheel | head -c 200
```
Expected: the first call returns `{"ok":true}`; the second and third both return the same built `index.html` markup (confirms the SPA fallback route serves the client for any non-API path, including deep links like `/wheel`).

- [ ] **Step 5: Full manual pass against the production build**

Open `http://localhost:3000` in the browser tool (note: everything is now on port 3000, not 5173). Walk through Landing → name entry → Wheel → spin → Result → WhatsApp share link, and separately log into `/admin` and click through Dashboard/Gifts/Participants/Settings. Confirm everything that worked in dev mode (Tasks 14–20) still works identically when served from the production build.

- [ ] **Step 6: Revert to development mode**

Edit `.env` back to `NODE_ENV=development`. Stop the production server.

- [ ] **Step 7: Commit**

```bash
git add package.json server/package.json client/package.json
git commit -m "Pin supported Node engine range for deployment"
```

---

## Task 22: README

**Files:**
- Create: `README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Write `README.md`**

````markdown
# 🎂 Birthday Gift Wheel

A funny, flashy birthday mini-game: a guest types their name, spins an animated
wheel, and the server assigns them a gift they're now "responsible" for buying
the birthday person — then they share it to WhatsApp with one tap. A protected
admin console manages the gift catalog, tracks every spin, and controls wheel
behavior.

## Tech stack

- **Client:** React + Vite + Tailwind CSS + Framer Motion
- **Server:** Node.js 24.x + Express + `node:sqlite` (Node's built-in SQLite module — no native/npm database dependency)
- **Database:** SQLite (file-based, no separate DB server needed)

> **Requires Node 24.x.** This project uses Node's built-in `node:sqlite`
> module, which doesn't exist before Node 22.5 and needs a recent Node build
> to run unflagged. Check your version with `node --version` before
> installing, and use a version manager (nvm/fnm/volta) to switch if needed.

## Install

```bash
npm run install:all
```

This installs dependencies for both `server/` and `client/`.

## Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | Purpose |
|---|---|
| `PORT` | Port the Express server listens on (default `3000`) |
| `NODE_ENV` | `development` or `production` |
| `SESSION_SECRET` | Long random string used to sign admin session cookies — generate one with `openssl rand -hex 32` (or any password manager) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Used **once**, on first server boot, to create the one admin account |
| `SQLITE_PATH` | Where the SQLite database file lives (default `server/data/app.db`) |
| `UPLOADS_DIR` | Where uploaded gift images are stored (default `server/data/uploads`) |

## Run in development

```bash
npm run dev
```

Starts the Express API on `http://localhost:3000` and the Vite dev server on
`http://localhost:5173` (which proxies `/api` and `/uploads` to the API). Open
`http://localhost:5173` in your browser.

## Create the admin account

The admin account is created automatically the first time the server boots
with `ADMIN_USERNAME` and `ADMIN_PASSWORD` set in `.env` **and no admin account
already exists** in the database. After that first boot, changing `.env` does
nothing — the seed step only ever runs once, so a stray restart can't silently
change your password out from under you. If you need to change the admin
password later, the straightforward path is to delete the `admin_users` row
from the SQLite database (e.g. with the `sqlite3` CLI or a GUI browser like
DB Browser for SQLite) and restart the server with new `.env` values.

## Add gifts

1. Go to `/admin/login` and sign in.
2. Open the "Gifts" tab.
3. Fill in Gift Name, Gift URL, optionally upload an image (JPEG/PNG/WEBP, up
   to 5MB), leave "Active" checked, and click "Add gift".
4. Only **active** gifts appear on the public wheel.

## Build for production

```bash
npm run build
```

Builds the client into `client/dist`.

## Run in production

```bash
NODE_ENV=production npm start
```

This serves both the built client and the API from a single Express process
on `PORT` — one URL for guests to open from WhatsApp, no CORS configuration
needed.

## Deploy (Render or Railway)

1. Push this repository to GitHub.
2. Create a new Web Service pointed at the repo.
3. Build command: `npm run install:all && npm run build`
4. Start command: `npm start`
5. Set environment variables from the table above in the host's dashboard
   (`SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `NODE_ENV=production`).
6. **Attach a persistent disk** (a Render Disk or Railway Volume — e.g. 1GB
   mounted at `/data`). This step is not optional: without it, the default
   web service disk is wiped on every deploy/restart, silently deleting the
   database and every uploaded gift image. Point `SQLITE_PATH=/data/app.db`
   and `UPLOADS_DIR=/data/uploads` at the mounted disk.
7. **Pin the Node version to 24.x explicitly** in the host's runtime/Node
   version setting (don't rely solely on `package.json`'s `engines` field —
   hosts don't always default to a version recent enough for `node:sqlite`).
8. Deploy, then share the resulting URL.

## Database

SQLite via Node's built-in `node:sqlite` module (`DatabaseSync`) — no native
compilation, no extra npm dependency. The file lives at `SQLITE_PATH`. Tables
(`admin_users`, `gifts`, `participants`, `settings`, `sessions`) are created automatically
on first boot — see `server/src/db/index.js`. There is no separate migration
tool; schema changes at this project's scale are made directly in that file
using `CREATE TABLE IF NOT EXISTS`.

## Testing

```bash
npm test --prefix server   # unit + integration tests (node:test + supertest)
npm test --prefix client   # pure-logic unit tests (vitest) for api.js, sound.js, wheelMath.js
```

## Project structure

```
birthday-gift-game/
  client/       React SPA (Vite, Tailwind, Framer Motion)
  server/       Express API + SQLite
  docs/         design spec and implementation plan
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with setup, deployment, and database documentation"
```

---

## Task 23: Full manual end-to-end QA pass

**Files:** none — this task is verification only, using the browser tool against the running dev server, fixing any real bugs it uncovers in whichever file(s) they turn out to be in.

**Interfaces:** none.

- [ ] **Step 1: Start fresh and reset state**

Run `npm run dev`. In the admin Settings page, click "Reset all results" to start the QA pass from a clean slate. In the admin Gifts page, make sure at least two active gifts exist (add a second one if only the "AirPods" test gift remains from earlier tasks).

- [ ] **Step 2: Walk the golden path (browser tool)**

1. Open the site fresh (`http://localhost:5173`). Confirm the funny landing copy and floating background render.
2. Enter a name and click "LET'S GO! 🎉" — confirm it lands on the wheel.
3. Click "SPIN THE WHEEL 🎰" — confirm the wheel spins, ticks, and lands on a specific segment.
4. Confirm the result screen shows the correct gift name, image (if one was uploaded), a joke line, and the WhatsApp button.
5. Confirm `GET /api/admin/participants` (via the admin Participants page) now shows this new participant with the correct name, gift, date, and time.

- [ ] **Step 3: Verify the selected gift is genuinely server-determined**

Using `read_network_requests` in the browser tool, inspect the actual `POST /api/spin` response body and confirm the `gift` field in the response matches what the Result screen displays — this is the check that the frontend is not fabricating the outcome client-side.

- [ ] **Step 4: Admin CRUD checks**

1. Add a new gift with an uploaded image; verify it appears on the public wheel on the next visit to `/wheel`.
2. Edit that gift's name; verify the change is reflected both in the admin table and on the wheel.
3. Deactivate a gift; reload `/wheel` and confirm it no longer appears as a segment.
4. Delete a gift that has at least one participant attached; confirm the Participants table shows "(gift removed)" for that row instead of erroring.

- [ ] **Step 5: Gift-distribution behavior**

1. With "Allow repeat gifts" OFF (the default), spin until every active gift has been won at least once, then attempt one more spin — confirm the wheel shows the friendly "no gifts left" state rather than crashing.
2. Turn "Allow repeat gifts" ON in Settings, spin again, and confirm a gift that was already won can be won again.
3. Turn the wheel off entirely via Settings ("Wheel enabled" unchecked); reload `/wheel` and confirm the spin button is disabled with the "taking a nap" message, and a direct `POST /api/spin` (e.g. via curl) returns 403.

- [ ] **Step 6: Invalid input handling**

1. On the landing page, try submitting an empty name and a 51+ character name — confirm both show friendly validation errors and do not navigate.
2. In the admin Gifts form, try submitting an invalid URL (e.g. `not-a-url`) — confirm the form shows an error and does not create a gift.
3. Try uploading a `.txt` file renamed to look like an image, and a file over 5MB — confirm both are rejected with a clear message (per Task 7's automated tests, but re-confirm through the actual browser file picker here).

- [ ] **Step 7: Admin authentication checks**

1. In a private/incognito browser context, navigate directly to `/admin` — confirm it redirects to `/admin/login` rather than exposing any data.
2. Attempt login with a wrong password 3–4 times in a row — confirm each attempt fails cleanly (and note that a real brute-force attempt would eventually hit the login rate limiter from Task 9).
3. Log in, then open the same admin session in a second tab and click "Log out" in one tab — confirm the other tab's next admin API call also gets a 401 (session actually invalidated server-side, not just hidden client-side).

- [ ] **Step 8: Mobile responsive check**

Use the browser tool's `resize_window` with the `mobile` preset (375×812). Re-walk the golden path from Step 2 at this size. Confirm: the wheel fits on screen without horizontal scrolling, the name input and spin button are comfortably tappable, the result card and WhatsApp button are fully visible without zooming, and the admin tables scroll horizontally within their own container rather than breaking the page layout.

- [ ] **Step 9: Fix any issues found**

If any of the above steps surfaced a real bug, fix it in the relevant file from the task that introduced it, re-run that task's automated tests (`npm test --prefix server` and/or `npm test --prefix client`) to confirm no regression, and re-verify the specific QA step that failed. Commit each fix separately with a message describing the bug, e.g.:

```bash
git add <fixed files>
git commit -m "Fix: <short description of the bug found during QA>"
```

- [ ] **Step 10: Final full test suite run**

Run both test suites one last time to confirm a clean baseline after any QA fixes:
```bash
npm test --prefix server
npm test --prefix client
```
Expected: PASS for every test file in both suites.

---

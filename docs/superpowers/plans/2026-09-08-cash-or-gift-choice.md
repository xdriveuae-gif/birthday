# Cash-or-Gift Choice + Multi-Spin + Submit/Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest choose Cash or Gift after entering their name; Gift optionally unlocks a second spin via a "will you get me 2 gifts?" question; every gift/cash pick requires an explicit Submit (with a confirm popup) before it's saved, and Retry (up to 2 per gift, free) re-spins without touching the database.

**Architecture:** Splits the existing single-step "spin picks and saves" contract into two phases: `POST /api/spin` now only picks (no write), and a new `POST /api/participants` does the actual save, re-validating eligibility first. Three new client pages (Choice, LoveQuestion, Cash) sit between Landing and Wheel; Wheel and Result are modified to support the pick-then-confirm flow and the 2-gift loop.

**Tech Stack:** Same as the base app — Node/Express/node:sqlite server, React/Vite/Tailwind/Framer Motion client. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-08-cash-or-gift-choice-design.md](../specs/2026-09-08-cash-or-gift-choice-design.md) — read this too; it explains the *why* behind the architecture split. This plan's code already reflects the spec's decisions.

## Global Constraints

- `POST /api/spin` no longer writes to the database — it only picks and returns a candidate. Nothing is saved until `POST /api/participants` succeeds.
- `POST /api/participants` re-validates gift eligibility (active, not already won when repeats are disabled, wheel still enabled) before writing — a stale/contested pick returns 409 `GIFT_NO_LONGER_AVAILABLE`.
- `participants.gift_id` is nullable; `participants.outcome` is `'gift'` or `'cash'`.
- New setting `cliq_alias` (default `'OH98'`), same admin-editable pattern as `wheel_enabled`/`allow_repeat_gifts`.
- Retry: up to 2 retries per gift slot (3 total spin attempts), free (no DB write). Resets to 2 whenever a new gift slot begins.
- `giftsAssigned`/`giftsRemaining` stats stay scoped to `outcome = 'gift'` rows only; cash picks never affect gift scarcity.
- Exact copy to reuse verbatim:
  - Love question: `If you love me... will you get me 2 gifts? 🥺🎁🎁`
  - 2-gifts-unlocked confirmation: `🎉 2 spin chances unlocked! Make 'em cheap ones 😏`
  - Gift submit confirm popup title: `Are you sure??` / description: `Hitting submit means you're LEGALLY buying this. Probably. 😂`
  - Cash submit confirm popup title: `You sure about this?` / description: `Hitting submit means cash it is 😏 No take-backs.`
  - Gift-slot badge (when `spinsAllowed > 1`): `🎁 Gift {spinsCompleted + 1} of {spinsAllowed}`
  - Final submitted state (gift): `✅ Locked in! Go spend responsibly 😂`
  - Final submitted state (cash): `✅ Locked in!`
- This project has no migration framework (base spec §3). Since no real party data exists yet, the schema change is applied by editing the `CREATE TABLE IF NOT EXISTS` statements directly — the implementer deletes the local dev `server/data/app.db*` files once as part of Task 1, documented loudly so it's never confused with a real-deployment data-loss step.

---

## Task 1: Database schema — nullable gift_id, outcome column, cliq_alias setting

**Files:**
- Modify: `server/src/db/index.js`
- Modify: `server/test/db.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `initDb` now creates `participants` with `gift_id` nullable and a new `outcome TEXT NOT NULL DEFAULT 'gift'` column, and seeds a `cliq_alias` settings row (default `'OH98'`) alongside the existing two.

- [ ] **Step 1: Write the failing test**

Add to `server/test/db.test.js` (alongside the existing tests, same file, same imports already present):

```js
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
  assert.equal(rows[1].outcome, 'gift'); // default applies even though this row is conceptually a cash row created without setting it
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `cliq_alias` row doesn't exist yet; inserting a `participants` row with `gift_id = null` currently violates `NOT NULL`.

- [ ] **Step 3: Modify `db/index.js`**

Change the `participants` table definition and add the new settings seed row:

```js
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gift_id INTEGER REFERENCES gifts(id),
      outcome TEXT NOT NULL DEFAULT 'gift',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

(Only the `gift_id` line loses `NOT NULL` and the new `outcome` line is added — everything else in that `CREATE TABLE` block stays the same.)

And in the default-settings seeding block:

```js
  const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertDefault.run('allow_repeat_gifts', 'false');
  insertDefault.run('wheel_enabled', 'true');
  insertDefault.run('cliq_alias', 'OH98');
```

- [ ] **Step 4: Delete the local dev database so the new schema takes effect**

```bash
rm -f server/data/app.db server/data/app.db-shm server/data/app.db-wal
```

This is safe — there's no real party data yet, and `initDb`'s `CREATE TABLE IF NOT EXISTS` does not alter an already-existing table's columns, so the old dev database would otherwise keep the stale schema.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS (full suite, including the two new tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/db/index.js server/test/db.test.js
git commit -m "Add outcome column, nullable gift_id, and cliq_alias setting"
```

---

## Task 2: Database layer — outcome-aware participants queries

**Files:**
- Modify: `server/src/db/settings.js`
- Modify: `server/src/db/participants.js`
- Modify: `server/test/db.test.js` (settings round-trip)
- Modify: `server/test/participants-db.test.js`

**Interfaces:**
- Consumes: Task 1's schema.
- Produces:
  - `getAllSettings(db): { allowRepeatGifts, wheelEnabled, cliqAlias }` (adds `cliqAlias`)
  - `updateSettings(db, { allowRepeatGifts?, wheelEnabled?, cliqAlias? })` (accepts `cliqAlias`)
  - `insertParticipant(db, { name, giftId?: number|null, outcome?: 'gift'|'cash' }): Participant` — `giftId` defaults to `null`, `outcome` defaults to `'gift'`
  - `mapParticipantRow` (internal) now includes `outcome` in its output
  - `listWonGiftIds(db): Set<number>` — now explicitly excludes cash rows (`gift_id IS NOT NULL`)
  - `countByOutcome(db, outcome: 'gift'|'cash'): number` — new export

- [ ] **Step 1: Write failing tests**

Add to `server/test/db.test.js`:

```js
test('getAllSettings includes cliqAlias, updateSettings can change it', () => {
  const db = initDb(':memory:');
  assert.equal(getAllSettings(db).cliqAlias, 'OH98');
  updateSettings(db, { cliqAlias: 'AB12' });
  assert.equal(getAllSettings(db).cliqAlias, 'AB12');
  // unrelated keys stay untouched
  assert.equal(getAllSettings(db).wheelEnabled, true);
});
```

Add to `server/test/participants-db.test.js` (extend the existing file, same imports already present):

```js
test('insertParticipant defaults to outcome "gift" and giftId null', () => {
  const { db, gift } = setup();
  const withGift = insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  assert.equal(withGift.outcome, 'gift');
  assert.equal(withGift.giftId, gift.id);

  const cash = insertParticipant(db, { name: 'Sara', outcome: 'cash' });
  assert.equal(cash.outcome, 'cash');
  assert.equal(cash.giftId, null);
});

test('listWonGiftIds ignores cash rows', () => {
  const { db, gift } = setup();
  insertParticipant(db, { name: 'Sara', outcome: 'cash' });
  assert.deepEqual(listWonGiftIds(db), new Set());
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  assert.deepEqual(listWonGiftIds(db), new Set([gift.id]));
});

test('countByOutcome counts gift and cash rows separately', () => {
  const { db, gift } = setup();
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  insertParticipant(db, { name: 'Sara', outcome: 'cash' });
  insertParticipant(db, { name: 'Omar', outcome: 'cash' });
  assert.equal(countByOutcome(db, 'gift'), 1);
  assert.equal(countByOutcome(db, 'cash'), 2);
});

test('listParticipants includes outcome and null gift fields for cash rows', () => {
  const { db } = setup();
  insertParticipant(db, { name: 'Sara', outcome: 'cash' });
  const [row] = listParticipants(db, { sort: 'newest', search: '' });
  assert.equal(row.outcome, 'cash');
  assert.equal(row.giftName, null);
  assert.equal(row.giftImageUrl, null);
});
```

Update the test file's import line to include `countByOutcome`:
```js
import {
  listWonGiftIds,
  insertParticipant,
  listParticipants,
  countParticipants,
  countByOutcome,
  deleteParticipant,
  deleteAllParticipants,
} from '../src/db/participants.js';
```

And `server/test/db.test.js`'s import line to include `updateSettings` (it likely already does) and confirm `getAllSettings` is imported too.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `cliqAlias` missing from settings output, `countByOutcome` doesn't exist, `outcome` missing from participant rows.

- [ ] **Step 3: Modify `db/settings.js`**

```js
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
```

- [ ] **Step 4: Modify `db/participants.js`**

```js
function mapParticipantRow(row) {
  return {
    id: row.id,
    name: row.name,
    giftId: row.gift_id,
    giftName: row.gift_name ?? null,
    giftImageUrl: row.gift_image_url ?? null,
    outcome: row.outcome,
    createdAt: row.created_at,
  };
}

export function listWonGiftIds(db) {
  return new Set(
    db
      .prepare('SELECT DISTINCT gift_id FROM participants WHERE gift_id IS NOT NULL')
      .all()
      .map((r) => r.gift_id)
  );
}

export function insertParticipant(db, { name, giftId = null, outcome = 'gift' }) {
  const result = db
    .prepare('INSERT INTO participants (name, gift_id, outcome) VALUES (?, ?, ?)')
    .run(name, giftId, outcome);
  const row = db.prepare('SELECT * FROM participants WHERE id = ?').get(result.lastInsertRowid);
  return mapParticipantRow(row);
}

export function listParticipants(db, { sort = 'newest', search = '' } = {}) {
  const order = sort === 'oldest' ? 'ASC' : 'DESC';
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.gift_id, p.outcome, p.created_at, g.name AS gift_name, g.image_url AS gift_image_url
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

export function countByOutcome(db, outcome) {
  return db.prepare('SELECT COUNT(*) AS count FROM participants WHERE outcome = ?').get(outcome).count;
}

export function deleteParticipant(db, id) {
  db.prepare('DELETE FROM participants WHERE id = ?').run(id);
}

export function deleteAllParticipants(db) {
  db.prepare('DELETE FROM participants').run();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/db/settings.js server/src/db/participants.js server/test/db.test.js server/test/participants-db.test.js
git commit -m "Add outcome-aware participant queries and cliqAlias setting"
```

---

## Task 3: Spin service — rewrite to pick only, no write

**Files:**
- Modify: `server/src/services/spin.js`
- Modify: `server/test/spin-service.test.js`

**Interfaces:**
- Consumes: `getAllSettings`, `listActiveGifts`, `listWonGiftIds` (Tasks 1-2). No longer consumes `insertParticipant` or `runInTransaction`.
- Produces:
  - `class SpinError extends Error { status; code; message }` (unchanged shape — Task 4's participants service reuses this class)
  - `pickGift(db, rawName): { gift: Gift, wheelSegments: Gift[] }` — **renamed from `performSpin`**; no longer creates a participant. Same validation/error codes as before (400 `INVALID_NAME`, 403 `WHEEL_DISABLED`, 409 `NO_GIFTS_LEFT`).

- [ ] **Step 1: Rewrite the test file**

Replace `server/test/spin-service.test.js`'s contents entirely with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { updateSettings } from '../src/db/settings.js';
import { countParticipants } from '../src/db/participants.js';
import { pickGift, SpinError } from '../src/services/spin.js';

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
  assert.throws(() => pickGift(db, '   '), SpinError);
  assert.throws(() => pickGift(db, 'a'.repeat(51)), SpinError);
});

test('rejects when wheel is disabled', () => {
  const { db } = setupWithGifts();
  updateSettings(db, { wheelEnabled: false });
  try {
    pickGift(db, 'Ahmad');
    assert.fail('expected SpinError');
  } catch (err) {
    assert.ok(err instanceof SpinError);
    assert.equal(err.status, 403);
    assert.equal(err.code, 'WHEEL_DISABLED');
  }
});

test('returns 409 when no eligible gifts exist', () => {
  const db = initDb(':memory:');
  try {
    pickGift(db, 'Ahmad');
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'NO_GIFTS_LEFT');
  }
});

test('picks a gift among eligible ones and returns wheelSegments, without writing a participant', () => {
  const { db, gifts } = setupWithGifts();
  const result = pickGift(db, 'Ahmad');
  const eligibleIds = gifts.map((g) => g.id);
  assert.ok(eligibleIds.includes(result.gift.id));
  assert.ok(result.wheelSegments.some((g) => g.id === result.gift.id));
  assert.equal(result.wheelSegments.length, gifts.length);
  assert.equal(countParticipants(db), 0, 'pickGift must not write to the database');
});

test('calling pickGift repeatedly never reduces eligibility (nothing is reserved)', () => {
  const { db } = setupWithGifts(1);
  pickGift(db, 'Ahmad');
  pickGift(db, 'Ahmad');
  const third = pickGift(db, 'Ahmad');
  assert.ok(third.gift);
  assert.equal(countParticipants(db), 0);
});

test('inactive gifts are never eligible', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Inactive', imageUrl: null, productUrl: 'https://example.com/x', active: false });
  try {
    pickGift(db, 'Ahmad');
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.code, 'NO_GIFTS_LEFT');
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `pickGift` doesn't exist yet (still named `performSpin` and still writes).

- [ ] **Step 3: Rewrite `services/spin.js`**

```js
import { getAllSettings } from '../db/settings.js';
import { listActiveGifts } from '../db/gifts.js';
import { listWonGiftIds } from '../db/participants.js';

export class SpinError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function pickGift(db, rawName) {
  const name = String(rawName ?? '').trim();
  if (!name || name.length > 50) {
    throw new SpinError(400, 'INVALID_NAME', 'Please enter a name between 1 and 50 characters.');
  }

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
  return { gift: winner, wheelSegments: eligible };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/spin.js server/test/spin-service.test.js
git commit -m "Rewrite spin service to pick only, no longer writes a participant"
```

---

## Task 4: New participants service — the actual save, with re-validation

**Files:**
- Create: `server/src/services/participants.js`
- Create: `server/test/participants-service.test.js`

**Interfaces:**
- Consumes: `SpinError` (Task 3), `runInTransaction` (`server/src/db/index.js`, already exists), `getAllSettings` (Task 2), `getGiftById` (`server/src/db/gifts.js`, already exists), `listWonGiftIds`, `insertParticipant` (Task 2).
- Produces: `confirmParticipation(db, { name: string, outcome: 'gift'|'cash', giftId?: number }): { participant: Participant, gift: Gift|null }` — throws `SpinError` for: 400 `INVALID_NAME`, 400 `INVALID_INPUT` (bad `outcome` or missing/non-numeric `giftId` for the gift case), 403 `WHEEL_DISABLED`, 409 `GIFT_NO_LONGER_AVAILABLE`.

- [ ] **Step 1: Write failing tests**

`server/test/participants-service.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift, setGiftActive } from '../src/db/gifts.js';
import { updateSettings } from '../src/db/settings.js';
import { countParticipants, countByOutcome } from '../src/db/participants.js';
import { confirmParticipation } from '../src/services/participants.js';
import { SpinError } from '../src/services/spin.js';

function setupWithGift() {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  return { db, gift };
}

test('rejects empty name', () => {
  const { db, gift } = setupWithGift();
  assert.throws(() => confirmParticipation(db, { name: '  ', outcome: 'gift', giftId: gift.id }), SpinError);
});

test('rejects an invalid outcome', () => {
  const { db } = setupWithGift();
  try {
    confirmParticipation(db, { name: 'Ahmad', outcome: 'bitcoin' });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 400);
    assert.equal(err.code, 'INVALID_INPUT');
  }
});

test('rejects a gift outcome with a missing or non-numeric giftId', () => {
  const { db } = setupWithGift();
  try {
    confirmParticipation(db, { name: 'Ahmad', outcome: 'gift' });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.code, 'INVALID_INPUT');
  }
});

test('cash outcome inserts a participant with no gift, no eligibility checks', () => {
  const { db } = setupWithGift();
  const { participant, gift } = confirmParticipation(db, { name: 'Sara', outcome: 'cash' });
  assert.equal(participant.name, 'Sara');
  assert.equal(gift, null);
  assert.equal(countByOutcome(db, 'cash'), 1);
});

test('gift outcome inserts a participant referencing the gift', () => {
  const { db, gift } = setupWithGift();
  const result = confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  assert.equal(result.participant.name, 'Ahmad');
  assert.equal(result.gift.id, gift.id);
  assert.equal(countByOutcome(db, 'gift'), 1);
});

test('rejects a gift that is no longer active', () => {
  const { db, gift } = setupWithGift();
  setGiftActive(db, gift.id, false);
  try {
    confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'GIFT_NO_LONGER_AVAILABLE');
  }
  assert.equal(countParticipants(db), 0);
});

test('rejects a gift already won by someone else when repeats are disabled', () => {
  const { db, gift } = setupWithGift();
  confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  try {
    confirmParticipation(db, { name: 'Sara', outcome: 'gift', giftId: gift.id });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.code, 'GIFT_NO_LONGER_AVAILABLE');
  }
  assert.equal(countParticipants(db), 1);
});

test('allows a gift already won when repeats are enabled', () => {
  const { db, gift } = setupWithGift();
  updateSettings(db, { allowRepeatGifts: true });
  confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  const second = confirmParticipation(db, { name: 'Sara', outcome: 'gift', giftId: gift.id });
  assert.equal(second.gift.id, gift.id);
});

test('rejects a gift submission when the wheel has been disabled since the pick', () => {
  const { db, gift } = setupWithGift();
  updateSettings(db, { wheelEnabled: false });
  try {
    confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 403);
    assert.equal(err.code, 'WHEEL_DISABLED');
  }
});

test('cash submissions are not blocked by a disabled wheel', () => {
  const { db } = setupWithGift();
  updateSettings(db, { wheelEnabled: false });
  const { participant } = confirmParticipation(db, { name: 'Sara', outcome: 'cash' });
  assert.ok(participant);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `server/src/services/participants.js` does not exist.

- [ ] **Step 3: Implement `services/participants.js`**

```js
import { runInTransaction } from '../db/index.js';
import { getAllSettings } from '../db/settings.js';
import { getGiftById } from '../db/gifts.js';
import { listWonGiftIds, insertParticipant } from '../db/participants.js';
import { SpinError } from './spin.js';

export function confirmParticipation(db, { name: rawName, outcome, giftId }) {
  const name = String(rawName ?? '').trim();
  if (!name || name.length > 50) {
    throw new SpinError(400, 'INVALID_NAME', 'Please enter a name between 1 and 50 characters.');
  }
  if (outcome !== 'gift' && outcome !== 'cash') {
    throw new SpinError(400, 'INVALID_INPUT', 'outcome must be "gift" or "cash".');
  }

  if (outcome === 'cash') {
    const participant = insertParticipant(db, { name, giftId: null, outcome: 'cash' });
    return { participant, gift: null };
  }

  const numericGiftId = Number(giftId);
  if (!Number.isInteger(numericGiftId) || numericGiftId <= 0) {
    throw new SpinError(400, 'INVALID_INPUT', 'giftId must be a positive integer.');
  }

  return runInTransaction(db, () => {
    const settings = getAllSettings(db);
    if (!settings.wheelEnabled) {
      throw new SpinError(403, 'WHEEL_DISABLED', 'The wheel is taking a nap. Ask the birthday human to turn it back on.');
    }

    const gift = getGiftById(db, numericGiftId);
    if (!gift || !gift.active) {
      throw new SpinError(409, 'GIFT_NO_LONGER_AVAILABLE', 'Someone beat you to it! Spin again 😅');
    }
    if (!settings.allowRepeatGifts && listWonGiftIds(db).has(gift.id)) {
      throw new SpinError(409, 'GIFT_NO_LONGER_AVAILABLE', 'Someone beat you to it! Spin again 😅');
    }

    const participant = insertParticipant(db, { name, giftId: gift.id, outcome: 'gift' });
    return { participant, gift };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/participants.js server/test/participants-service.test.js
git commit -m "Add participants confirmation service with eligibility re-validation"
```

---

## Task 5: Spin route — update response shape

**Files:**
- Modify: `server/src/routes/spin.js`
- Modify: `server/test/public-routes.test.js`

**Interfaces:**
- Consumes: `pickGift`, `SpinError` (Task 3).
- Produces: `createSpinRouter(db): Router` — `POST /` → `{ gift: {id,name,imageUrl,productUrl}, wheelSegments: [...] }` on success (no `participant` field anymore), or `{ error: {code, message} }` on failure. Same status codes as before.

- [ ] **Step 1: Update the spin section of `server/test/public-routes.test.js`**

Replace the existing spin-related tests in that file (the file also has gifts/public and settings/public tests — leave those as-is) with:

```js
test('POST /api/spin returns 400 for missing name', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/spin').send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_NAME');
});

test('POST /api/spin returns a candidate gift and wheelSegments, without saving a participant', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  const res = await request(buildApp(db)).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(res.status, 200);
  assert.equal(res.body.gift.name, 'AirPods');
  assert.equal(res.body.gift.productUrl, 'https://example.com/airpods');
  assert.equal(res.body.wheelSegments.length, 1);
  assert.equal(res.body.participant, undefined);
});

test('POST /api/spin can be called repeatedly without reducing eligibility', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  const app = buildApp(db);
  await request(app).post('/api/spin').send({ name: 'Ahmad' }).expect(200);
  const second = await request(app).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(second.status, 200);
  assert.equal(second.body.gift.name, 'AirPods');
});

test('POST /api/spin returns 409 when there are no gifts at all', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'NO_GIFTS_LEFT');
});
```

(Leave the `gifts/public` and `settings/public` tests in the same file untouched for now — Task 7 updates the `settings/public` test for `cliqAlias`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — the current route still tries to call `performSpin` (renamed in Task 3) and still returns a `participant` field.

- [ ] **Step 3: Rewrite `routes/spin.js`**

```js
import { Router } from 'express';
import { pickGift, SpinError } from '../services/spin.js';

export function createSpinRouter(db) {
  const router = Router();
  router.post('/', (req, res, next) => {
    try {
      const { gift, wheelSegments } = pickGift(db, req.body?.name);
      res.json({
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/spin.js server/test/public-routes.test.js
git commit -m "Update spin route to match the pick-only contract"
```

---

## Task 6: New public participants route

**Files:**
- Create: `server/src/routes/participants.js`
- Create: `server/test/participants-route.test.js`

**Interfaces:**
- Consumes: `confirmParticipation`, `SpinError` (Task 4).
- Produces: `createParticipantsRouter(db): Router` — `POST /` → 201 `{ participant: {id,name,createdAt}, gift: {id,name,imageUrl,productUrl}|null }` on success, or `{ error: {code, message} }` with the appropriate status on failure.

This router is **public** (no `requireAdmin`) — it's how guests save their own pick. It is distinct from the existing admin-only `server/src/routes/adminParticipants.js`, which manages the admin Participants page (list/search/sort/delete/reset).

- [ ] **Step 1: Write failing tests**

`server/test/participants-route.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb } from '../src/db/index.js';
import { createGift, setGiftActive } from '../src/db/gifts.js';
import { createParticipantsRouter } from '../src/routes/participants.js';

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/participants', createParticipantsRouter(db));
  return app;
}

test('saves a cash outcome', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/participants').send({ name: 'Sara', outcome: 'cash' });
  assert.equal(res.status, 201);
  assert.equal(res.body.participant.name, 'Sara');
  assert.equal(res.body.gift, null);
});

test('saves a gift outcome', async () => {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  const res = await request(buildApp(db)).post('/api/participants').send({ name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.gift.name, 'AirPods');
});

test('rejects an unavailable gift with 409 GIFT_NO_LONGER_AVAILABLE', async () => {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  setGiftActive(db, gift.id, false);
  const res = await request(buildApp(db))
    .post('/api/participants')
    .send({ name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'GIFT_NO_LONGER_AVAILABLE');
});

test('rejects an invalid outcome', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/participants').send({ name: 'Ahmad', outcome: 'crypto' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `src/routes/participants.js` does not exist.

- [ ] **Step 3: Implement `routes/participants.js`**

```js
import { Router } from 'express';
import { confirmParticipation } from '../services/participants.js';
import { SpinError } from '../services/spin.js';

export function createParticipantsRouter(db) {
  const router = Router();
  router.post('/', (req, res, next) => {
    try {
      const { participant, gift } = confirmParticipation(db, {
        name: req.body?.name,
        outcome: req.body?.outcome,
        giftId: req.body?.giftId,
      });
      res.status(201).json({
        participant: { id: participant.id, name: participant.name, createdAt: participant.createdAt },
        gift: gift ? { id: gift.id, name: gift.name, imageUrl: gift.imageUrl, productUrl: gift.productUrl } : null,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/participants.js server/test/participants-route.test.js
git commit -m "Add public participants route for the actual save (submit) step"
```

---

## Task 7: Settings and stats extensions — cliqAlias, cashPicks, gift-scoped stats

**Files:**
- Modify: `server/src/routes/publicSettings.js`
- Modify: `server/src/routes/adminSettings.js`
- Modify: `server/src/routes/adminStats.js`
- Modify: `server/test/public-routes.test.js` (settings/public section)
- Modify: `server/test/admin-settings-stats.test.js`

**Interfaces:**
- Consumes: `getAllSettings`, `updateSettings` (Task 2), `countByOutcome` (Task 2), `listAllGifts`, `countParticipants`, `listWonGiftIds` (existing).
- Produces:
  - `createPublicSettingsRouter(db)` — `GET /` → `{ wheelEnabled, cliqAlias }`
  - `createAdminSettingsRouter(db)` — `GET/PUT /` → `{ allowRepeatGifts, wheelEnabled, cliqAlias }`
  - `createAdminStatsRouter(db)` — `GET /` → `{ totalParticipants, totalGifts, activeGifts, giftsAssigned, giftsRemaining, cashPicks }` — `giftsAssigned` now counts `outcome='gift'` rows only (previously counted all participants).

- [ ] **Step 1: Update the settings/public test in `server/test/public-routes.test.js`**

Replace the existing `GET /api/settings/public reflects wheelEnabled` test with:

```js
test('GET /api/settings/public reflects wheelEnabled and cliqAlias', async () => {
  const db = initDb(':memory:');
  updateSettings(db, { wheelEnabled: false, cliqAlias: 'AB12' });
  const res = await request(buildApp(db)).get('/api/settings/public');
  assert.deepEqual(res.body, { wheelEnabled: false, cliqAlias: 'AB12' });
});
```

- [ ] **Step 2: Update `server/test/admin-settings-stats.test.js`**

Replace the `GET/PUT settings round-trip` test with:

```js
test('GET/PUT settings round-trip, including cliqAlias', async () => {
  const db = initDb(':memory:');
  const app = buildApp(db);
  const getRes = await request(app).get('/api/admin/settings');
  assert.deepEqual(getRes.body, { allowRepeatGifts: false, wheelEnabled: true, cliqAlias: 'OH98' });

  const putRes = await request(app).put('/api/admin/settings').send({ allowRepeatGifts: true, cliqAlias: 'AB12' });
  assert.equal(putRes.status, 200);
  assert.deepEqual(putRes.body, { allowRepeatGifts: true, wheelEnabled: true, cliqAlias: 'AB12' });
});
```

And extend the stats test to check `giftsAssigned` excludes cash and `cashPicks` is correct — add this new test to the same file (it already imports `insertParticipant`; add `import` of nothing new, `insertParticipant` supports `outcome` since Task 2):

```js
test('stats: giftsAssigned excludes cash rows, cashPicks counts them', async () => {
  const db = initDb(':memory:');
  const app = buildApp(db);
  const g1 = createGift(db, { name: 'A', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  insertParticipant(db, { name: 'Ahmad', giftId: g1.id, outcome: 'gift' });
  insertParticipant(db, { name: 'Sara', outcome: 'cash' });
  insertParticipant(db, { name: 'Omar', outcome: 'cash' });

  const res = await request(app).get('/api/admin/stats');
  assert.equal(res.body.totalParticipants, 3);
  assert.equal(res.body.giftsAssigned, 1);
  assert.equal(res.body.cashPicks, 2);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — routes don't expose `cliqAlias`/`cashPicks` yet, and `giftsAssigned` still counts all participants.

- [ ] **Step 4: Update `routes/publicSettings.js`**

```js
import { Router } from 'express';
import { getAllSettings } from '../db/settings.js';

export function createPublicSettingsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const { wheelEnabled, cliqAlias } = getAllSettings(db);
    res.json({ wheelEnabled, cliqAlias });
  });
  return router;
}
```

- [ ] **Step 5: Update `routes/adminSettings.js`**

```js
import { Router } from 'express';
import { z } from 'zod';
import { getAllSettings, updateSettings } from '../db/settings.js';

const settingsSchema = z.object({
  allowRepeatGifts: z.boolean().optional(),
  wheelEnabled: z.boolean().optional(),
  cliqAlias: z.string().trim().min(1, 'Cliq alias cannot be empty').max(50, 'Cliq alias is too long').optional(),
});

export function createAdminSettingsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => res.json(getAllSettings(db)));
  router.put('/', (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } });
    }
    res.json(updateSettings(db, parsed.data));
  });
  return router;
}
```

- [ ] **Step 6: Update `routes/adminStats.js`**

```js
import { Router } from 'express';
import { listAllGifts } from '../db/gifts.js';
import { countParticipants, countByOutcome, listWonGiftIds } from '../db/participants.js';
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
      giftsAssigned: countByOutcome(db, 'gift'),
      giftsRemaining,
      cashPicks: countByOutcome(db, 'cash'),
    });
  });
  return router;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/publicSettings.js server/src/routes/adminSettings.js server/src/routes/adminStats.js server/test/public-routes.test.js server/test/admin-settings-stats.test.js
git commit -m "Expose cliqAlias and cashPicks; scope giftsAssigned to gift outcomes"
```

---

## Task 8: App assembly — mount the participants route

**Files:**
- Modify: `server/src/app.js`
- Modify: `server/test/app-integration.test.js`

**Interfaces:**
- Consumes: `createParticipantsRouter` (Task 6).
- Produces: `POST /api/participants` reachable through the fully assembled app, rate-limited the same way `/api/spin` is.

- [ ] **Step 1: Add an integration test to `server/test/app-integration.test.js`**

Add this test to the existing file (it already has a `buildRealApp()` helper and imports — reuse them):

```js
test('full flow: admin creates a gift, guest picks it via spin then confirms via participants', async () => {
  const app = buildRealApp();
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' }).expect(200);

  const createRes = await agent
    .post('/api/admin/gifts')
    .field('name', 'AirPods')
    .field('productUrl', 'https://example.com/airpods')
    .field('active', 'true')
    .expect(201);
  const giftId = createRes.body.gift.id;

  const spinRes = await request(app).post('/api/spin').send({ name: 'Ahmad' }).expect(200);
  assert.equal(spinRes.body.gift.id, giftId);

  const confirmRes = await request(app)
    .post('/api/participants')
    .send({ name: 'Ahmad', outcome: 'gift', giftId })
    .expect(201);
  assert.equal(confirmRes.body.gift.name, 'AirPods');

  const participantsRes = await agent.get('/api/admin/participants').expect(200);
  assert.equal(participantsRes.body.total, 1);
  assert.equal(participantsRes.body.participants[0].outcome, 'gift');
});

test('cash flow reaches the admin participants list', async () => {
  const app = buildRealApp();
  await request(app).post('/api/participants').send({ name: 'Sara', outcome: 'cash' }).expect(201);

  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' }).expect(200);
  const participantsRes = await agent.get('/api/admin/participants').expect(200);
  assert.equal(participantsRes.body.participants[0].outcome, 'cash');
  assert.equal(participantsRes.body.participants[0].giftName, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server`
Expected: FAIL — `POST /api/participants` returns 404, since the route isn't mounted yet.

- [ ] **Step 3: Modify `app.js`**

Add the import near the other route imports:
```js
import { createParticipantsRouter } from './routes/participants.js';
```

Add the mount right after the existing `/api/spin` mount:
```js
  app.use('/api/spin', spinLimiter, createSpinRouter(db));
  app.use('/api/participants', spinLimiter, createParticipantsRouter(db));
  app.use('/api/gifts/public', createPublicGiftsRouter(db));
```

(Reusing `spinLimiter` — both endpoints are guest-facing, unauthenticated, and part of the same spin-then-confirm flow; 20/min/IP is generous enough for legitimate use and still blunts scripted abuse.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server`
Expected: PASS (full suite)

- [ ] **Step 5: Commit**

```bash
git add server/src/app.js server/test/app-integration.test.js
git commit -m "Mount the public participants route in the assembled app"
```

---

## Task 9: Client — AppContext extensions for the multi-spin flow

**Files:**
- Modify: `client/src/state/AppContext.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `useAppContext()` now also returns `spinsAllowed` (number, default 1), `setSpinsAllowed`, `spinsCompleted` (number, default 0), `setSpinsCompleted`, `retriesRemaining` (number, default 2), `setRetriesRemaining`, and `resetSpinFlow(): void` (resets all three to their defaults — called whenever a guest starts a fresh session or returns to the start).

No automated test for this file (thin React state container, same as the original `AppContext.jsx` had none) — verified by the later page tasks that consume it.

- [ ] **Step 1: Rewrite `state/AppContext.jsx`**

```jsx
import { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [name, setName] = useState('');
  const [result, setResult] = useState(null);
  const [spinsAllowed, setSpinsAllowed] = useState(1);
  const [spinsCompleted, setSpinsCompleted] = useState(0);
  const [retriesRemaining, setRetriesRemaining] = useState(2);

  function resetSpinFlow() {
    setSpinsAllowed(1);
    setSpinsCompleted(0);
    setRetriesRemaining(2);
  }

  const value = {
    name,
    setName,
    result,
    setResult,
    spinsAllowed,
    setSpinsAllowed,
    spinsCompleted,
    setSpinsCompleted,
    retriesRemaining,
    setRetriesRemaining,
    resetSpinFlow,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
```

- [ ] **Step 2: Verify nothing else broke**

Run: `npm test --prefix client`
Expected: PASS (this file has no direct tests, but confirm the existing 9 tests in other files still pass — a bad export here would break anything importing `useAppContext`, though nothing does yet outside already-passing tests)

- [ ] **Step 3: Commit**

```bash
git add client/src/state/AppContext.jsx
git commit -m "Add multi-spin state (spinsAllowed/spinsCompleted/retriesRemaining) to AppContext"
```

---

## Task 10: Client — Landing navigates to Choice; Choice page

**Files:**
- Modify: `client/src/pages/Landing.jsx`
- Create: `client/src/pages/Choice.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `useAppContext` (Task 9), `FloatingBirthdayBits` (existing).
- Produces: route `/choice` — redirects to `/` if no name is set (same guard pattern as `Wheel.jsx`/`Result.jsx`); offers "💰 CASH ME OUT" (→ `/cash`) and "🎁 SPIN FOR A GIFT" (→ `/love-question`).

- [ ] **Step 1: Modify `pages/Landing.jsx`'s `handleSubmit` to reset spin flow and navigate to `/choice`**

Find this block in `Landing.jsx`:
```jsx
    setError('');
    setName(trimmed);
    playClick();
    navigate('/wheel');
```
Replace it with:
```jsx
    setError('');
    setName(trimmed);
    resetSpinFlow();
    playClick();
    navigate('/choice');
```

And add `resetSpinFlow` to the destructured context at the top of the component:
```jsx
  const { name, setName, resetSpinFlow } = useAppContext();
```
(was `const { name, setName } = useAppContext();`)

- [ ] **Step 2: Create `pages/Choice.jsx`**

```jsx
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../state/AppContext.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';

export default function Choice() {
  const { name } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!name) navigate('/');
  }, [name, navigate]);

  if (!name) return null;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={8} />
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-3xl font-extrabold drop-shadow-lg sm:text-4xl"
      >
        Cash or gift, {name}? 💰🎁
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="max-w-sm text-lg font-semibold text-white/80"
      >
        Choose wisely. There is no wrong answer. (There is a wrong answer.)
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex w-full max-w-sm flex-col gap-4 sm:flex-row"
      >
        <motion.button
          type="button"
          onClick={() => navigate('/cash')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          className="flex-1 rounded-full bg-party-teal px-8 py-5 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20"
        >
          💰 CASH ME OUT
        </motion.button>
        <motion.button
          type="button"
          onClick={() => navigate('/love-question')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          className="flex-1 rounded-full bg-party-yellow px-8 py-5 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20"
        >
          🎁 SPIN FOR A GIFT
        </motion.button>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3: Add the `/choice` route to `App.jsx`**

Find the import block and route list in `App.jsx` and add:
```jsx
import Choice from './pages/Choice.jsx';
```
and, inside `<Routes>`, right after the `/` route:
```jsx
        <Route path="/choice" element={<Choice />} />
```

- [ ] **Step 4: Verify manually in the browser**

Run `npm run dev` from the repo root. Go through Landing → enter a name → click "LET'S GO!" → confirm you land on `/choice` showing both buttons with your name interpolated into the headline. Confirm navigating directly to `/choice` with no name set (e.g. open it in a fresh tab) redirects to `/`.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Landing.jsx client/src/pages/Choice.jsx client/src/App.jsx
git commit -m "Add Choice page (cash vs gift) between Landing and the spin flow"
```

---

## Task 11: Client — LoveQuestion page (2-gift unlock)

**Files:**
- Create: `client/src/pages/LoveQuestion.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `useAppContext` (Task 9, specifically `setSpinsAllowed`/`setRetriesRemaining`), `FloatingBirthdayBits` (existing).
- Produces: route `/love-question` — redirects to `/` if no name; "Yes" sets `spinsAllowed=2`, shows the unlock confirmation for ~1.4s, then navigates to `/wheel`; "No" sets `spinsAllowed=1` and navigates to `/wheel` immediately.

- [ ] **Step 1: Create `pages/LoveQuestion.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../state/AppContext.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';

export default function LoveQuestion() {
  const { name, setSpinsAllowed, setRetriesRemaining } = useAppContext();
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!name) navigate('/');
  }, [name, navigate]);

  if (!name) return null;

  function handleAnswer(saysYes) {
    setSpinsAllowed(saysYes ? 2 : 1);
    setRetriesRemaining(2);
    if (saysYes) {
      setConfirmed(true);
      window.setTimeout(() => navigate('/wheel'), 1400);
    } else {
      navigate('/wheel');
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={8} />
      <AnimatePresence mode="wait">
        {!confirmed ? (
          <motion.div
            key="question"
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex flex-col items-center gap-8"
          >
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display text-3xl font-extrabold drop-shadow-lg sm:text-4xl"
            >
              If you love me... will you get me 2 gifts? 🥺🎁🎁
            </motion.h1>
            <div className="flex w-full max-w-sm flex-col gap-4 sm:flex-row">
              <motion.button
                type="button"
                onClick={() => handleAnswer(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                className="flex-1 rounded-full bg-party-yellow px-8 py-5 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20"
              >
                Yes, obviously 🥹
              </motion.button>
              <motion.button
                type="button"
                onClick={() => handleAnswer(false)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                className="flex-1 rounded-full bg-white/20 px-8 py-5 text-xl font-extrabold text-white shadow-lg shadow-black/20"
              >
                Just the one 😬
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.p
            key="confirmed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="font-display text-2xl font-extrabold drop-shadow-lg"
          >
            🎉 2 spin chances unlocked! Make 'em cheap ones 😏
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Add the `/love-question` route to `App.jsx`**

```jsx
import LoveQuestion from './pages/LoveQuestion.jsx';
```
and:
```jsx
        <Route path="/love-question" element={<LoveQuestion />} />
```

- [ ] **Step 3: Verify manually in the browser**

From `/choice`, click "🎁 SPIN FOR A GIFT" → confirm the love question appears. Click "Just the one 😬" → confirm immediate navigation to `/wheel`. Go back to `/choice` → `/love-question` again, click "Yes, obviously 🥹" → confirm the unlock message briefly shows, then auto-navigates to `/wheel` after ~1.4s.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/LoveQuestion.jsx client/src/App.jsx
git commit -m "Add LoveQuestion page for the 2-gift unlock"
```

---

## Task 12: Client — Cash page

**Files:**
- Create: `client/src/pages/Cash.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `useAppContext` (Task 9), `FloatingBirthdayBits`, `ConfirmDialog` (existing, same prop contract as the admin pages use), `getJson`, `postJson`, `ApiError` (existing `lib/api.js`).
- Produces: route `/cash` — redirects to `/` if no name; fetches `cliqAlias` from `GET /api/settings/public`; Submit is gated behind a `ConfirmDialog`; on confirm, calls `POST /api/participants { name, outcome: 'cash' }`; WhatsApp share is available both before and after submitting.

- [ ] **Step 1: Create `pages/Cash.jsx`**

```jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppContext } from '../state/AppContext.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { getJson, postJson, ApiError } from '../lib/api.js';

const CASH_LINES = [
  'Straight to the point. I respect that.',
  'No wheel, no drama, just cold hard cash.',
  'The wheel weeps, but your bank account rejoices.',
  'Efficient. Ruthless. Iconic.',
];

export default function Cash() {
  const { name, setName, resetSpinFlow, setResult } = useAppContext();
  const navigate = useNavigate();
  const [cliqAlias, setCliqAlias] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const line = useMemo(() => CASH_LINES[Math.floor(Math.random() * CASH_LINES.length)], []);

  useEffect(() => {
    if (!name) {
      navigate('/');
      return;
    }
    getJson('/api/settings/public')
      .then((res) => setCliqAlias(res.cliqAlias))
      .catch(() => setError('Could not load the payment details. Please refresh and try again.'))
      .finally(() => setLoading(false));
  }, [name, navigate]);

  if (!name) return null;

  const message = [
    '💰 Birthday Cash Assignment 💰',
    '',
    'I looked at the wheel and chose cash like a responsible adult.',
    '',
    `Cliq: ${cliqAlias}`,
  ].join('\n');
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function handleConfirmSubmit() {
    setConfirming(false);
    setError('');
    try {
      await postJson('/api/participants', { name, outcome: 'cash' });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  function handleBackToStart() {
    setName('');
    setResult(null);
    resetSpinFlow();
    navigate('/');
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={6} />
      <motion.h1
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="font-display text-4xl font-extrabold drop-shadow-lg sm:text-5xl"
      >
        💰 CASH IT IS 💰
      </motion.h1>

      {loading && <p className="text-lg font-semibold">Loading payment details...</p>}

      {!loading && cliqAlias && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full max-w-xs rounded-3xl bg-white/15 p-6 shadow-2xl backdrop-blur"
        >
          <p className="font-semibold text-white/80">{line}</p>
          <p className="mt-4 font-display text-2xl font-extrabold">Cliq: {cliqAlias}</p>
        </motion.div>
      )}

      {error && (
        <p role="alert" className="max-w-sm font-semibold text-yellow-200">
          {error}
        </p>
      )}

      {!loading && cliqAlias && !submitted && (
        <div className="flex flex-col items-center gap-3">
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
          <motion.button
            type="button"
            onClick={() => setConfirming(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            className="rounded-full bg-party-yellow px-10 py-4 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20"
          >
            Submit
          </motion.button>
        </div>
      )}

      {submitted && (
        <>
          <p className="font-display text-xl font-extrabold text-green-200">✅ Locked in!</p>
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
        </>
      )}

      <button type="button" onClick={handleBackToStart} className="text-sm font-semibold text-white/70 underline">
        Back to start
      </button>

      <ConfirmDialog
        open={confirming}
        title="You sure about this?"
        description="Hitting submit means cash it is 😏 No take-backs."
        confirmLabel="Yep, cash it is"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the `/cash` route to `App.jsx`**

```jsx
import Cash from './pages/Cash.jsx';
```
and:
```jsx
        <Route path="/cash" element={<Cash />} />
```

- [ ] **Step 3: Verify manually in the browser**

Run `npm run dev`. Go through Landing → Choice → "💰 CASH ME OUT". Confirm the card shows a random funny line and `Cliq: OH98` (the default). Click "📱 SEND TO MY WHATSAPP" — via the browser tool's `read_page`, confirm the `href` decodes to a message containing "Cliq: OH98" (don't actually complete the WhatsApp send). Click "Submit" — confirm the `ConfirmDialog` appears with the exact copy above; click Cancel and confirm nothing happens (no network request fires); click Submit again and confirm — confirm the "✅ Locked in!" state appears afterward and stays there on refresh navigation (i.e., check the admin Participants page shows this row with outcome cash, gift column showing "(gift removed)" placeholder logic doesn't apply here since Task 13 handles the admin display — for now just confirm via `GET /api/admin/participants` in the browser tool's network inspector, or via curl, that the row exists with `outcome: "cash"`).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Cash.jsx client/src/App.jsx
git commit -m "Add Cash page with Cliq alias, WhatsApp share, and submit confirmation"
```

---

## Task 13: Client — Wheel page updates (no participant in response, gift-slot badge)

**Files:**
- Modify: `client/src/pages/Wheel.jsx`

**Interfaces:**
- Consumes: `useAppContext` (Task 9, adds `spinsAllowed`/`spinsCompleted` to what it already reads), `POST /api/spin`'s new response shape (Task 5 — no `participant` field).
- Produces: `setResult({ gift })` (previously `{ participant, gift }`) — Result.jsx (Task 14) now owns creating the participant via `POST /api/participants`. When `spinsAllowed > 1`, shows a `🎁 Gift {spinsCompleted + 1} of {spinsAllowed}` badge above the wheel.

- [ ] **Step 1: Update the context destructuring and add the badge**

In `Wheel.jsx`, find:
```jsx
  const { name, setResult } = useAppContext();
```
Replace with:
```jsx
  const { name, setResult, spinsAllowed, spinsCompleted } = useAppContext();
```

Find the `setResult({ participant: response.participant, gift: response.gift });` line inside `handleSpin`'s `setTimeout` callback and replace it with:
```jsx
        setResult({ gift: response.gift });
```

Find the JSX block that renders the flavor headline (`<h2 ...>{flavorLine}</h2>`, added by the earlier copy-punch-up work) and add the badge right after it:
```jsx
      <h2 className="font-display text-3xl font-extrabold drop-shadow sm:text-4xl">{flavorLine}</h2>

      {spinsAllowed > 1 && (
        <p className="text-sm font-bold text-white/70">
          🎁 Gift {spinsCompleted + 1} of {spinsAllowed}
        </p>
      )}
```

- [ ] **Step 2: Run the client test suite to confirm nothing broke**

Run: `npm test --prefix client`
Expected: PASS (this file has no dedicated test file; confirms no syntax error and the existing suite stays green)

- [ ] **Step 3: Verify manually in the browser**

With `npm run dev` running and at least one active gift configured, go Landing → Choice → "🎁 SPIN FOR A GIFT" → answer "Yes, obviously 🥹" on the love question → confirm the Wheel page shows "🎁 Gift 1 of 2" above the wheel. Spin — confirm it still lands correctly and navigates to `/result` (Task 14 makes Result functional again for this new response shape — until then, don't worry if Result looks incomplete, that's expected mid-plan).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Wheel.jsx
git commit -m "Update Wheel page for the pick-only spin response and add gift-slot badge"
```

---

## Task 14: Client — Result page rewrite (submit/retry/confirm, multi-spin loop)

**Files:**
- Modify: `client/src/pages/Result.jsx`

**Interfaces:**
- Consumes: `useAppContext` (Task 9 — `spinsAllowed`, `spinsCompleted`, `setSpinsCompleted`, `retriesRemaining`, `setRetriesRemaining`, `resetSpinFlow`, alongside the existing `name`/`result`/`setName`/`setResult`), `ConfirmDialog` (existing), `postJson`, `ApiError` (existing `lib/api.js`).
- Produces: the result card now requires explicit Submit (behind a `ConfirmDialog`) before anything is saved; Retry re-spins (up to `retriesRemaining`, decrementing it) without saving; after a successful submit, if more gift slots remain (`spinsCompleted + 1 < spinsAllowed`), loops back to `/wheel` for the next slot instead of ending.

- [ ] **Step 1: Rewrite `pages/Result.jsx` in full**

```jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppContext } from '../state/AppContext.jsx';
import { Confetti } from '../components/Confetti.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { postJson, ApiError } from '../lib/api.js';

const JOKES = [
  'Sorry. No take-backs.',
  "Yep... that's what you're buying me 😂",
  'The wheel has spoken. Democracy was never an option.',
  'May the odds be ever in my favor 😈',
  'Congratulations, your wallet has been selected.',
  'This message will self-destruct... into your bank statement.',
  'I did not rig this. Probably.',
  "Fate has excellent taste, don't you think?",
  'Go forth and shop. The wheel commands it.',
];

const BACK_TO_START_LABELS = ['Back to start', 'Spin someone else in', 'Send another victim'];

export default function Result() {
  const {
    name,
    result,
    setName,
    setResult,
    spinsAllowed,
    spinsCompleted,
    setSpinsCompleted,
    retriesRemaining,
    setRetriesRemaining,
    resetSpinFlow,
  } = useAppContext();
  const navigate = useNavigate();
  const joke = useMemo(() => JOKES[Math.floor(Math.random() * JOKES.length)], []);
  const backLabel = useMemo(
    () => BACK_TO_START_LABELS[Math.floor(Math.random() * BACK_TO_START_LABELS.length)],
    []
  );
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

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

  async function handleConfirmSubmit() {
    setConfirming(false);
    setSubmitting(true);
    setError('');
    try {
      await postJson('/api/participants', { name, outcome: 'gift', giftId: gift.id });
      const nextCompleted = spinsCompleted + 1;
      setSpinsCompleted(nextCompleted);
      if (nextCompleted < spinsAllowed) {
        setRetriesRemaining(2);
        setResult(null);
        navigate('/wheel');
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    setRetriesRemaining((r) => r - 1);
    setResult(null);
    navigate('/wheel');
  }

  function handleBackToStart() {
    setName('');
    setResult(null);
    resetSpinFlow();
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

      {error && (
        <p role="alert" className="max-w-sm font-semibold text-yellow-200">
          {error}
          {retriesRemaining === 0 && !submitted && ' No more tries left — head back and start over.'}
        </p>
      )}

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

      {!submitted && (
        <div className="flex gap-3">
          <motion.button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={submitting}
            whileHover={{ scale: submitting ? 1 : 1.05 }}
            whileTap={{ scale: submitting ? 1 : 0.92 }}
            className="rounded-full bg-party-yellow px-8 py-3 text-lg font-extrabold text-purple-900 shadow-lg shadow-black/20 disabled:opacity-50"
          >
            {submitting ? 'Locking in...' : 'Submit'}
          </motion.button>
          {retriesRemaining > 0 && (
            <motion.button
              type="button"
              onClick={handleRetry}
              disabled={submitting}
              whileHover={{ scale: submitting ? 1 : 1.05 }}
              whileTap={{ scale: submitting ? 1 : 0.92 }}
              className="rounded-full bg-white/20 px-8 py-3 text-lg font-extrabold text-white shadow-lg shadow-black/20 disabled:opacity-50"
            >
              Retry
            </motion.button>
          )}
        </div>
      )}

      {submitted && (
        <p className="font-display text-xl font-extrabold text-green-200">✅ Locked in! Go spend responsibly 😂</p>
      )}

      <button type="button" onClick={handleBackToStart} className="text-sm font-semibold text-white/70 underline">
        {backLabel}
      </button>

      <ConfirmDialog
        open={confirming}
        title="Are you sure??"
        description="Hitting submit means you're LEGALLY buying this. Probably. 😂"
        confirmLabel="Yes, lock it in"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run the client test suite**

Run: `npm test --prefix client`
Expected: PASS

- [ ] **Step 3: Verify manually in the browser — single-gift path**

Landing → Choice → Gift → "Just the one 😬" → Wheel → spin → confirm the Result card now shows `[📱 Share] [Submit] [Retry]` (three actions, not the old two). Click Retry — confirm it goes back to `/wheel`, spins again, and the new result again offers all three (retry count decremented — after using it twice, the third time Retry is no longer shown). Click Submit — confirm the `ConfirmDialog` appears with "Are you sure??" copy; Cancel does nothing; confirm again → "✅ Locked in! Go spend responsibly 😂" appears, Submit/Retry disappear, Share stays available.

- [ ] **Step 4: Verify manually in the browser — two-gift path**

Landing → Choice → Gift → "Yes, obviously 🥹" → confirm "2 spin chances unlocked" message → Wheel shows "Gift 1 of 2" → spin → Submit+confirm → confirm it automatically loops back to `/wheel` showing "Gift 2 of 2" with a fresh 2 retries available → spin → Submit+confirm → confirm this time it shows the final "✅ Locked in!" state (no more looping). Confirm both gifts appear as separate rows in the admin Participants page (Task 15 finishes making that display fully correct, but the raw rows should already exist).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Result.jsx
git commit -m "Rewrite Result page with submit/retry/confirm and multi-spin loop"
```

---

## Task 15: Admin — display cash outcomes in Participants and Settings

**Files:**
- Modify: `client/src/pages/admin/Participants.jsx`
- Modify: `client/src/pages/admin/Settings.jsx`
- Modify: `client/src/pages/admin/Dashboard.jsx`

**Interfaces:**
- Consumes: `outcome` field on participant rows (Task 2/6), `cliqAlias` on `GET /api/admin/settings` (Task 7), `cashPicks` on `GET /api/admin/stats` (Task 7).
- Produces: cash rows render as "💰 Cash (Cliq: {current cliqAlias})" in the admin Participants table; the admin Settings page gains a "Cliq alias" text field using the same save pattern as the existing toggles; the Dashboard gains a 6th stat card for cash picks.

- [ ] **Step 1: Update `pages/admin/Participants.jsx` to fetch settings and render cash rows**

Add `getJson` usage for settings (it's already imported for `getJson`/`del` — just add a settings fetch) and a `cliqAlias` state. Find the top of the component:

```jsx
export default function AdminParticipants() {
  const [participants, setParticipants] = useState([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);
```

Add a `cliqAlias` state and fetch it once on mount:
```jsx
export default function AdminParticipants() {
  const [participants, setParticipants] = useState([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [cliqAlias, setCliqAlias] = useState('');

  useEffect(() => {
    getJson('/api/admin/settings').then((res) => setCliqAlias(res.cliqAlias));
  }, []);
```

Find the table row rendering (the `<td className="p-3">` that shows `p.giftName ?? '(gift removed)'`) and replace the gift-column cell's contents with outcome-aware rendering:

```jsx
                  <td className="p-3">
                    {p.outcome === 'cash' ? (
                      <span>💰 Cash (Cliq: {cliqAlias})</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {p.giftImageUrl && <img src={p.giftImageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />}
                        <span>{p.giftName ?? '(gift removed)'}</span>
                      </div>
                    )}
                  </td>
```

- [ ] **Step 2: Add the Cliq alias field to `pages/admin/Settings.jsx`**

Find where `settings` state is loaded and `updateSetting` is defined — add a local text input state seeded from `settings.cliqAlias`, and a save handler using the existing `putJson('/api/admin/settings', ...)` pattern. Add this block to the JSX, right after the existing "Allow repeat gifts" toggle block and before the "Reset all results" block:

```jsx
      <div className="rounded-2xl bg-white/10 p-5">
        <p className="mb-1 font-bold">Cliq alias</p>
        <p className="mb-3 text-sm text-white/70">Shown to guests who choose the Cash option.</p>
        <div className="flex gap-3">
          <input
            type="text"
            defaultValue={settings.cliqAlias}
            onBlur={(e) => updateSetting('cliqAlias', e.target.value.trim())}
            maxLength={50}
            className="flex-1 rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          />
        </div>
      </div>
```

(This reuses the existing `updateSetting(key, value)` function already defined in this file — it calls `putJson('/api/admin/settings', { [key]: value })` and updates local state from the response, exactly the same as the two boolean toggles. `onBlur` rather than every keystroke avoids firing a request per character.)

- [ ] **Step 3: Add the cash-picks stat card to `pages/admin/Dashboard.jsx`**

Find the `<div className="grid ...">` containing the five `<StatCard>` elements and add a sixth:

```jsx
      <StatCard emoji="💰" label="Cash Picks" value={stats.cashPicks} />
```

- [ ] **Step 4: Verify manually in the browser**

Log into `/admin`. Go to Settings — confirm a "Cliq alias" field shows `OH98`, change it to something else, click outside the field (blur), reload the page, confirm the new value persisted. Go to Participants — confirm any cash rows from earlier manual testing show "💰 Cash (Cliq: {your new alias})" rather than a broken gift cell. Go to Dashboard — confirm a "💰 Cash Picks" card appears with the correct count.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/admin/Participants.jsx client/src/pages/admin/Settings.jsx client/src/pages/admin/Dashboard.jsx
git commit -m "Show cash outcomes and Cliq alias in the admin console"
```

---

## Task 16: Full manual end-to-end QA pass

**Files:** none — verification only, using the browser tool against the running dev server, fixing any real bugs found directly in the relevant file(s) from the task that introduced them.

**Interfaces:** none.

- [ ] **Step 1: Start fresh**

Run `npm run dev` from the repo root. In the admin Settings page, click "Reset all results" to clear any state from earlier manual testing. Make sure at least 2 active gifts exist in the admin Gifts page.

- [ ] **Step 2: Cash path, end to end**

Landing (enter a name) → Choice → "💰 CASH ME OUT" → confirm the card and Cliq alias render → Submit → confirm popup → confirm → "✅ Locked in!" → confirm the admin Participants page shows this row with the cash display, and the Dashboard's "Cash Picks" count increased by 1.

- [ ] **Step 3: Single-gift path with a used retry, end to end**

Landing → Choice → Gift → "Just the one 😬" → Wheel → spin → Retry once (confirm it re-spins and the retry count visibly decreases, i.e., after this the Retry button is still there once more, then gone after a second use) → spin again → Submit → confirm → "✅ Locked in!" → confirm exactly one new gift row appears in admin Participants (the two retried-and-discarded spins must NOT appear as separate rows — this is the single most important behavior this whole plan exists to deliver, verify it carefully via the admin Participants total count).

- [ ] **Step 4: Two-gift path, end to end**

Landing → Choice → Gift → "Yes, obviously 🥹" → Wheel (Gift 1 of 2) → spin → Submit → confirm it loops to Wheel (Gift 2 of 2) with a fresh Retry budget → spin → Submit → confirm final "Locked in" state. Confirm exactly two new gift rows appear in admin Participants for this name.

- [ ] **Step 5: Race-lost (409) path**

With `allow_repeat_gifts` OFF and exactly one active gift remaining, open two browser tabs both on `/wheel` for the same (or different) names, both having picked that last gift via spin. Submit in the first tab (succeeds). Submit in the second tab — confirm it shows the "Someone beat you to it! Spin again 😅" message rather than crashing, and that Retry (if available) or a "no more tries" message is shown appropriately.

- [ ] **Step 6: Wheel-disabled interaction with the new flow**

Toggle "Wheel enabled" off in admin Settings. Confirm `/wheel` shows its existing disabled state. Separately, confirm the Cash path still works even with the wheel disabled (per the spec — cash isn't gated by wheel state).

- [ ] **Step 7: Mobile responsive check**

Use the browser tool's `resize_window` with the `mobile` preset (375×812). Re-walk the golden path (Landing → Choice → Gift → Wheel → Result submit) and the Cash path at this size. Confirm Choice's two buttons stack vertically and remain easily tappable, the love question buttons are comfortably sized, and the Result page's three action buttons (Share/Submit/Retry) don't overflow or wrap awkwardly.

- [ ] **Step 8: Fix any issues found**

If any step surfaced a real bug, fix it in the relevant file, re-run that area's automated tests (`npm test --prefix server` and/or `npm test --prefix client`), and re-verify the specific step that failed. Commit each fix separately:

```bash
git add <fixed files>
git commit -m "Fix: <short description of the bug found during QA>"
```

- [ ] **Step 9: Final full test suite run**

```bash
npm test --prefix server
npm test --prefix client
```
Expected: PASS for every test file in both suites.

---

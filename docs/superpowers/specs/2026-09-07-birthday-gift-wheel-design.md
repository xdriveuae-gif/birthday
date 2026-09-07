# Birthday Gift Wheel — Design Spec

Date: 2026-09-07
Status: Approved for implementation

> **Amendment (implementation-time, Task 1):** The database library was changed
> from `better-sqlite3` to Node's built-in `node:sqlite` module (`DatabaseSync`),
> and the session store from `connect-sqlite3` to a small custom SQLite-backed
> store built on the same `node:sqlite` database. Reason: the actual development
> machine this project is being built on has no Python/node-gyp toolchain, and
> `better-sqlite3` (and `connect-sqlite3`'s native `sqlite3` dependency) could not
> be installed reliably — two independent verification passes reproduced a total
> `npm install` failure (not just a missing native binding; the whole dependency
> tree failed to install). `node:sqlite` ships inside Node itself, requires no
> native compilation, and was verified directly against this project's exact
> query patterns before adopting it. Every other requirement below is unchanged;
> every mention of `better-sqlite3`/`connect-sqlite3` in the sections that follow
> should be read as `node:sqlite`/the custom store. See the implementation
> plan's ledger for full verification detail.

## 1. Concept

A funny, flashy, mobile-first birthday website. A guest enters their name, spins an
animated wheel, and the server assigns them a gift they are now "responsible" for
buying the birthday person. The result screen lets them share the gift + a
product URL to WhatsApp with one tap. An authenticated admin console manages the
gift catalog, tracks who won what, and controls wheel behavior (repeat gifts on/off,
wheel enabled/disabled).

Non-goals: no real payments, no multi-tenant/multi-event support, no public API for
gift data beyond what's needed to render the wheel, no automatic message sending.

## 2. Architecture

Monorepo with two workspaces, deployed as **one Node process**:

```
birthday-gift-game/
  client/            Vite + React + Tailwind + Framer Motion (SPA)
  server/            Express + node:sqlite (API + static file serving)
  docs/              specs (this file)
  .env.example
  package.json       root scripts: dev (concurrently), build, start
  README.md
```

- **Development**: Vite dev server (client) proxies `/api/*` to Express (server) on a
  separate port. Two processes via `concurrently`, started with `npm run dev` at the
  repo root.
- **Production**: `npm run build` builds the client to `client/dist`; Express serves
  that directory as static files and exposes `/api/*` and `/uploads/*` from the same
  origin. One process, one URL, no CORS configuration needed.
- **Why one deploy target**: guests open this from a WhatsApp link on their phones —
  a single stable URL with no cross-origin auth cookie issues is simpler and more
  reliable than splitting frontend/backend hosting.

### Deployment target: Render (or Railway) web service

SQLite and uploaded images are files on disk, and Render/Railway's default web
service disk is **ephemeral** — it resets on every deploy or restart. The README
documents attaching a small persistent disk (Render Disk / Railway Volume) mounted
at `/data`, with `SQLITE_PATH=/data/app.db` and `UPLOADS_DIR=/data/uploads` env vars
pointing at it. Without this, the database and images would be wiped on the next
deploy — called out explicitly in the README as a required step, not optional.

## 3. Data model (SQLite via node:sqlite)

```sql
CREATE TABLE admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE gifts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  image_url    TEXT,               -- e.g. /uploads/gifts/<uuid>.jpg, nullable
  product_url  TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,  -- 0/1
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE participants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  gift_id    INTEGER NOT NULL REFERENCES gifts(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- seeded rows: ('allow_repeat_gifts', 'false'), ('wheel_enabled', 'true')

CREATE TABLE sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires INTEGER NOT NULL
);
-- backs the custom express-session Store (§5) in the same database file,
-- so admin sessions survive server restarts without a second dependency.
```

Relationships: `participants.gift_id` → `gifts.id` (many participants may reference
the same gift when `allow_repeat_gifts` is true; enforced at the application layer,
not via a uniqueness constraint, so history is preserved even if a gift is later
deactivated).

Migrations: a single idempotent `initDb()` run on server boot using
`CREATE TABLE IF NOT EXISTS` plus a `settings` upsert-if-missing for the two keys.
No migration framework needed at this scale.

## 4. Spin logic (server-authoritative)

`POST /api/spin` body: `{ name: string }`.

Executed inside one manual transaction (`BEGIN`/`COMMIT`/`ROLLBACK` via a small
`runInTransaction(db, fn)` helper — `node:sqlite`'s `DatabaseSync` is synchronous
like better-sqlite3 was, but has no built-in `.transaction()` convenience method,
so this project wraps it explicitly). Being synchronous, this is naturally atomic
with no separate row locking needed:

1. Validate `name`: trimmed, 1–50 chars, rejected if empty after trim. Reject with
   400 + friendly message otherwise.
2. Read `wheel_enabled` from settings; if false, return 403 "the wheel is taking a
   nap, ask the birthday human to turn it back on."
3. Compute eligible gifts: `active = 1`, and if `allow_repeat_gifts` is false,
   further exclude any gift id already present in `participants`.
4. If eligible list is empty, return 409 "no gifts left on the wheel" (admin needs
   to add/reactivate gifts or enable repeats).
5. Pick uniformly at random (`Math.random()`-driven index) among eligible gifts.
6. Insert a `participants` row `{ name, gift_id, created_at }`.
7. Return `{ participant: { id, name, createdAt }, gift: { id, name, imageUrl,
   productUrl }, wheelSegments: [...eligible gifts used in step 3, in a stable
   order] }`.

The **client renders the spinning wheel from `wheelSegments` in this same
response** — not from a separately-fetched list — guaranteeing the visual wheel
always contains the winning segment, even if another guest's concurrent spin
changed eligibility a moment earlier. A separate `GET /api/gifts/public` (id, name,
image only, active gifts only) is used solely to paint the **idle** wheel before the
user presses spin, purely decorative — it is never used to determine the outcome.

Selection is uniform among eligible gifts (no weighting). This is stated explicitly
so behavior isn't ambiguous: an admin who wants a gift to be rarer should simply not
add duplicates of it, since each gift is one wheel segment regardless of "value."

`GET /api/settings/public` returns `{ wheelEnabled: boolean }`. The Wheel screen
calls this alongside `GET /api/gifts/public` so it can preemptively gray out the
"SPIN" button with a friendly "the wheel is taking a nap" message when disabled,
rather than only discovering that from a failed 403 after the user already pressed
spin.

## 5. Admin authentication & authorization

- Single admin account, created once from `ADMIN_USERNAME` / `ADMIN_PASSWORD`
  environment variables: on server boot, if `admin_users` is empty, hash the env
  password with bcrypt (cost 12) and insert the row. If `admin_users` already has a
  row, boot seeding is skipped entirely — env vars are never used to overwrite an
  existing account. There is no self-service admin registration endpoint.
- Session-based auth: `express-session` with a custom SQLite-backed `Store`
  (a ~40-line `session.Store` subclass reading/writing the `sessions` table on
  the same `node:sqlite` database — see amendment note above), cookie flags
  `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in production (behind
  HTTPS on Render).
- `POST /api/admin/login { username, password }` → bcrypt compare → regenerate
  session → set cookie. Rate-limited (see below).
- `POST /api/admin/logout` destroys the session.
- `GET /api/admin/me` → 200 with `{ username }` if authenticated, else 401. Client
  React admin router calls this on mount to decide login vs. dashboard.
- Middleware `requireAdmin` guards every `/api/admin/*` route; returns 401 JSON (not
  a redirect) so the SPA can react.
- Public routes (`/api/spin`, `/api/gifts/public`, `/api/settings/public`) never
  expose participant PII in bulk, gift `active` status internals beyond what's
  needed, or any admin-only fields.

## 6. Gift management (admin)

CRUD under `/api/admin/gifts`:
- `GET /api/admin/gifts` — all gifts (active + inactive), newest first.
- `POST /api/admin/gifts` — multipart form: `name`, `productUrl`, `active`, `image`
  (file, optional). Validates `name` (1–100 chars), `productUrl` (must parse as
  `http(s)://` URL via `new URL()` inside a zod `.refine`), `active` boolean.
- `PUT /api/admin/gifts/:id` — same validation, image replace optional (deletes old
  file from disk if replaced).
- `DELETE /api/admin/gifts/:id` — hard delete the gift row. Participants who already
  won it keep their historical `gift_id` reference; the API/UI for participants
  resolves a missing gift gracefully by showing "(gift removed)" rather than
  erroring, so deleting a gift never breaks the results table.
- `PATCH /api/admin/gifts/:id/active` — quick toggle, `{ active: boolean }`.

Image upload: Multer disk storage, destination `UPLOADS_DIR/gifts/`, filename
`${uuidv4()}${extname}`. `fileFilter` allow-lists `image/jpeg`, `image/png`,
`image/webp`; `limits.fileSize` = 5 MB. Rejected uploads return 400 with a clear
message (not a 500). Files are served via `express.static(UPLOADS_DIR)` mounted at
`/uploads`.

## 7. Settings & controls (admin)

`GET/PUT /api/admin/settings` manages the `settings` table:
- `wheel_enabled` (boolean) — public spin endpoint checks this (§4 step 2).
- `allow_repeat_gifts` (boolean) — affects eligibility computation (§4 step 3).

Additional admin actions (`/api/admin/...`):
- `POST /api/admin/reset-results` — deletes all rows from `participants`
  (irreversible). Client shows a confirmation dialog with the exact consequence
  spelled out before calling this.
- `DELETE /api/admin/participants/:id` — remove one participant record (e.g. a test
  spin), also with a confirm dialog.
- "Reset gift availability" is a direct consequence of `reset-results` (once
  participant rows are gone, all gifts become eligible again under
  `allow_repeat_gifts = false`), so it is not a separate endpoint — the UI labels
  the one button clearly as doing both.

## 8. Admin dashboard

`GET /api/admin/stats` returns counts computed with simple aggregate queries:
`totalParticipants`, `totalGifts`, `activeGifts`, `giftsAssigned` (= participant
count), `giftsRemaining` (= count of active gifts not yet won, meaningful mainly
when `allow_repeat_gifts` is false; when true, shown as "∞ (repeats allowed)" in the
UI rather than a number that would be misleading).

## 9. Participants / results view (admin)

`GET /api/admin/participants?sort=newest|oldest&search=<name>` returns joined rows
(`participants` ⋈ `gifts`) with name, gift name, gift image thumbnail URL, and
timestamp, plus a total count. Sorting and search are done in SQL (`ORDER BY`,
`LIKE` with parameter binding — never string-concatenated) to avoid pulling the
whole table for large lists, though realistic scale here is dozens to low hundreds
of rows.

## 10. Frontend structure

```
client/src/
  pages/
    Landing.jsx        name entry
    Wheel.jsx           spin screen
    Result.jsx          celebration + share
    admin/
      Login.jsx
      Dashboard.jsx
      Gifts.jsx
      Participants.jsx
      Settings.jsx
  components/
    Wheel/               SVG pie-segment wheel + spin animation
    Confetti.jsx
    FloatingBirthdayBits.jsx   balloons/emoji ambient background
    SoundToggle.jsx
    ConfirmDialog.jsx
    StatCard.jsx
    DataTable.jsx
  lib/
    api.js               fetch wrapper (JSON + multipart), throws typed errors
    sound.js              Web Audio API synth: click/whir/tick/fanfare
    useReducedMotion.js
  state/
    AppContext.jsx        holds { name, result } as user progresses landing→wheel→result
  App.jsx                 route table (react-router): /, /wheel, /result, /admin/*
```

State management: React Context + `useState`/`useReducer` only — the app has three
public screens and a handful of admin pages, so Redux/Zustand would be unjustified
overhead. Navigating directly to `/wheel` or `/result` without a name/result in
context redirects back to `/`.

**Wheel rendering**: SVG, segments computed via trigonometry from
`wheelSegments.length`, one distinct color per segment from a fixed bright palette
(cycled if more segments than palette colors), gift name text curved/rotated to fit
each slice. Spin animation: a CSS `transform: rotate()` driven by Framer Motion's
`animate()` with a multi-second `cubic-bezier` ease-out, computed target angle =
(several full rotations) + (angle that centers the winning segment under the
pointer). Landing is exact because the target segment is known before the animation
starts (from the `/api/spin` response) — the animation never "guesses."

**Sound**: `lib/sound.js` wraps a single `AudioContext`, created lazily on first user
gesture (button press) — never on page load, satisfying both the "no autoplay" and
browser autoplay-policy requirements. Effects are short oscillator-based tones:
click (square wave blip), spin whir (looping sawtooth with decaying pitch synced to
rotation deceleration), tick (per-segment-crossing click), celebration (ascending
3-note arpeggio + short noise-burst "pop"). A mute toggle persists to
`localStorage` (per-device convenience; not app state, so this is an acceptable use
of localStorage per project conventions) and is checked before any sound plays.

**WhatsApp share**: `https://wa.me/?text=${encodeURIComponent(message)}` (no phone
number param) opens WhatsApp's chat picker — on mobile this deep-links into the
WhatsApp app, on desktop it opens WhatsApp Web/Desktop; the user picks a chat
(including "Message Yourself") and presses send themselves. Message template:

```
🎁 Birthday Gift Assignment 🎁

I spun the wheel and apparently I'm responsible for getting you:

🎁 {{giftName}}

Apparently the wheel has spoken 😂

Get it here:
{{productUrl}}
```

## 11. Security

- **Helmet** for standard headers (CSP configured to allow same-origin only, since
  there are no third-party embeds).
- **express-rate-limit**: `/api/admin/login` (e.g. 10 attempts / 15 min / IP),
  `/api/spin` (e.g. 20 / min / IP — generous for party use, blunts scripted abuse).
- **Zod** schemas validate every request body/query server-side (client-side
  validation is UX only, never trusted).
- **SQL injection**: `node:sqlite` prepared statements (`db.prepare(sql).run/get/all()`)
  with bound `?` parameters everywhere; no string-concatenated SQL.
- **File upload validation**: MIME allow-list + size cap (§6); filenames are
  server-generated UUIDs, never derived from user input, preventing path traversal.
- **Secrets**: `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` all via `.env`
  (git-ignored), documented in `.env.example` with placeholder values only.
- **No public exposure of admin data**: participant list, stats, and full gift CRUD
  are only reachable behind `requireAdmin`; public endpoints return only the fields
  listed in §4/§6.

## 12. Error handling, loading & empty states

- API errors return a consistent shape `{ error: { message } }`; a central Express
  error handler catches thrown/rejected errors and logs server-side detail while
  returning a safe message to the client.
- Frontend: every async action (spin, admin CRUD, login) has a loading state
  (disabled button + spinner/playful "spinning..." text) and a visible error state
  (toast or inline message), never a silent failure.
- Empty states: wheel screen with zero active gifts shows a friendly "no gifts
  configured yet, bug the birthday human" message instead of an empty/broken wheel;
  admin Gifts/Participants tables show an explicit empty-state illustration/message
  instead of a blank table.

## 13. Testing approach

- Server: focused unit/integration tests (Vitest or Node's built-in test runner +
  supertest) for the spin transaction (uniform-ish distribution over many runs,
  exclusion behavior with `allow_repeat_gifts` false, empty-eligible-list 409,
  disabled-wheel 403), auth middleware (401 when unauthenticated, 200 after login),
  and gift CRUD validation (bad URL rejected, oversized/wrong-type upload rejected).
- Manual end-to-end pass (browser) before calling the project done: the full
  16-point checklist from the original request (spin flow, admin CRUD, image
  upload, disabling a gift removes it from the wheel, WhatsApp share link, mobile
  viewport, invalid input, admin auth) — done live via the in-app browser tool
  against the running dev server.

## 14. Environment variables (`.env.example`)

```
PORT=3000
NODE_ENV=development
SESSION_SECRET=change-me-to-a-long-random-string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-to-a-strong-password
SQLITE_PATH=./server/data/app.db
UPLOADS_DIR=./server/data/uploads
```

In production (Render), `SQLITE_PATH` and `UPLOADS_DIR` point at the mounted
persistent disk (e.g. `/data/app.db`, `/data/uploads`).

**Node version requirement:** `node:sqlite` does not exist before Node 22.5 and
required an `--experimental-sqlite` flag on some versions in that range. This
project targets **Node 24.x** for both local development and deployment (the
version it was verified against directly, with no flag and no stderr warnings)
— pin this explicitly in the host's Node version setting, not just via
`package.json` `engines`, since hosts don't always default to a recent enough
version on their own.

## 15. Out of scope / explicitly deferred

- Multi-admin accounts / roles.
- Editing a participant's assigned gift after the fact (delete-and-note-manually is
  the escape hatch if the admin needs to correct a mistake).
- Weighted/rarity-based gift odds (uniform random only, per §4).
- Automatic sending of the WhatsApp message without user interaction (explicitly
  disallowed by the request).

# Cash-or-Gift Choice + Multi-Spin + Submit/Retry — Design Spec

Date: 2026-09-08
Status: Approved for implementation
Builds on: [2026-09-07-birthday-gift-wheel-design.md](2026-09-07-birthday-gift-wheel-design.md) (the base app — this spec only documents what changes/adds to it)

## 1. Concept

After entering their name, a guest now chooses between two paths:

- **💰 Cash** — shown a funny card with a Cliq payment alias, can share it to WhatsApp,
  and must explicitly confirm ("Submit") before it's recorded.
- **🎁 Gift** — first asked "if you love me, will you get me 2 gifts?" (yes/no). A "yes"
  unlocks a second spin (two gifts to buy instead of one, each picked/confirmed
  independently). Either way, each gift they land on gets its own card with
  Share / Submit / Retry actions — nothing is saved to the database until they
  explicitly hit Submit and confirm a "you know you have to actually buy this" popup.
  Retry re-spins (up to 2 retries per gift slot) with zero cost to gift availability,
  since nothing was ever reserved in the first place.

Non-goals (unchanged from the base spec, plus): no real payment processing — the Cliq
alias is just displayed as text for the guest to use in their own banking app; the
server never touches money.

## 2. The core architectural change: spin becomes "pick, then confirm"

The base spec's `POST /api/spin` picked **and saved** a participant atomically, in one
transaction — the guarantee was that two guests could never both walk away thinking
they'd won the last unit of a non-repeatable gift, not even momentarily.

That guarantee is incompatible with "Retry puts the gift back for free" and "nothing
is logged until Submit." So the spin flow splits into two phases:

- **`POST /api/spin`** — picks only. No database write at all. Can be called
  repeatedly (every retry is a fresh, free call) and always picks from gifts that are
  active and not yet *submitted* by anyone (unsubmitted/retried picks never affected
  availability in the first place, since nothing was ever written).
- **`POST /api/participants`** — the actual Submit. Re-validates the pick is still
  eligible (in case another guest submitted the same gift in the meantime) and only
  then writes the row.

This trades the old design's strict atomicity for "re-checked immediately before
writing." At the scale of a birthday party (a handful of concurrent guests, a short
window between pick and submit) this is the right trade — the alternative
(reserve-on-pick, release-on-retry) adds a release endpoint and its own race
conditions for no practical benefit at this scale.

## 3. Data model changes

```sql
-- participants: gift_id becomes nullable, new outcome column added.
CREATE TABLE participants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  gift_id    INTEGER REFERENCES gifts(id),        -- nullable; NULL when outcome = 'cash'
  outcome    TEXT NOT NULL DEFAULT 'gift',          -- 'gift' | 'cash'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`settings` gains one new key: `cliq_alias` (default `'OH98'`), following the exact
same pattern as `wheel_enabled`/`allow_repeat_gifts` — admin-editable, no code change
needed to update it later.

**Migration note:** this project has no migration framework by design (base spec
§3), and SQLite cannot drop a `NOT NULL` constraint via `ALTER TABLE`. Since no real
party data exists yet, `initDb` simply defines the new schema via the same
`CREATE TABLE IF NOT EXISTS` pattern; the implementer deletes the local dev
`server/data/app.db` once as part of this change (documented as a one-time step,
called out loudly so it isn't confused with data loss in a real deployment later).

## 4. API changes

### `POST /api/spin` (modified — no longer writes)

Request: `{ name: string }`. Same validation as before (trim, 1–50 chars, 400
`INVALID_NAME`), same `wheel_enabled` check (403 `WHEEL_DISABLED`), same eligibility
computation (`active = 1`, and if `allow_repeat_gifts` is false, excluding any
`gift_id` already present in `participants WHERE outcome = 'gift'`), same 409
`NO_GIFTS_LEFT` when eligible list is empty, same uniform-random pick.

Response: `{ gift: {id, name, imageUrl, productUrl}, wheelSegments: [...] }` — no
`participant` field, because nothing was created. Purely a read; no transaction
needed since nothing is written.

### `POST /api/participants` (new — the actual save)

Request is one of:
```json
{ "name": "Ahmad", "outcome": "gift", "giftId": 3 }
{ "name": "Sara", "outcome": "cash" }
```

Behavior (inside one `runInTransaction` for the `gift` case):
1. Validate `name` (same rule as spin).
2. Validate `outcome` is exactly `'gift'` or `'cash'` (400 `INVALID_INPUT` otherwise).
3. **If `outcome === 'gift'`:** validate `giftId` is a positive integer (400
   `INVALID_INPUT`). Re-check `wheel_enabled` (403 `WHEEL_DISABLED` — an admin could
   have disabled the wheel between pick and submit). Re-fetch the gift: it must
   exist and be `active`; if `allow_repeat_gifts` is false, it must not already be
   won by anyone. If any of these fail, return 409 `GIFT_NO_LONGER_AVAILABLE` with a
   friendly message ("Someone beat you to it! Spin again 😅") — the client treats
   this exactly like a normal retry-needed state. Otherwise insert
   `{ name, gift_id: giftId, outcome: 'gift' }` and return
   `{ participant: { id, name, createdAt }, gift: {...} }`.
4. **If `outcome === 'cash'`:** no eligibility checks (cash is not a scarce
   resource). Insert `{ name, gift_id: null, outcome: 'cash' }` and return
   `{ participant: { id, name, createdAt } }`.

### `GET /api/settings/public` (extended)

Adds `cliqAlias: string` to the existing `{ wheelEnabled }` response — the Cash
screen needs it, and it's meant to be shared publicly (that's the whole point of a
payment alias), so no access-control concern.

### `GET`/`PUT /api/admin/settings` (extended)

Adds `cliqAlias` (non-empty string, reasonable length cap e.g. 50 chars, zod
validated) alongside the existing `allowRepeatGifts`/`wheelEnabled` fields.

### `GET /api/admin/participants` (extended)

Each row gains `outcome: 'gift' | 'cash'`. For `outcome = 'cash'` rows, `giftId`/
`giftName`/`giftImageUrl` are all `null` (same `LEFT JOIN` as before — a cash row's
`gift_id` is `NULL`, which the existing join already handles gracefully, no new
join logic needed).

### `GET /api/admin/stats` (extended)

`giftsAssigned`/`giftsRemaining` stay scoped to `outcome = 'gift'` rows only (cash
picks don't consume gift scarcity). `totalParticipants` counts every row regardless
of outcome. One new field: `cashPicks` (count of `outcome = 'cash'` rows), shown as
a 6th dashboard stat card.

## 5. Frontend flow

```
Landing (name)
  → Choice: "💰 Cash" or "🎁 Gift"

  Cash path (/cash):
    Card: funny line + "Cliq: {cliqAlias}" (fetched from GET /api/settings/public)
    Buttons: [📱 Share to WhatsApp] (always available) [Submit]
    Submit → confirm popup ("You sure? Hitting submit means cash it is 😏")
           → POST /api/participants {name, outcome:'cash'}
           → "✅ Locked in!" state, Share stays available, "Back to start" link
    (No retry — nothing to retry.)

  Gift path (/love-question):
    "If you love me... will you get me 2 gifts? 🥺🎁🎁"  [Yes] [No]
    Yes → spinsAllowed = 2   No → spinsAllowed = 1
    → /wheel (spin slot 1 of spinsAllowed)

  /wheel (per spin slot):
    If spinsAllowed > 1: small badge "🎁 Gift {spinsCompleted+1} of {spinsAllowed}"
    Spin → result card (on the existing Wheel/Result pages, unchanged visual style)
    Result card buttons: [📱 Share] [Submit] [Retry (if retriesRemaining > 0)]
    Retry  → retriesRemaining-- , navigate back to /wheel for a fresh pick
             (same slot; up to 2 retries = 3 total spin attempts per slot)
    Submit → confirm popup ("Are you sure?? Hitting submit means you're LEGALLY
             buying this 😂") → POST /api/participants {name, outcome:'gift', giftId}
             → on 409 GIFT_NO_LONGER_AVAILABLE: show the friendly message, let them
               Retry (if any remain) or return to start if not
             → on success: spinsCompleted++
                 if spinsCompleted < spinsAllowed → reset retriesRemaining to 2,
                   clear the current result, navigate('/wheel') for the next slot
                 else → "✅ Locked in! Go spend responsibly 😂", Share stays
                   available, "Back to start" link
```

`AppContext` gains three fields to carry this state across the Wheel/Result page
navigations: `spinsAllowed` (1 or 2, default 1), `spinsCompleted` (0..spinsAllowed,
default 0), `retriesRemaining` (0/1/2, reset to 2 whenever a new spin slot begins).
Share is available immediately once a result exists, regardless of submitted state —
it's informational, not gated behind Submit.

## 6. Admin UI changes

- **Settings page**: one more field, "Cliq alias" (text input, same save pattern as
  the existing toggles).
- **Participants page**: cash rows render as "💰 Cash (Cliq: {current cliqAlias})"
  in the gift column instead of a gift name/thumbnail — using the *current* live
  alias from settings (not a historical snapshot), since the practical purpose is
  "where should the host actually go collect this," which should always reflect
  today's alias even if it changed after the guest submitted.
- **Dashboard**: one more stat card, "💰 Cash Picks".

## 7. Error handling & edge cases

- Direct navigation to `/wheel` without going through Choice/Love-question (e.g.
  browser back/forward): `AppContext` defaults `spinsAllowed` to 1, so it degrades
  gracefully to the original single-spin behavior rather than crashing.
- `GIFT_NO_LONGER_AVAILABLE` (409 from `/api/participants`) is surfaced as a visible
  error message on the result card, using the exact same retry affordance as a
  normal retry — the guest doesn't need to understand *why*, just that they should
  spin again.
- If retries are exhausted (`retriesRemaining === 0`) and the gift they're holding
  turns out to be unavailable at Submit time, the Retry button is already hidden;
  show a "no more tries — head back and start over" message with a link to `/`.

## 8. Testing approach

- Server: `spin-service.test.js`/`public-routes.test.js` updated for the new
  no-write `POST /api/spin` contract; new tests for `POST /api/participants`
  covering both outcomes, the 409 race-lost path, and the `wheel_enabled`/
  `allow_repeat_gifts` interactions carried over from the old spin tests.
  `admin-settings-stats.test.js` extended for `cliqAlias` round-trip and the new
  `cashPicks` stat. `admin-participants.test.js` extended for cash-row rendering
  data (`outcome`, null gift fields).
- Client: no new pure-logic modules need unit tests; the new screens (Choice,
  LoveQuestion, Cash) and the modified Wheel/Result retry/submit flow are covered
  by a manual QA pass through the live app, mirroring how the base app's UI was
  verified.

## 9. Out of scope / explicitly deferred

- Any real payment integration — Cliq alias is display-only text.
- Editing/canceling a submitted participant's outcome after the fact (the existing
  admin "delete participant" action already covers correcting mistakes).
- A combined "here are both your gifts" summary screen — each gift keeps its own
  independent card/share/submit cycle, per the approved design.

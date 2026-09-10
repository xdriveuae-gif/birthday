import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import {
  listWonGiftIds,
  insertParticipant,
  listParticipants,
  countParticipants,
  countByOutcome,
  deleteParticipant,
  deleteAllParticipants,
} from '../src/db/participants.js';

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

test('insertParticipant stores and round-trips sessionId; defaults to null', () => {
  const { db, gift } = setup();
  const withSession = insertParticipant(db, { name: 'Ahmad', giftId: gift.id, sessionId: 'sess-123' });
  assert.equal(withSession.sessionId, 'sess-123');
  const withoutSession = insertParticipant(db, { name: 'Sara', outcome: 'cash' });
  assert.equal(withoutSession.sessionId, null);
  const [fetchedWithSession] = listParticipants(db, { search: 'Ahmad' });
  assert.equal(fetchedWithSession.sessionId, 'sess-123');
});

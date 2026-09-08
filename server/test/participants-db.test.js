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

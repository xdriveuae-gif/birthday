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

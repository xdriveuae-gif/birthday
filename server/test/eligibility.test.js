import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { insertParticipant } from '../src/db/participants.js';
import { getWheelSegments } from '../src/lib/eligibility.js';

test('getWheelSegments with no priceRange includes everything plus Cash', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Cheap', productUrl: 'https://example.com/a', priceRange: '10-25', active: true });
  createGift(db, { name: 'Mid', productUrl: 'https://example.com/b', priceRange: '25-50', active: true });
  const segments = getWheelSegments(db);
  assert.equal(segments.length, 3);
  assert.ok(segments.some((s) => s.id === 'cash'));
});

test('getWheelSegments filters to the given price range', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Cheap', productUrl: 'https://example.com/a', priceRange: '10-25', active: true });
  createGift(db, { name: 'Mid', productUrl: 'https://example.com/b', priceRange: '25-50', active: true });
  createGift(db, { name: 'Pricey', productUrl: 'https://example.com/c', priceRange: '50-100', active: true });
  const segments = getWheelSegments(db, { priceRange: '25-50' });
  const names = segments.map((s) => s.name);
  assert.ok(names.includes('Mid'));
  assert.ok(!names.includes('Cheap'));
  assert.ok(!names.includes('Pricey'));
  assert.ok(names.includes('Cash'));
});

test('a gift with no price_range set stays eligible for every bracket', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Untagged', productUrl: 'https://example.com/a', active: true });
  const segments = getWheelSegments(db, { priceRange: '50-100' });
  assert.ok(segments.some((s) => s.name === 'Untagged'));
});

test('includeCash: false excludes the Cash segment', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Gift', productUrl: 'https://example.com/a', active: true });
  const segments = getWheelSegments(db, { includeCash: false });
  assert.ok(!segments.some((s) => s.id === 'cash'));
  assert.equal(segments.length, 1);
});

test('includeCash: false with no matching gifts returns an empty list', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Pricey', productUrl: 'https://example.com/a', priceRange: '50-100', active: true });
  const segments = getWheelSegments(db, { priceRange: '10-25', includeCash: false });
  assert.deepEqual(segments, []);
});

test('an already-won gift is excluded from price-range filtering too', () => {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'Mid', productUrl: 'https://example.com/a', priceRange: '25-50', active: true });
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id, outcome: 'gift' });
  const segments = getWheelSegments(db, { priceRange: '25-50' });
  assert.ok(!segments.some((s) => s.name === 'Mid'));
});

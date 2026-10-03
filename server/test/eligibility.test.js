import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { insertParticipant } from '../src/db/participants.js';
import { getWheelSegments } from '../src/lib/eligibility.js';

test('getWheelSegments with no priceRange includes everything plus Cash, in both display and eligible', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Cheap', productUrl: 'https://example.com/a', priceRange: '10-25', active: true });
  createGift(db, { name: 'Mid', productUrl: 'https://example.com/b', priceRange: '25-50', active: true });
  const { display, eligible } = getWheelSegments(db);
  assert.equal(display.length, 3);
  assert.equal(eligible.length, 3);
  assert.ok(display.some((s) => s.id === 'cash'));
  assert.ok(eligible.some((s) => s.id === 'cash'));
});

test('a priceRange narrows eligible to that bracket, but display always shows every gift', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Cheap', productUrl: 'https://example.com/a', priceRange: '10-25', active: true });
  createGift(db, { name: 'Mid', productUrl: 'https://example.com/b', priceRange: '25-50', active: true });
  createGift(db, { name: 'Pricey', productUrl: 'https://example.com/c', priceRange: '50-100', active: true });
  const { display, eligible } = getWheelSegments(db, { priceRange: '25-50' });

  const displayNames = display.map((s) => s.name);
  assert.ok(displayNames.includes('Cheap'));
  assert.ok(displayNames.includes('Mid'));
  assert.ok(displayNames.includes('Pricey'));

  const eligibleNames = eligible.map((s) => s.name);
  assert.ok(eligibleNames.includes('Mid'));
  assert.ok(!eligibleNames.includes('Cheap'));
  assert.ok(!eligibleNames.includes('Pricey'));
  assert.ok(eligibleNames.includes('Cash'));
});

test('a gift with no price_range set stays eligible for every bracket', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Untagged', productUrl: 'https://example.com/a', active: true });
  const { eligible } = getWheelSegments(db, { priceRange: '50-100' });
  assert.ok(eligible.some((s) => s.name === 'Untagged'));
});

test('requireExactRange: true excludes a gift with no price_range set from eligible, but not from display', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Untagged', productUrl: 'https://example.com/a', active: true });
  createGift(db, { name: 'Tagged', productUrl: 'https://example.com/b', priceRange: '25-50', active: true });
  const { display, eligible } = getWheelSegments(db, { priceRange: '25-50', requireExactRange: true });

  const eligibleNames = eligible.map((s) => s.name);
  assert.ok(eligibleNames.includes('Tagged'));
  assert.ok(!eligibleNames.includes('Untagged'));

  const displayNames = display.map((s) => s.name);
  assert.ok(displayNames.includes('Tagged'));
  assert.ok(displayNames.includes('Untagged'));
});

test('includeCash: false excludes the Cash segment from both display and eligible', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Gift', productUrl: 'https://example.com/a', active: true });
  const { display, eligible } = getWheelSegments(db, { includeCash: false });
  assert.ok(!display.some((s) => s.id === 'cash'));
  assert.ok(!eligible.some((s) => s.id === 'cash'));
  assert.equal(display.length, 1);
  assert.equal(eligible.length, 1);
});

test('includeCash: false with no matching gifts leaves eligible empty while display still shows the gift', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Pricey', productUrl: 'https://example.com/a', priceRange: '50-100', active: true });
  const { display, eligible } = getWheelSegments(db, { priceRange: '10-25', includeCash: false });
  assert.deepEqual(eligible, []);
  assert.equal(display.length, 1);
  assert.equal(display[0].name, 'Pricey');
});

test('an already-won gift is excluded from both display and eligible', () => {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'Mid', productUrl: 'https://example.com/a', priceRange: '25-50', active: true });
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id, outcome: 'gift' });
  const { display, eligible } = getWheelSegments(db, { priceRange: '25-50' });
  assert.ok(!display.some((s) => s.name === 'Mid'));
  assert.ok(!eligible.some((s) => s.name === 'Mid'));
});

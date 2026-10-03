import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { updateSettings } from '../src/db/settings.js';
import { pickGift, SpinError } from '../src/services/spin.js';
import { countParticipants, insertParticipant } from '../src/db/participants.js';

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
  try {
    pickGift(db, '   ');
    assert.fail('expected SpinError');
  } catch (err) {
    assert.ok(err instanceof SpinError);
    assert.equal(err.status, 400);
    assert.equal(err.code, 'INVALID_NAME');
  }
  try {
    pickGift(db, 'a'.repeat(51));
    assert.fail('expected SpinError');
  } catch (err) {
    assert.ok(err instanceof SpinError);
    assert.equal(err.status, 400);
    assert.equal(err.code, 'INVALID_NAME');
  }
});

test('rejects spin when wheel is disabled', () => {
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

test('with no gifts at all, the wheel still has a Cash segment and always lands on it', () => {
  const db = initDb(':memory:'); // no gifts at all
  const result = pickGift(db, 'Ahmad');
  assert.equal(result.gift.id, 'cash');
  assert.equal(result.wheelSegments.length, 1);
  assert.equal(result.wheelSegments[0].id, 'cash');
});

test('a successful pick does not write a participant and returns the winning gift among wheelSegments', () => {
  const { db, gifts } = setupWithGifts();
  const result = pickGift(db, 'Ahmad');
  assert.equal(result.participant, undefined);
  assert.equal(countParticipants(db), 0);
  const winnerIds = [...gifts.map((g) => g.id), 'cash'];
  assert.ok(winnerIds.includes(result.gift.id));
  assert.ok(result.wheelSegments.some((g) => g.id === result.gift.id));
  assert.equal(result.wheelSegments.length, gifts.length + 1);
  assert.ok(result.wheelSegments.some((g) => g.id === 'cash'));
});

test('repeated picks remain eligible since nothing is written until submit', () => {
  const { db } = setupWithGifts(1);
  pickGift(db, 'Ahmad');
  const second = pickGift(db, 'Sara');
  assert.ok(second.gift);
  assert.equal(countParticipants(db), 0);
});

test('inactive gifts are never eligible', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Inactive', imageUrl: null, productUrl: 'https://example.com/x', active: false });
  const result = pickGift(db, 'Ahmad');
  assert.equal(result.gift.id, 'cash');
  assert.equal(result.wheelSegments.length, 1);
});

test('rejects an unknown priceRange', () => {
  const { db } = setupWithGifts();
  try {
    pickGift(db, 'Ahmad', { priceRange: 'free' });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 400);
    assert.equal(err.code, 'INVALID_INPUT');
  }
});

test('priceRange narrows the wheel to that bracket', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Cheap', imageUrl: null, productUrl: 'https://example.com/a', priceRange: '10-25', active: true });
  createGift(db, { name: 'Pricey', imageUrl: null, productUrl: 'https://example.com/b', priceRange: '50-100', active: true });
  const result = pickGift(db, 'Ahmad', { priceRange: '10-25' });
  const names = result.wheelSegments.map((s) => s.name);
  assert.ok(names.includes('Cheap'));
  assert.ok(!names.includes('Pricey'));
});

test('no 2 cash spins: once this session already confirmed Cash, Cash drops out of the wheel', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Gift', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  insertParticipant(db, { name: 'Sara', outcome: 'cash', sessionId: 'sess-1' });
  const result = pickGift(db, 'Sara', { sessionId: 'sess-1' });
  assert.notEqual(result.gift.id, 'cash');
  assert.ok(!result.wheelSegments.some((s) => s.id === 'cash'));
});

test('no 2 cash spins: a fresh session (no prior outcome) still includes Cash normally', () => {
  const db = initDb(':memory:');
  const result = pickGift(db, 'Sara', { sessionId: 'sess-2' });
  assert.ok(result.wheelSegments.some((s) => s.id === 'cash'));
});

test('Razan (and aliases) always get Cash on the first spin of a session', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Gift', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  for (const name of ['Razan', 'raz', 'ROZEH', 'Razan A.']) {
    const result = pickGift(db, name, { sessionId: `sess-${name}` });
    assert.equal(result.gift.id, 'cash', `expected Cash for "${name}"`);
  }
});

test('a name that merely contains "raz" as a substring is not treated as Razan', () => {
  const db = initDb(':memory:');
  const result = pickGift(db, 'Mirazul', { sessionId: 'sess-notrazan' });
  // Not forced to cash — should behave like a normal guest (wheel includes Cash as an option, not a forced win).
  assert.ok(result.wheelSegments.some((s) => s.id === 'cash'));
});

test('Razan always gets a 25-50 gift on her second spin, overriding her chosen price range and excluding Cash', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Cheap', imageUrl: null, productUrl: 'https://example.com/a', priceRange: '10-25', active: true });
  const midGift = createGift(db, { name: 'Mid', imageUrl: null, productUrl: 'https://example.com/b', priceRange: '25-50', active: true });
  insertParticipant(db, { name: 'Razan', outcome: 'cash', sessionId: 'sess-razan' });

  const result = pickGift(db, 'Razan', { sessionId: 'sess-razan', priceRange: '10-25' });
  assert.equal(result.gift.id, midGift.id);
  assert.ok(!result.wheelSegments.some((s) => s.id === 'cash'));
  assert.ok(!result.wheelSegments.some((s) => s.name === 'Cheap'));
});

test('an untagged gift (no price_range set) never leaks into Razan\'s forced 25-50 second spin', () => {
  const db = initDb(':memory:');
  // No priceRange at all — this is the common real-world case before an
  // admin has gone through and tagged every gift.
  createGift(db, { name: 'Untagged', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  insertParticipant(db, { name: 'Raz', outcome: 'cash', sessionId: 'sess-razan-untagged' });
  try {
    pickGift(db, 'Raz', { sessionId: 'sess-razan-untagged' });
    assert.fail('expected SpinError — an untagged gift must not count as a 25-50 match');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'NO_GIFTS_LEFT');
  }
});

test('a UAE IP triggers Razan\'s forced-cash rule even when the typed name does not match', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Gift', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  const result = pickGift(db, 'Mystery Guest', { sessionId: 'sess-uae-1', country: 'AE' });
  assert.equal(result.gift.id, 'cash');
});

test('a UAE IP forces a 25-50 gift on the second spin of that session, excluding Cash', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Cheap', imageUrl: null, productUrl: 'https://example.com/a', priceRange: '10-25', active: true });
  const midGift = createGift(db, { name: 'Mid', imageUrl: null, productUrl: 'https://example.com/b', priceRange: '25-50', active: true });
  insertParticipant(db, { name: 'Mystery Guest', outcome: 'cash', sessionId: 'sess-uae-2' });

  const result = pickGift(db, 'Mystery Guest', { sessionId: 'sess-uae-2', priceRange: '10-25', country: 'AE' });
  assert.equal(result.gift.id, midGift.id);
  assert.ok(!result.wheelSegments.some((s) => s.id === 'cash'));
});

test('a non-UAE country does not trigger the forced-outcome rule for an unmatched name', () => {
  const db = initDb(':memory:');
  const result = pickGift(db, 'Mystery Guest', { sessionId: 'sess-jo-1', country: 'JO' });
  assert.ok(result.wheelSegments.some((s) => s.id === 'cash'));
});

test('Razan\'s second spin errors clearly if no 25-50 gift is configured', () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Cheap', imageUrl: null, productUrl: 'https://example.com/a', priceRange: '10-25', active: true });
  insertParticipant(db, { name: 'Razan', outcome: 'cash', sessionId: 'sess-razan-2' });
  try {
    pickGift(db, 'Razan', { sessionId: 'sess-razan-2' });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'NO_GIFTS_LEFT');
  }
});

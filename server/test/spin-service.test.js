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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { updateSettings } from '../src/db/settings.js';
import { pickGift, SpinError } from '../src/services/spin.js';
import { countParticipants } from '../src/db/participants.js';

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

test('returns 409 when no eligible gifts exist', () => {
  const db = initDb(':memory:'); // no gifts at all
  try {
    pickGift(db, 'Ahmad');
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'NO_GIFTS_LEFT');
  }
});

test('a successful pick does not write a participant and returns the winning gift among wheelSegments', () => {
  const { db, gifts } = setupWithGifts();
  const result = pickGift(db, 'Ahmad');
  assert.equal(result.participant, undefined);
  assert.equal(countParticipants(db), 0);
  const winnerIds = gifts.map((g) => g.id);
  assert.ok(winnerIds.includes(result.gift.id));
  assert.ok(result.wheelSegments.some((g) => g.id === result.gift.id));
  assert.equal(result.wheelSegments.length, gifts.length);
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
  try {
    pickGift(db, 'Ahmad');
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'NO_GIFTS_LEFT');
  }
});

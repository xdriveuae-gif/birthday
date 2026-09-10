import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { createGift, setGiftActive } from '../src/db/gifts.js';
import { updateSettings } from '../src/db/settings.js';
import { countParticipants, countByOutcome } from '../src/db/participants.js';
import { confirmParticipation } from '../src/services/participants.js';
import { SpinError } from '../src/services/spin.js';

function setupWithGift() {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  return { db, gift };
}

test('rejects empty name', () => {
  const { db, gift } = setupWithGift();
  assert.throws(() => confirmParticipation(db, { name: '  ', outcome: 'gift', giftId: gift.id }), SpinError);
});

test('rejects an invalid outcome', () => {
  const { db } = setupWithGift();
  try {
    confirmParticipation(db, { name: 'Ahmad', outcome: 'bitcoin' });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 400);
    assert.equal(err.code, 'INVALID_INPUT');
  }
});

test('rejects a gift outcome with a missing or non-numeric giftId', () => {
  const { db } = setupWithGift();
  try {
    confirmParticipation(db, { name: 'Ahmad', outcome: 'gift' });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.code, 'INVALID_INPUT');
  }
});

test('cash outcome inserts a participant with no gift, no eligibility checks', () => {
  const { db } = setupWithGift();
  const { participant, gift } = confirmParticipation(db, { name: 'Sara', outcome: 'cash' });
  assert.equal(participant.name, 'Sara');
  assert.equal(gift, null);
  assert.equal(countByOutcome(db, 'cash'), 1);
});

test('gift outcome inserts a participant referencing the gift', () => {
  const { db, gift } = setupWithGift();
  const result = confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  assert.equal(result.participant.name, 'Ahmad');
  assert.equal(result.gift.id, gift.id);
  assert.equal(countByOutcome(db, 'gift'), 1);
});

test('rejects a gift that is no longer active', () => {
  const { db, gift } = setupWithGift();
  setGiftActive(db, gift.id, false);
  try {
    confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'GIFT_NO_LONGER_AVAILABLE');
  }
  assert.equal(countParticipants(db), 0);
});

test('rejects a gift already won by someone else when repeats are disabled', () => {
  const { db, gift } = setupWithGift();
  confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  try {
    confirmParticipation(db, { name: 'Sara', outcome: 'gift', giftId: gift.id });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.code, 'GIFT_NO_LONGER_AVAILABLE');
  }
  assert.equal(countParticipants(db), 1);
});

test('allows a gift already won when repeats are enabled', () => {
  const { db, gift } = setupWithGift();
  updateSettings(db, { allowRepeatGifts: true });
  confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  const second = confirmParticipation(db, { name: 'Sara', outcome: 'gift', giftId: gift.id });
  assert.equal(second.gift.id, gift.id);
});

test('rejects a gift submission when the wheel has been disabled since the pick', () => {
  const { db, gift } = setupWithGift();
  updateSettings(db, { wheelEnabled: false });
  try {
    confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id });
    assert.fail('expected SpinError');
  } catch (err) {
    assert.equal(err.status, 403);
    assert.equal(err.code, 'WHEEL_DISABLED');
  }
});

test('cash submissions are not blocked by a disabled wheel', () => {
  const { db } = setupWithGift();
  updateSettings(db, { wheelEnabled: false });
  const { participant } = confirmParticipation(db, { name: 'Sara', outcome: 'cash' });
  assert.ok(participant);
});

test('sessionId round-trips onto the saved participant for both outcomes', () => {
  const { db, gift } = setupWithGift();
  const cashResult = confirmParticipation(db, { name: 'Sara', outcome: 'cash', sessionId: 'sess-abc' });
  assert.equal(cashResult.participant.sessionId, 'sess-abc');
  const giftResult = confirmParticipation(db, { name: 'Ahmad', outcome: 'gift', giftId: gift.id, sessionId: 'sess-xyz' });
  assert.equal(giftResult.participant.sessionId, 'sess-xyz');
});

test('sessionId defaults to null when omitted or blank', () => {
  const { db } = setupWithGift();
  const noSession = confirmParticipation(db, { name: 'Sara', outcome: 'cash' });
  assert.equal(noSession.participant.sessionId, null);
  const blankSession = confirmParticipation(db, { name: 'Omar', outcome: 'cash', sessionId: '   ' });
  assert.equal(blankSession.participant.sessionId, null);
});

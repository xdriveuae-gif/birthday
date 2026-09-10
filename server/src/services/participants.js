import { runInTransaction } from '../db/index.js';
import { getAllSettings } from '../db/settings.js';
import { getGiftById } from '../db/gifts.js';
import { listWonGiftIds, insertParticipant } from '../db/participants.js';
import { SpinError } from './spin.js';

export function confirmParticipation(db, { name: rawName, outcome, giftId, sessionId }) {
  const name = String(rawName ?? '').trim();
  if (!name || name.length > 50) {
    throw new SpinError(400, 'INVALID_NAME', 'Please enter a name between 1 and 50 characters.');
  }
  if (outcome !== 'gift' && outcome !== 'cash') {
    throw new SpinError(400, 'INVALID_INPUT', 'outcome must be "gift" or "cash".');
  }
  const normalizedSessionId = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim().slice(0, 100) : null;

  if (outcome === 'cash') {
    const participant = insertParticipant(db, { name, giftId: null, outcome: 'cash', sessionId: normalizedSessionId });
    return { participant, gift: null };
  }

  const numericGiftId = Number(giftId);
  if (!Number.isInteger(numericGiftId) || numericGiftId <= 0) {
    throw new SpinError(400, 'INVALID_INPUT', 'giftId must be a positive integer.');
  }

  return runInTransaction(db, () => {
    const settings = getAllSettings(db);
    if (!settings.wheelEnabled) {
      throw new SpinError(403, 'WHEEL_DISABLED', 'The wheel is taking a nap. Ask the birthday human to turn it back on.');
    }

    const gift = getGiftById(db, numericGiftId);
    if (!gift || !gift.active) {
      throw new SpinError(409, 'GIFT_NO_LONGER_AVAILABLE', 'Someone beat you to it! Spin again 😅');
    }
    if (!settings.allowRepeatGifts && listWonGiftIds(db).has(gift.id)) {
      throw new SpinError(409, 'GIFT_NO_LONGER_AVAILABLE', 'Someone beat you to it! Spin again 😅');
    }

    const participant = insertParticipant(db, { name, giftId: gift.id, outcome: 'gift', sessionId: normalizedSessionId });
    return { participant, gift };
  });
}

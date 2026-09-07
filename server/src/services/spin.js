import { runInTransaction } from '../db/index.js';
import { getAllSettings } from '../db/settings.js';
import { listActiveGifts } from '../db/gifts.js';
import { listWonGiftIds, insertParticipant } from '../db/participants.js';

export class SpinError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function performSpin(db, rawName) {
  const name = String(rawName ?? '').trim();
  if (!name || name.length > 50) {
    throw new SpinError(400, 'INVALID_NAME', 'Please enter a name between 1 and 50 characters.');
  }

  return runInTransaction(db, () => {
    const settings = getAllSettings(db);
    if (!settings.wheelEnabled) {
      throw new SpinError(403, 'WHEEL_DISABLED', 'The wheel is taking a nap. Ask the birthday human to turn it back on.');
    }

    const activeGifts = listActiveGifts(db);
    const wonGiftIds = settings.allowRepeatGifts ? new Set() : listWonGiftIds(db);
    const eligible = activeGifts.filter((g) => !wonGiftIds.has(g.id));

    if (eligible.length === 0) {
      throw new SpinError(409, 'NO_GIFTS_LEFT', 'There are no gifts left on the wheel right now.');
    }

    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    const participant = insertParticipant(db, { name, giftId: winner.id });

    return { participant, gift: winner, wheelSegments: eligible };
  });
}

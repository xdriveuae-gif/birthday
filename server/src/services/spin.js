import { getAllSettings } from '../db/settings.js';
import { listActiveGifts } from '../db/gifts.js';
import { listWonGiftIds } from '../db/participants.js';
import { CASH_SEGMENT } from '../lib/cashSegment.js';

export class SpinError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function pickGift(db, rawName) {
  const name = String(rawName ?? '').trim();
  if (!name || name.length > 50) {
    throw new SpinError(400, 'INVALID_NAME', 'Please enter a name between 1 and 50 characters.');
  }

  const settings = getAllSettings(db);
  if (!settings.wheelEnabled) {
    throw new SpinError(403, 'WHEEL_DISABLED', 'The wheel is taking a nap. Ask the birthday human to turn it back on.');
  }

  const activeGifts = listActiveGifts(db);
  const wonGiftIds = settings.allowRepeatGifts ? new Set() : listWonGiftIds(db);
  const eligible = activeGifts.filter((g) => !wonGiftIds.has(g.id));
  const wheelSegments = [...eligible, CASH_SEGMENT];

  const winner = wheelSegments[Math.floor(Math.random() * wheelSegments.length)];

  return { gift: winner, wheelSegments };
}

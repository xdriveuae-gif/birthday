import { getAllSettings } from '../db/settings.js';
import { resolveWheelSegments } from '../lib/eligibility.js';
import { PRICE_RANGES } from '../lib/priceRanges.js';

export class SpinError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function pickGift(db, rawName, { sessionId = null, priceRange = null, country = null } = {}) {
  const name = String(rawName ?? '').trim();
  if (!name || name.length > 50) {
    throw new SpinError(400, 'INVALID_NAME', 'Please enter a name between 1 and 50 characters.');
  }
  if (priceRange !== null && !PRICE_RANGES.includes(priceRange)) {
    throw new SpinError(400, 'INVALID_INPUT', 'priceRange must be one of 10-25, 25-50, or 50-100.');
  }

  const settings = getAllSettings(db);
  if (!settings.wheelEnabled) {
    throw new SpinError(403, 'WHEEL_DISABLED', 'The wheel is taking a nap. Ask the birthday human to turn it back on.');
  }

  const { segments, forcedWinner } = resolveWheelSegments(db, { name, sessionId, priceRange, country });
  if (segments.length === 0) {
    throw new SpinError(409, 'NO_GIFTS_LEFT', 'There are no gifts left in that price range right now.');
  }
  const winner = forcedWinner ?? segments[Math.floor(Math.random() * segments.length)];

  return { gift: winner, wheelSegments: segments };
}

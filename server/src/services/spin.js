import { getAllSettings } from '../db/settings.js';
import { getWheelSegments } from '../lib/eligibility.js';

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

  const wheelSegments = getWheelSegments(db);
  const winner = wheelSegments[Math.floor(Math.random() * wheelSegments.length)];

  return { gift: winner, wheelSegments };
}

import { getAllSettings } from '../db/settings.js';
import { listActiveGifts } from '../db/gifts.js';
import { listWonGiftIds } from '../db/participants.js';
import { CASH_SEGMENT } from './cashSegment.js';

// The set of gifts that can currently be won: active gifts minus anything
// already won (unless repeats are allowed), plus the always-available Cash
// segment. Used both for the wheel's idle display and for the actual spin,
// so what a guest sees before spinning matches what they can actually win.
export function getWheelSegments(db) {
  const settings = getAllSettings(db);
  const activeGifts = listActiveGifts(db);
  const wonGiftIds = settings.allowRepeatGifts ? new Set() : listWonGiftIds(db);
  const eligible = activeGifts.filter((g) => !wonGiftIds.has(g.id));
  return [...eligible, CASH_SEGMENT];
}

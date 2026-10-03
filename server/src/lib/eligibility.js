import { getAllSettings } from '../db/settings.js';
import { listActiveGifts } from '../db/gifts.js';
import { listWonGiftIds, listOutcomesBySession } from '../db/participants.js';
import { isRazan } from './specialGuests.js';
import { CASH_SEGMENT } from './cashSegment.js';

const FORCED_GIFT_RANGE_FOR_RAZAN = '25-50';

// The set of gifts that can currently be won: active gifts minus anything
// already won (unless repeats are allowed), optionally narrowed to one price
// bracket, plus the Cash segment (unless explicitly excluded).
//
// By default a gift with no price_range set is treated as eligible for every
// bracket, so existing untagged gifts don't just vanish from the wheel once
// this filter is in use — appropriate when the bracket came from the guest's
// own choice. Pass requireExactRange: true to disable that fallback (an
// untagged gift no longer counts as a match) — needed for a *forced* bracket
// like Razan's, where "any gift" slipping through via the untagged fallback
// would defeat the whole point of forcing a specific range.
export function getWheelSegments(db, { priceRange = null, includeCash = true, requireExactRange = false } = {}) {
  const settings = getAllSettings(db);
  const activeGifts = listActiveGifts(db);
  const wonGiftIds = settings.allowRepeatGifts ? new Set() : listWonGiftIds(db);
  const eligible = activeGifts.filter((g) => {
    if (wonGiftIds.has(g.id)) return false;
    if (!priceRange) return true;
    if (g.priceRange === priceRange) return true;
    return !g.priceRange && !requireExactRange;
  });
  return includeCash ? [...eligible, CASH_SEGMENT] : eligible;
}

// The single source of truth for "what can this guest's next spin produce,"
// shared by the idle wheel display and the actual spin endpoint so they can
// never disagree (a past bug: the idle wheel once showed gifts the spin
// endpoint would never actually give out). Encodes both per-guest rules:
// Razan (and her aliases) always gets Cash on spin 1 of a 2-gift session and
// a 25-50 gift on spin 2 overriding her chosen range; everyone else just
// can't land Cash twice in the same session. The same forced outcome also
// applies to any guest spinning from a UAE IP, as a stand-in for Razan when
// her name isn't typed exactly — reliable here since she's the only UAE
// guest at this particular party and everyone else is in Jordan.
export function resolveWheelSegments(db, { name, sessionId = null, priceRange = null, country = null } = {}) {
  const priorOutcomes = listOutcomesBySession(db, sessionId);

  if (isRazan(name) || country === 'AE') {
    if (priorOutcomes.length === 0) {
      return { segments: getWheelSegments(db, { priceRange, includeCash: true }), forcedWinner: CASH_SEGMENT };
    }
    return {
      segments: getWheelSegments(db, {
        priceRange: FORCED_GIFT_RANGE_FOR_RAZAN,
        includeCash: false,
        requireExactRange: true,
      }),
      forcedWinner: null,
    };
  }

  return {
    segments: getWheelSegments(db, { priceRange, includeCash: !priorOutcomes.includes('cash') }),
    forcedWinner: null,
  };
}

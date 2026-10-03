import { getAllSettings } from '../db/settings.js';
import { listActiveGifts } from '../db/gifts.js';
import { listWonGiftIds, listOutcomesBySession } from '../db/participants.js';
import { isRazan } from './specialGuests.js';
import { CASH_SEGMENT } from './cashSegment.js';

const FORCED_GIFT_RANGES_FOR_RAZAN = ['25-50', '50-100'];

// Splits "what the wheel shows" from "what the spin can actually land on."
// The wheel always displays every active, not-yet-won gift (plus Cash,
// unless excluded) regardless of any price-range narrowing — so a guest
// sees the full variety of gifts on offer. The *eligible* list is the
// subset the random pick is actually drawn from, narrowed to one price
// bracket when one applies. Since eligible is always a subset of display,
// the winner is guaranteed to be one of the displayed segments.
//
// By default a gift with no price_range set is treated as eligible for every
// bracket, so existing untagged gifts don't just vanish from contention once
// this filter is in use — appropriate when the bracket came from the guest's
// own choice. Pass requireExactRange: true to disable that fallback (an
// untagged gift no longer counts as a match) — needed for a *forced* bracket
// like Razan's, where "any gift" slipping through via the untagged fallback
// would defeat the whole point of forcing a specific range.
//
// priceRange accepts either a single bracket ('25-50') or a list of brackets
// (['25-50', '50-100']) to match against — Razan's forced second spin spans
// two brackets at once.
export function getWheelSegments(db, { priceRange = null, includeCash = true, requireExactRange = false } = {}) {
  const settings = getAllSettings(db);
  const activeGifts = listActiveGifts(db);
  const wonGiftIds = settings.allowRepeatGifts ? new Set() : listWonGiftIds(db);
  const available = activeGifts.filter((g) => !wonGiftIds.has(g.id));
  const targetRanges = priceRange ? (Array.isArray(priceRange) ? priceRange : [priceRange]) : null;
  const eligibleGifts = targetRanges
    ? available.filter((g) => targetRanges.includes(g.priceRange) || (!g.priceRange && !requireExactRange))
    : available;
  return {
    display: includeCash ? [...available, CASH_SEGMENT] : available,
    eligible: includeCash ? [...eligibleGifts, CASH_SEGMENT] : eligibleGifts,
  };
}

// The single source of truth for "what can this guest's next spin produce,"
// shared by the idle wheel display and the actual spin endpoint so they can
// never disagree (a past bug: the idle wheel once showed gifts the spin
// endpoint would never actually give out). Encodes both per-guest rules:
// Razan (and her aliases) always gets Cash on spin 1 of a 2-gift session and
// a 25-50-or-50-100 gift on spin 2 overriding her chosen range; everyone else just
// can't land Cash twice in the same session. The same forced outcome also
// applies to any guest spinning from a UAE IP, as a stand-in for Razan when
// her name isn't typed exactly — reliable here since she's the only UAE
// guest at this particular party and everyone else is in Jordan.
export function resolveWheelSegments(db, { name, sessionId = null, priceRange = null, country = null } = {}) {
  const priorOutcomes = listOutcomesBySession(db, sessionId);

  if (isRazan(name) || country === 'AE') {
    if (priorOutcomes.length === 0) {
      const { display, eligible } = getWheelSegments(db, { priceRange, includeCash: true });
      return { display, eligible, forcedWinner: CASH_SEGMENT };
    }
    const { display, eligible } = getWheelSegments(db, {
      priceRange: FORCED_GIFT_RANGES_FOR_RAZAN,
      includeCash: false,
      requireExactRange: true,
    });
    return { display, eligible, forcedWinner: null };
  }

  const { display, eligible } = getWheelSegments(db, { priceRange, includeCash: !priorOutcomes.includes('cash') });
  return { display, eligible, forcedWinner: null };
}

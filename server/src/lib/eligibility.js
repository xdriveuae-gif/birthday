import { getAllSettings } from '../db/settings.js';
import { listActiveGifts } from '../db/gifts.js';
import { listWonGiftIds, listOutcomesBySession } from '../db/participants.js';
import { isRazan } from './specialGuests.js';
import { CASH_SEGMENT } from './cashSegment.js';

const FORCED_GIFT_RANGE_FOR_RAZAN = '25-50';

// The set of gifts that can currently be won: active gifts minus anything
// already won (unless repeats are allowed), optionally narrowed to one price
// bracket, plus the Cash segment (unless explicitly excluded). A gift with no
// price_range set is treated as eligible for every bracket, so existing
// untagged gifts don't just vanish from the wheel once this filter is in use.
export function getWheelSegments(db, { priceRange = null, includeCash = true } = {}) {
  const settings = getAllSettings(db);
  const activeGifts = listActiveGifts(db);
  const wonGiftIds = settings.allowRepeatGifts ? new Set() : listWonGiftIds(db);
  const eligible = activeGifts.filter(
    (g) => !wonGiftIds.has(g.id) && (!priceRange || !g.priceRange || g.priceRange === priceRange)
  );
  return includeCash ? [...eligible, CASH_SEGMENT] : eligible;
}

// The single source of truth for "what can this guest's next spin produce,"
// shared by the idle wheel display and the actual spin endpoint so they can
// never disagree (a past bug: the idle wheel once showed gifts the spin
// endpoint would never actually give out). Encodes both per-guest rules:
// Razan (and her aliases) always gets Cash on spin 1 of a 2-gift session and
// a 25-50 gift on spin 2 overriding her chosen range; everyone else just
// can't land Cash twice in the same session.
export function resolveWheelSegments(db, { name, sessionId = null, priceRange = null } = {}) {
  const priorOutcomes = listOutcomesBySession(db, sessionId);

  if (isRazan(name)) {
    if (priorOutcomes.length === 0) {
      return { segments: getWheelSegments(db, { priceRange, includeCash: true }), forcedWinner: CASH_SEGMENT };
    }
    return {
      segments: getWheelSegments(db, { priceRange: FORCED_GIFT_RANGE_FOR_RAZAN, includeCash: false }),
      forcedWinner: null,
    };
  }

  return {
    segments: getWheelSegments(db, { priceRange, includeCash: !priorOutcomes.includes('cash') }),
    forcedWinner: null,
  };
}

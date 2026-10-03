import { Router } from 'express';
import { resolveWheelSegments } from '../lib/eligibility.js';
import { PRICE_RANGES } from '../lib/priceRanges.js';
import { resolveCountry } from '../lib/geoCountry.js';

export function createPublicGiftsRouter(db) {
  const router = Router();
  router.get('/', async (req, res) => {
    const priceRangeParam = typeof req.query.priceRange === 'string' ? req.query.priceRange : null;
    const priceRange = PRICE_RANGES.includes(priceRangeParam) ? priceRangeParam : null;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    const country = await resolveCountry(req.ip);

    const { segments } = resolveWheelSegments(db, { name, sessionId, priceRange, country });
    res.json({ gifts: segments.map((g) => ({ id: g.id, name: g.name, imageUrl: g.imageUrl })) });
  });
  return router;
}

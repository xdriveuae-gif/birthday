import { Router } from 'express';
import { resolveWheelSegments } from '../lib/eligibility.js';
import { PRICE_RANGES } from '../lib/priceRanges.js';

export function createPublicGiftsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const priceRangeParam = typeof req.query.priceRange === 'string' ? req.query.priceRange : null;
    const priceRange = PRICE_RANGES.includes(priceRangeParam) ? priceRangeParam : null;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
    const name = typeof req.query.name === 'string' ? req.query.name : '';

    const { segments } = resolveWheelSegments(db, { name, sessionId, priceRange });
    res.json({ gifts: segments.map((g) => ({ id: g.id, name: g.name, imageUrl: g.imageUrl })) });
  });
  return router;
}

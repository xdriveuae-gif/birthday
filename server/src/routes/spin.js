import { Router } from 'express';
import { pickGift, SpinError } from '../services/spin.js';
import { resolveCountry } from '../lib/geoCountry.js';

export function createSpinRouter(db) {
  const router = Router();
  router.post('/', async (req, res, next) => {
    try {
      const country = await resolveCountry(req.ip);
      const { gift, wheelSegments } = pickGift(db, req.body?.name, {
        sessionId: req.body?.sessionId,
        priceRange: req.body?.priceRange ?? null,
        country,
      });
      res.json({
        gift: { id: gift.id, name: gift.name, imageUrl: gift.imageUrl, productUrl: gift.productUrl, price: gift.price ?? null },
        wheelSegments: wheelSegments.map((g) => ({ id: g.id, name: g.name, imageUrl: g.imageUrl })),
      });
    } catch (err) {
      if (err instanceof SpinError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });
  return router;
}

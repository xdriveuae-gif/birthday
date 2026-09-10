import { Router } from 'express';
import { getWheelSegments } from '../lib/eligibility.js';

export function createPublicGiftsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const gifts = getWheelSegments(db).map((g) => ({ id: g.id, name: g.name, imageUrl: g.imageUrl }));
    res.json({ gifts });
  });
  return router;
}

import { Router } from 'express';
import { listActiveGifts } from '../db/gifts.js';
import { CASH_SEGMENT } from '../lib/cashSegment.js';

export function createPublicGiftsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const gifts = listActiveGifts(db).map((g) => ({ id: g.id, name: g.name, imageUrl: g.imageUrl }));
    res.json({ gifts: [...gifts, CASH_SEGMENT] });
  });
  return router;
}

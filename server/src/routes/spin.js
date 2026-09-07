import { Router } from 'express';
import { performSpin, SpinError } from '../services/spin.js';

export function createSpinRouter(db) {
  const router = Router();
  router.post('/', (req, res, next) => {
    try {
      const { participant, gift, wheelSegments } = performSpin(db, req.body?.name);
      res.json({
        participant: { id: participant.id, name: participant.name, createdAt: participant.createdAt },
        gift: { id: gift.id, name: gift.name, imageUrl: gift.imageUrl, productUrl: gift.productUrl },
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

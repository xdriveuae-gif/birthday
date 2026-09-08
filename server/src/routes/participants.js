import { Router } from 'express';
import { confirmParticipation } from '../services/participants.js';
import { SpinError } from '../services/spin.js';

export function createParticipantsRouter(db) {
  const router = Router();
  router.post('/', (req, res, next) => {
    try {
      const { participant, gift } = confirmParticipation(db, {
        name: req.body?.name,
        outcome: req.body?.outcome,
        giftId: req.body?.giftId,
      });
      res.status(201).json({
        participant: { id: participant.id, name: participant.name, createdAt: participant.createdAt },
        gift: gift ? { id: gift.id, name: gift.name, imageUrl: gift.imageUrl, productUrl: gift.productUrl } : null,
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

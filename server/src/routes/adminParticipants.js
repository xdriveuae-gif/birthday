import { Router } from 'express';
import { listParticipants, deleteParticipant, deleteAllParticipants } from '../db/participants.js';

export function createAdminParticipantsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
    const search = String(req.query.search ?? '');
    const participants = listParticipants(db, { sort, search });
    res.json({ participants, total: participants.length });
  });

  router.delete('/:id', (req, res) => {
    deleteParticipant(db, req.params.id);
    res.json({ ok: true });
  });

  router.post('/reset', (req, res) => {
    deleteAllParticipants(db);
    res.json({ ok: true });
  });

  return router;
}

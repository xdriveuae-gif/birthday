import { Router } from 'express';
import { listAllGifts } from '../db/gifts.js';
import { countParticipants, listWonGiftIds } from '../db/participants.js';
import { getAllSettings } from '../db/settings.js';

export function createAdminStatsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const gifts = listAllGifts(db);
    const activeGifts = gifts.filter((g) => g.active);
    const settings = getAllSettings(db);
    const wonGiftIds = listWonGiftIds(db);
    const giftsRemaining = settings.allowRepeatGifts ? null : activeGifts.filter((g) => !wonGiftIds.has(g.id)).length;
    res.json({
      totalParticipants: countParticipants(db),
      totalGifts: gifts.length,
      activeGifts: activeGifts.length,
      giftsAssigned: countParticipants(db),
      giftsRemaining,
    });
  });
  return router;
}

import { Router } from 'express';
import { getAllSettings } from '../db/settings.js';

export function createPublicSettingsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const { wheelEnabled, cliqAlias } = getAllSettings(db);
    res.json({ wheelEnabled, cliqAlias });
  });
  return router;
}

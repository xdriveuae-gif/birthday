import { Router } from 'express';
import { z } from 'zod';
import { getAllSettings, updateSettings } from '../db/settings.js';

const settingsSchema = z.object({
  allowRepeatGifts: z.boolean().optional(),
  wheelEnabled: z.boolean().optional(),
});

export function createAdminSettingsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => res.json(getAllSettings(db)));
  router.put('/', (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid settings payload.' } });
    }
    res.json(updateSettings(db, parsed.data));
  });
  return router;
}

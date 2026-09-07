import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { requireAdmin } from './middleware/requireAdmin.js';
import { SqliteSessionStore } from './lib/sqliteSessionStore.js';
import { createSpinRouter } from './routes/spin.js';
import { createPublicGiftsRouter } from './routes/publicGifts.js';
import { createPublicSettingsRouter } from './routes/publicSettings.js';
import { createAdminAuthRouter } from './routes/adminAuth.js';
import { createAdminGiftsRouter } from './routes/adminGifts.js';
import { createAdminParticipantsRouter } from './routes/adminParticipants.js';
import { createAdminSettingsRouter } from './routes/adminSettings.js';
import { createAdminStatsRouter } from './routes/adminStats.js';

export function createApp({ db, uploadsDir, sessionSecret, clientDistDir, isProduction } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use(
    session({
      store: db ? new SqliteSessionStore(db) : undefined,
      secret: sessionSecret || 'dev-only-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: !!isProduction,
        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );

  if (uploadsDir) app.use('/uploads', express.static(uploadsDir));

  const spinLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

  app.use('/api/spin', spinLimiter, createSpinRouter(db));
  app.use('/api/gifts/public', createPublicGiftsRouter(db));
  app.use('/api/settings/public', createPublicSettingsRouter(db));

  app.use('/api/admin', createAdminAuthRouter(db, { loginLimiter }));
  app.use('/api/admin/gifts', requireAdmin, createAdminGiftsRouter(db, uploadsDir));
  app.use('/api/admin/participants', requireAdmin, createAdminParticipantsRouter(db));
  app.use('/api/admin/settings', requireAdmin, createAdminSettingsRouter(db));
  app.use('/api/admin/stats', requireAdmin, createAdminStatsRouter(db));

  if (isProduction && clientDistDir) {
    app.use(express.static(clientDistDir));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDistDir, 'index.html')));
  }

  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
  });

  return app;
}

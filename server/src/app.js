import express from 'express';

export function createApp({ isProduction }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  return app;
}

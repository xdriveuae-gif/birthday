import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { requireAdmin } from '../src/middleware/requireAdmin.js';

function buildApp() {
  const app = express();
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.get('/protected', requireAdmin, (req, res) => res.json({ ok: true }));
  app.post('/fake-login', (req, res) => {
    req.session.adminId = 1;
    res.json({ ok: true });
  });
  return app;
}

test('requireAdmin blocks unauthenticated requests', async () => {
  const res = await request(buildApp()).get('/protected');
  assert.equal(res.status, 401);
});

test('requireAdmin allows requests with an authenticated session', async () => {
  const app = buildApp();
  const agent = request.agent(app);
  await agent.post('/fake-login');
  const res = await agent.get('/protected');
  assert.equal(res.status, 200);
});

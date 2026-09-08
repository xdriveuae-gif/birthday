import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { initDb, seedAdminIfEmpty } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { createAdminAuthRouter } from '../src/routes/adminAuth.js';

function buildTestApp() {
  const db = initDb(':memory:');
  seedAdminIfEmpty(db, 'admin', hashPassword('secret123'));
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
  app.use('/api/admin', createAdminAuthRouter(db));
  return app;
}

test('rejects login with wrong password', async () => {
  const res = await request(buildTestApp()).post('/api/admin/login').send({ username: 'admin', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('rejects login with missing fields', async () => {
  const res = await request(buildTestApp()).post('/api/admin/login').send({ username: 'admin' });
  assert.equal(res.status, 400);
});

test('GET /me is 401 when not logged in', async () => {
  const res = await request(buildTestApp()).get('/api/admin/me');
  assert.equal(res.status, 401);
});

test('login then /me returns the username, logout then /me is 401 again', async () => {
  const app = buildTestApp();
  const agent = request.agent(app);

  const loginRes = await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.username, 'admin');

  const meRes = await agent.get('/api/admin/me');
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.username, 'admin');

  const logoutRes = await agent.post('/api/admin/logout');
  assert.equal(logoutRes.status, 200);

  const meAfterLogout = await agent.get('/api/admin/me');
  assert.equal(meAfterLogout.status, 401);
});

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
  return { app, db };
}

test('rejects login with wrong password', async () => {
  const { app } = buildTestApp();
  const res = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('rejects login with missing fields', async () => {
  const { app } = buildTestApp();
  const res = await request(app).post('/api/admin/login').send({ username: 'admin' });
  assert.equal(res.status, 400);
});

test('GET /me is 401 when not logged in', async () => {
  const { app } = buildTestApp();
  const res = await request(app).get('/api/admin/me');
  assert.equal(res.status, 401);
});

test('login then /me returns the username, logout then /me is 401 again', async () => {
  const { app } = buildTestApp();
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

test('PATCH /credentials requires login', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .patch('/api/admin/credentials')
    .send({ currentPassword: 'secret123', newUsername: 'admin', newPassword: 'newpass123' });
  assert.equal(res.status, 401);
});

test('PATCH /credentials rejects the wrong current password', async () => {
  const { app } = buildTestApp();
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' });

  const res = await agent
    .patch('/api/admin/credentials')
    .send({ currentPassword: 'wrong', newUsername: 'admin', newPassword: 'newpass123' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
});

test('PATCH /credentials rejects an empty new password', async () => {
  const { app } = buildTestApp();
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' });

  const res = await agent
    .patch('/api/admin/credentials')
    .send({ currentPassword: 'secret123', newUsername: 'admin', newPassword: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');
});

test('PATCH /credentials allows a short new password like "admin"', async () => {
  const { app } = buildTestApp();
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' });

  const res = await agent
    .patch('/api/admin/credentials')
    .send({ currentPassword: 'secret123', newUsername: 'admin', newPassword: 'admin' });
  assert.equal(res.status, 200);

  const loginRes = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'admin' });
  assert.equal(loginRes.status, 200);
});

test('PATCH /credentials changes username and password; old password stops working, new one logs in', async () => {
  const { app } = buildTestApp();
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' });

  const updateRes = await agent
    .patch('/api/admin/credentials')
    .send({ currentPassword: 'secret123', newUsername: 'newadmin', newPassword: 'newpass123' });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.username, 'newadmin');

  const oldLoginRes = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'secret123' });
  assert.equal(oldLoginRes.status, 401);

  const newLoginRes = await request(app)
    .post('/api/admin/login')
    .send({ username: 'newadmin', password: 'newpass123' });
  assert.equal(newLoginRes.status, 200);
  assert.equal(newLoginRes.body.username, 'newadmin');
});

test('PATCH /credentials keeps the username unchanged when newUsername is omitted', async () => {
  const { app } = buildTestApp();
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' });

  const updateRes = await agent.patch('/api/admin/credentials').send({ currentPassword: 'secret123', newPassword: 'newpass123' });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.username, 'admin');

  const newLoginRes = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'newpass123' });
  assert.equal(newLoginRes.status, 200);
});

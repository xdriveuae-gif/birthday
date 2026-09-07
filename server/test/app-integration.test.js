import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, seedAdminIfEmpty } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { createApp } from '../src/app.js';

const tmpDirs = [];
const openDbs = [];
function buildRealApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bday-app-'));
  tmpDirs.push(root);
  const db = initDb(path.join(root, 'app.db'));
  openDbs.push(db);
  seedAdminIfEmpty(db, 'admin', hashPassword('secret123'));
  const uploadsDir = path.join(root, 'uploads');
  return createApp({ db, uploadsDir, sessionSecret: 'test-secret', clientDistDir: null, isProduction: false });
}

after(() => {
  for (const db of openDbs) {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

test('GET /api/health works through the fully assembled app', async () => {
  const res = await request(buildRealApp()).get('/api/health');
  assert.deepEqual(res.body, { ok: true });
});

test('admin routes are 401 without login, then reachable after login', async () => {
  const app = buildRealApp();
  const unauth = await request(app).get('/api/admin/gifts');
  assert.equal(unauth.status, 401);

  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' }).expect(200);
  const authed = await agent.get('/api/admin/gifts');
  assert.equal(authed.status, 200);
});

test('full flow: admin creates a gift, then a public spin wins it', async () => {
  const app = buildRealApp();
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ username: 'admin', password: 'secret123' }).expect(200);

  const createRes = await agent
    .post('/api/admin/gifts')
    .field('name', 'AirPods')
    .field('productUrl', 'https://example.com/airpods')
    .field('active', 'true')
    .expect(201);
  assert.equal(createRes.body.gift.name, 'AirPods');

  const spinRes = await request(app).post('/api/spin').send({ name: 'Ahmad' }).expect(200);
  assert.equal(spinRes.body.gift.name, 'AirPods');

  const participantsRes = await agent.get('/api/admin/participants').expect(200);
  assert.equal(participantsRes.body.total, 1);
  assert.equal(participantsRes.body.participants[0].name, 'Ahmad');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { insertParticipant } from '../src/db/participants.js';
import { createAdminParticipantsRouter } from '../src/routes/adminParticipants.js';

function buildApp() {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  const app = express();
  app.use(express.json());
  app.use('/api/admin/participants', createAdminParticipantsRouter(db));
  return { app, db, gift };
}

test('lists participants newest first by default, with total', async () => {
  const { app, db, gift } = buildApp();
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  insertParticipant(db, { name: 'Sara', giftId: gift.id });
  const res = await request(app).get('/api/admin/participants');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.participants[0].name, 'Sara');
});

test('supports search and oldest sort', async () => {
  const { app, db, gift } = buildApp();
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  insertParticipant(db, { name: 'Sara', giftId: gift.id });
  const res = await request(app).get('/api/admin/participants?sort=oldest&search=ahm');
  assert.equal(res.body.participants.length, 1);
  assert.equal(res.body.participants[0].name, 'Ahmad');
});

test('deletes a single participant', async () => {
  const { app, db, gift } = buildApp();
  const p = insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  const res = await request(app).delete(`/api/admin/participants/${p.id}`);
  assert.equal(res.status, 200);
  const list = await request(app).get('/api/admin/participants');
  assert.equal(list.body.total, 0);
});

test('resets all participants', async () => {
  const { app, db, gift } = buildApp();
  insertParticipant(db, { name: 'Ahmad', giftId: gift.id });
  insertParticipant(db, { name: 'Sara', giftId: gift.id });
  const res = await request(app).post('/api/admin/participants/reset');
  assert.equal(res.status, 200);
  const list = await request(app).get('/api/admin/participants');
  assert.equal(list.body.total, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { insertParticipant } from '../src/db/participants.js';
import { createAdminSettingsRouter } from '../src/routes/adminSettings.js';
import { createAdminStatsRouter } from '../src/routes/adminStats.js';

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/settings', createAdminSettingsRouter(db));
  app.use('/api/admin/stats', createAdminStatsRouter(db));
  return app;
}

test('GET/PUT settings round-trip, including cliqAlias', async () => {
  const db = initDb(':memory:');
  const app = buildApp(db);
  const getRes = await request(app).get('/api/admin/settings');
  assert.deepEqual(getRes.body, { allowRepeatGifts: false, wheelEnabled: true, cliqAlias: 'OH98' });

  const putRes = await request(app).put('/api/admin/settings').send({ allowRepeatGifts: true, cliqAlias: 'AB12' });
  assert.equal(putRes.status, 200);
  assert.deepEqual(putRes.body, { allowRepeatGifts: true, wheelEnabled: true, cliqAlias: 'AB12' });
});

test('rejects invalid settings payload', async () => {
  const db = initDb(':memory:');
  const app = buildApp(db);
  const res = await request(app).put('/api/admin/settings').send({ wheelEnabled: 'yes' });
  assert.equal(res.status, 400);
});

test('stats reflect gifts and participants, giftsRemaining is null when repeats allowed', async () => {
  const db = initDb(':memory:');
  const app = buildApp(db);
  const g1 = createGift(db, { name: 'A', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  createGift(db, { name: 'B (inactive)', imageUrl: null, productUrl: 'https://example.com/b', active: false });
  insertParticipant(db, { name: 'Ahmad', giftId: g1.id });

  const res1 = await request(app).get('/api/admin/stats');
  assert.equal(res1.body.totalParticipants, 1);
  assert.equal(res1.body.totalGifts, 2);
  assert.equal(res1.body.activeGifts, 1);
  assert.equal(res1.body.giftsAssigned, 1);
  assert.equal(res1.body.giftsRemaining, 0);

  await request(app).put('/api/admin/settings').send({ allowRepeatGifts: true });
  const res2 = await request(app).get('/api/admin/stats');
  assert.equal(res2.body.giftsRemaining, null);
});

test('stats: giftsAssigned excludes cash rows, cashPicks counts them', async () => {
  const db = initDb(':memory:');
  const app = buildApp(db);
  const g1 = createGift(db, { name: 'A', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  insertParticipant(db, { name: 'Ahmad', giftId: g1.id, outcome: 'gift' });
  insertParticipant(db, { name: 'Sara', outcome: 'cash' });
  insertParticipant(db, { name: 'Omar', outcome: 'cash' });

  const res = await request(app).get('/api/admin/stats');
  assert.equal(res.body.totalParticipants, 3);
  assert.equal(res.body.giftsAssigned, 1);
  assert.equal(res.body.cashPicks, 2);
});

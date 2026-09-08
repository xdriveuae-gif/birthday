import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { updateSettings } from '../src/db/settings.js';
import { createSpinRouter } from '../src/routes/spin.js';
import { createPublicGiftsRouter } from '../src/routes/publicGifts.js';
import { createPublicSettingsRouter } from '../src/routes/publicSettings.js';

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/spin', createSpinRouter(db));
  app.use('/api/gifts/public', createPublicGiftsRouter(db));
  app.use('/api/settings/public', createPublicSettingsRouter(db));
  return app;
}

test('GET /api/gifts/public only lists active gifts, without productUrl', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Active', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  createGift(db, { name: 'Inactive', imageUrl: null, productUrl: 'https://example.com/b', active: false });
  const res = await request(buildApp(db)).get('/api/gifts/public');
  assert.equal(res.status, 200);
  assert.equal(res.body.gifts.length, 1);
  assert.equal(res.body.gifts[0].name, 'Active');
  assert.equal(res.body.gifts[0].productUrl, undefined);
});

test('GET /api/settings/public reflects wheelEnabled', async () => {
  const db = initDb(':memory:');
  updateSettings(db, { wheelEnabled: false });
  const res = await request(buildApp(db)).get('/api/settings/public');
  assert.deepEqual(res.body, { wheelEnabled: false });
});

test('POST /api/spin returns 400 for missing name', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/spin').send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_NAME');
});

test('POST /api/spin returns a candidate gift and wheelSegments, without saving a participant', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  const res = await request(buildApp(db)).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(res.status, 200);
  assert.equal(res.body.gift.name, 'AirPods');
  assert.equal(res.body.gift.productUrl, 'https://example.com/airpods');
  assert.equal(res.body.wheelSegments.length, 1);
  assert.equal(res.body.participant, undefined);
});

test('POST /api/spin can be called repeatedly without reducing eligibility', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  const app = buildApp(db);
  await request(app).post('/api/spin').send({ name: 'Ahmad' }).expect(200);
  const second = await request(app).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(second.status, 200);
  assert.equal(second.body.gift.name, 'AirPods');
});

test('POST /api/spin returns 409 when there are no gifts at all', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'NO_GIFTS_LEFT');
});

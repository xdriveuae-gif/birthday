import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb } from '../src/db/index.js';
import { createGift } from '../src/db/gifts.js';
import { insertParticipant } from '../src/db/participants.js';
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

test('GET /api/gifts/public lists active gifts plus a Cash segment, without productUrl', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'Active', imageUrl: null, productUrl: 'https://example.com/a', active: true });
  createGift(db, { name: 'Inactive', imageUrl: null, productUrl: 'https://example.com/b', active: false });
  const res = await request(buildApp(db)).get('/api/gifts/public');
  assert.equal(res.status, 200);
  assert.equal(res.body.gifts.length, 2);
  assert.equal(res.body.gifts[0].name, 'Active');
  assert.equal(res.body.gifts[0].productUrl, undefined);
  assert.equal(res.body.gifts[1].id, 'cash');
  assert.equal(res.body.gifts[1].name, 'Cash');
});

test('GET /api/gifts/public excludes a gift someone already won (matching what a spin can actually pick)', async () => {
  const db = initDb(':memory:');
  const keyboard = createGift(db, { name: 'Keyboard', imageUrl: null, productUrl: 'https://example.com/keyboard', active: true });
  createGift(db, { name: 'Mouse', imageUrl: null, productUrl: 'https://example.com/mouse', active: true });
  insertParticipant(db, { name: 'SomeoneElse', giftId: keyboard.id, outcome: 'gift' });

  const res = await request(buildApp(db)).get('/api/gifts/public');
  assert.equal(res.status, 200);
  const names = res.body.gifts.map((g) => g.name);
  assert.ok(!names.includes('Keyboard'), 'already-won gift must not appear on the idle wheel');
  assert.ok(names.includes('Mouse'));
});

test('GET /api/gifts/public includes an already-won gift when allowRepeatGifts is on', async () => {
  const db = initDb(':memory:');
  updateSettings(db, { allowRepeatGifts: true });
  const keyboard = createGift(db, { name: 'Keyboard', imageUrl: null, productUrl: 'https://example.com/keyboard', active: true });
  insertParticipant(db, { name: 'SomeoneElse', giftId: keyboard.id, outcome: 'gift' });

  const res = await request(buildApp(db)).get('/api/gifts/public');
  const names = res.body.gifts.map((g) => g.name);
  assert.ok(names.includes('Keyboard'));
});

test('GET /api/settings/public reflects wheelEnabled and cliqAlias', async () => {
  const db = initDb(':memory:');
  updateSettings(db, { wheelEnabled: false, cliqAlias: 'AB12' });
  const res = await request(buildApp(db)).get('/api/settings/public');
  assert.deepEqual(res.body, { wheelEnabled: false, cliqAlias: 'AB12' });
});

test('POST /api/spin returns 400 for missing name', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/spin').send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_NAME');
});

test('POST /api/spin returns a candidate gift (real or cash) and wheelSegments, without saving a participant', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  const res = await request(buildApp(db)).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(res.status, 200);
  assert.ok(['AirPods', 'Cash'].includes(res.body.gift.name));
  assert.equal(res.body.wheelSegments.length, 2);
  assert.ok(res.body.wheelSegments.some((g) => g.name === 'AirPods'));
  assert.ok(res.body.wheelSegments.some((g) => g.id === 'cash'));
  assert.equal(res.body.participant, undefined);
});

test('POST /api/spin can be called repeatedly without reducing eligibility', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  const app = buildApp(db);
  await request(app).post('/api/spin').send({ name: 'Ahmad' }).expect(200);
  const second = await request(app).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(second.status, 200);
  assert.equal(second.body.wheelSegments.length, 2);
});

test('POST /api/spin includes the gift price when landing on a real gift', async () => {
  const db = initDb(':memory:');
  createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', price: '25 JOD', active: true });
  const app = buildApp(db);
  let gift;
  for (let i = 0; i < 50 && (!gift || gift.id === 'cash'); i++) {
    gift = (await request(app).post('/api/spin').send({ name: 'Ahmad' })).body.gift;
  }
  assert.equal(gift.name, 'AirPods');
  assert.equal(gift.price, '25 JOD');
});

test('POST /api/spin always lands on Cash when there are no real gifts', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/spin').send({ name: 'Ahmad' });
  assert.equal(res.status, 200);
  assert.equal(res.body.gift.id, 'cash');
  assert.equal(res.body.wheelSegments.length, 1);
});

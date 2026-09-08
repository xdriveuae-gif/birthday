import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { initDb } from '../src/db/index.js';
import { createGift, setGiftActive } from '../src/db/gifts.js';
import { createParticipantsRouter } from '../src/routes/participants.js';

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/participants', createParticipantsRouter(db));
  return app;
}

test('saves a cash outcome', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/participants').send({ name: 'Sara', outcome: 'cash' });
  assert.equal(res.status, 201);
  assert.equal(res.body.participant.name, 'Sara');
  assert.equal(res.body.gift, null);
});

test('saves a gift outcome', async () => {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  const res = await request(buildApp(db)).post('/api/participants').send({ name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.gift.name, 'AirPods');
});

test('rejects an unavailable gift with 409 GIFT_NO_LONGER_AVAILABLE', async () => {
  const db = initDb(':memory:');
  const gift = createGift(db, { name: 'AirPods', imageUrl: null, productUrl: 'https://example.com/airpods', active: true });
  setGiftActive(db, gift.id, false);
  const res = await request(buildApp(db))
    .post('/api/participants')
    .send({ name: 'Ahmad', outcome: 'gift', giftId: gift.id });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'GIFT_NO_LONGER_AVAILABLE');
});

test('rejects an invalid outcome', async () => {
  const db = initDb(':memory:');
  const res = await request(buildApp(db)).post('/api/participants').send({ name: 'Ahmad', outcome: 'crypto' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');
});

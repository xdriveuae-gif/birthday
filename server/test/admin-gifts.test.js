import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb } from '../src/db/index.js';
import { createAdminGiftsRouter } from '../src/routes/adminGifts.js';

const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const tmpDirs = [];
function buildApp() {
  const db = initDb(':memory:');
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bday-uploads-'));
  tmpDirs.push(uploadsDir);
  const app = express();
  app.use(express.json());
  app.use('/api/admin/gifts', createAdminGiftsRouter(db, uploadsDir));
  return { app, uploadsDir };
}

after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test('creates a gift with an image and lists it', async () => {
  const { app } = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'AirPods')
    .field('productUrl', 'https://example.com/airpods')
    .field('active', 'true')
    .attach('image', PNG_BUFFER, { filename: 'airpods.png', contentType: 'image/png' });
  assert.equal(createRes.status, 201);
  assert.match(createRes.body.gift.imageUrl, /^\/uploads\/gifts\/.+\.png$/);

  const listRes = await request(app).get('/api/admin/gifts');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.gifts.length, 1);
});

test('rejects an invalid product URL', async () => {
  const { app } = buildApp();
  const res = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Bad')
    .field('productUrl', 'not-a-url')
    .field('active', 'true');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');
});

test('rejects a non-image file', async () => {
  const { app } = buildApp();
  const res = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Evil')
    .field('productUrl', 'https://example.com/evil')
    .field('active', 'true')
    .attach('image', Buffer.from('not an image'), { filename: 'evil.txt', contentType: 'text/plain' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_FILE_TYPE');
});

test('rejects a text file renamed with an image extension and spoofed content-type', async () => {
  // Regression test for a QA bug: a browser assigns Content-Type from a file's
  // extension, not its real content, so a .txt file renamed to look like a .png
  // arrives with contentType: 'image/png'. The server must not trust that header
  // alone — it must sniff the actual bytes and reject non-image content.
  const { app, uploadsDir } = buildApp();
  const res = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Spoofed')
    .field('productUrl', 'https://example.com/spoofed')
    .field('active', 'true')
    .attach('image', Buffer.from('just plain text, not a real image'), {
      filename: 'evil.png',
      contentType: 'image/png',
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_FILE_TYPE');

  const listRes = await request(app).get('/api/admin/gifts');
  assert.equal(listRes.body.gifts.length, 0, 'no gift should have been created');
  assert.equal(fs.readdirSync(path.join(uploadsDir, 'gifts')).length, 0, 'no file should have been written to disk');
});

test('rejects an image larger than 5MB', async () => {
  const { app } = buildApp();
  const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 1);
  const res = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Big')
    .field('productUrl', 'https://example.com/big')
    .field('active', 'true')
    .attach('image', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'FILE_TOO_LARGE');
});

test('updates a gift and toggles active', async () => {
  const { app } = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'PS5')
    .field('productUrl', 'https://example.com/ps5')
    .field('active', 'true');
  const id = createRes.body.gift.id;

  const updateRes = await request(app)
    .put(`/api/admin/gifts/${id}`)
    .field('name', 'PS5 Pro')
    .field('productUrl', 'https://example.com/ps5pro')
    .field('active', 'true');
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.gift.name, 'PS5 Pro');

  const toggleRes = await request(app).patch(`/api/admin/gifts/${id}/active`).send({ active: false });
  assert.equal(toggleRes.status, 200);
  assert.equal(toggleRes.body.gift.active, false);
});

test('deletes a gift', async () => {
  const { app } = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Temp')
    .field('productUrl', 'https://example.com/temp')
    .field('active', 'true');
  const id = createRes.body.gift.id;
  const deleteRes = await request(app).delete(`/api/admin/gifts/${id}`);
  assert.equal(deleteRes.status, 200);
  const listRes = await request(app).get('/api/admin/gifts');
  assert.equal(listRes.body.gifts.length, 0);
});

test('returns 404 for unknown gift id on update/delete', async () => {
  const { app } = buildApp();
  const updateRes = await request(app)
    .put('/api/admin/gifts/999')
    .field('name', 'X')
    .field('productUrl', 'https://example.com/x')
    .field('active', 'true');
  assert.equal(updateRes.status, 404);
  const deleteRes = await request(app).delete('/api/admin/gifts/999');
  assert.equal(deleteRes.status, 404);
});

test('replacing image on update deletes the old file from disk', async () => {
  const { app, uploadsDir } = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Watch')
    .field('productUrl', 'https://example.com/watch')
    .field('active', 'true')
    .attach('image', PNG_BUFFER, { filename: 'watch.png', contentType: 'image/png' });
  const id = createRes.body.gift.id;
  const oldImageUrl = createRes.body.gift.imageUrl;
  const oldFilePath = path.join(uploadsDir, oldImageUrl.replace(/^\/uploads\//, ''));
  assert.ok(fs.existsSync(oldFilePath), 'old file should exist after create');

  const updateRes = await request(app)
    .put(`/api/admin/gifts/${id}`)
    .field('name', 'Watch 2')
    .field('productUrl', 'https://example.com/watch2')
    .field('active', 'true')
    .attach('image', PNG_BUFFER, { filename: 'watch2.png', contentType: 'image/png' });
  assert.equal(updateRes.status, 200);
  assert.notEqual(updateRes.body.gift.imageUrl, oldImageUrl);
  assert.ok(!fs.existsSync(oldFilePath), 'old file should be deleted after replacing image');

  const newFilePath = path.join(uploadsDir, updateRes.body.gift.imageUrl.replace(/^\/uploads\//, ''));
  assert.ok(fs.existsSync(newFilePath), 'new file should exist');
});

test('deleting a gift removes its image file from disk', async () => {
  const { app, uploadsDir } = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Camera')
    .field('productUrl', 'https://example.com/camera')
    .field('active', 'true')
    .attach('image', PNG_BUFFER, { filename: 'camera.png', contentType: 'image/png' });
  const id = createRes.body.gift.id;
  const filePath = path.join(uploadsDir, createRes.body.gift.imageUrl.replace(/^\/uploads\//, ''));
  assert.ok(fs.existsSync(filePath));

  await request(app).delete(`/api/admin/gifts/${id}`);
  assert.ok(!fs.existsSync(filePath), 'image file should be deleted with gift');
});

function countUploadedFiles(uploadsDir) {
  const dir = path.join(uploadsDir, 'gifts');
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).length;
}

test('uploading an image against a 404 update target does not orphan the file', async () => {
  const { app, uploadsDir } = buildApp();
  const before = countUploadedFiles(uploadsDir);
  const res = await request(app)
    .put('/api/admin/gifts/999')
    .field('name', 'Ghost')
    .field('productUrl', 'https://example.com/ghost')
    .field('active', 'true')
    .attach('image', PNG_BUFFER, { filename: 'ghost.png', contentType: 'image/png' });
  assert.equal(res.status, 404);
  assert.equal(countUploadedFiles(uploadsDir), before, 'no file should remain after 404 on update');
});

test('uploading an image with an invalid body on update does not orphan the file', async () => {
  const { app, uploadsDir } = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Speaker')
    .field('productUrl', 'https://example.com/speaker')
    .field('active', 'true');
  const id = createRes.body.gift.id;
  const before = countUploadedFiles(uploadsDir);

  const res = await request(app)
    .put(`/api/admin/gifts/${id}`)
    .field('name', 'Speaker 2')
    .field('productUrl', 'not-a-url')
    .field('active', 'true')
    .attach('image', PNG_BUFFER, { filename: 'speaker2.png', contentType: 'image/png' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');
  assert.equal(countUploadedFiles(uploadsDir), before, 'no new file should remain after 400 on update');
});

test('uploading an image with an invalid body on create does not orphan the file', async () => {
  const { app, uploadsDir } = buildApp();
  const before = countUploadedFiles(uploadsDir);
  const res = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Broken')
    .field('productUrl', 'not-a-url')
    .field('active', 'true')
    .attach('image', PNG_BUFFER, { filename: 'broken.png', contentType: 'image/png' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');
  assert.equal(countUploadedFiles(uploadsDir), before, 'no file should remain after 400 on create');
});

test('uploaded filename is a server-generated UUID, not derived from original filename', async () => {
  const { app } = buildApp();
  const createRes = await request(app)
    .post('/api/admin/gifts')
    .field('name', 'Weird Name')
    .field('productUrl', 'https://example.com/weird')
    .field('active', 'true')
    .attach('image', PNG_BUFFER, { filename: '../../etc/passwd.png', contentType: 'image/png' });
  assert.equal(createRes.status, 201);
  const uuidRegex = /^\/uploads\/gifts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;
  assert.match(createRes.body.gift.imageUrl, uuidRegex);
});

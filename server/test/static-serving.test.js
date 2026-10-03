import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';

const tmpDirs = [];
function buildAppWithClientDist() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bday-static-'));
  tmpDirs.push(root);
  const clientDistDir = path.join(root, 'dist');
  const assetsDir = path.join(clientDistDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(clientDistDir, 'index.html'), '<!doctype html><html><body>app</body></html>');
  // compression only kicks in above its size threshold (1kb default), and
  // repetitive content compresses predictably for the assertion below.
  fs.writeFileSync(path.join(assetsDir, 'index-abc123.js'), 'console.log("hi");'.repeat(200));

  const db = initDb(':memory:');
  return createApp({ db, uploadsDir: null, sessionSecret: 'test-secret', clientDistDir, isProduction: true });
}

after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test('hashed assets under /assets get a long, immutable Cache-Control header', async () => {
  const app = buildAppWithClientDist();
  const res = await request(app).get('/assets/index-abc123.js');
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
});

test('index.html is not cached long-term', async () => {
  const app = buildAppWithClientDist();
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.notEqual(res.headers['cache-control'], 'public, max-age=31536000, immutable');
});

test('responses are gzip-compressed when the client accepts it', async () => {
  const app = buildAppWithClientDist();
  const res = await request(app).get('/assets/index-abc123.js').set('Accept-Encoding', 'gzip');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-encoding'], 'gzip');
});

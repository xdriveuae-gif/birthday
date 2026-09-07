import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { SqliteSessionStore } from '../src/lib/sqliteSessionStore.js';

function getAsync(store, sid) {
  return new Promise((resolve, reject) => store.get(sid, (err, data) => (err ? reject(err) : resolve(data))));
}
function setAsync(store, sid, data) {
  return new Promise((resolve, reject) => store.set(sid, data, (err) => (err ? reject(err) : resolve())));
}
function destroyAsync(store, sid) {
  return new Promise((resolve, reject) => store.destroy(sid, (err) => (err ? reject(err) : resolve())));
}

test('set then get round-trips session data', async () => {
  const db = initDb(':memory:');
  const store = new SqliteSessionStore(db);
  await setAsync(store, 'sid-1', { cookie: { maxAge: 60000 }, adminId: 1 });
  const data = await getAsync(store, 'sid-1');
  assert.deepEqual(data, { cookie: { maxAge: 60000 }, adminId: 1 });
});

test('get returns null for an unknown sid', async () => {
  const db = initDb(':memory:');
  const store = new SqliteSessionStore(db);
  assert.equal(await getAsync(store, 'does-not-exist'), null);
});

test('get returns null for an expired session', async () => {
  const db = initDb(':memory:');
  const store = new SqliteSessionStore(db);
  await setAsync(store, 'sid-1', { cookie: { maxAge: -1000 } });
  assert.equal(await getAsync(store, 'sid-1'), null);
});

test('destroy removes the session', async () => {
  const db = initDb(':memory:');
  const store = new SqliteSessionStore(db);
  await setAsync(store, 'sid-1', { cookie: { maxAge: 60000 } });
  await destroyAsync(store, 'sid-1');
  assert.equal(await getAsync(store, 'sid-1'), null);
});

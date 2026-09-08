import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

test('hashPassword produces a hash that verifyPassword accepts', () => {
  const hash = hashPassword('correct-horse-battery-staple');
  assert.notEqual(hash, 'correct-horse-battery-staple');
  assert.equal(verifyPassword('correct-horse-battery-staple', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});

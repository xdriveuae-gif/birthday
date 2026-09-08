import { describe, test, expect, beforeEach } from 'vitest';
import { isMuted, setMuted } from './sound.js';

describe('sound mute state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('setMuted persists to localStorage and isMuted reflects it', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(localStorage.getItem('bday-muted')).toBe('true');

    setMuted(false);
    expect(isMuted()).toBe(false);
    expect(localStorage.getItem('bday-muted')).toBe('false');
  });
});

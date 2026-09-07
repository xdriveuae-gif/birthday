import { describe, test, expect, vi, afterEach } from 'vitest';
import { getJson, postJson } from './api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api helpers', () => {
  test('getJson returns parsed body on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hello: 'world' }) })
    );
    const result = await getJson('/api/whatever');
    expect(result).toEqual({ hello: 'world' });
  });

  test('getJson throws ApiError with server-provided code/message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'NO_GIFTS_LEFT', message: 'No gifts left.' } }),
      })
    );
    await expect(getJson('/api/spin')).rejects.toMatchObject({
      status: 409,
      code: 'NO_GIFTS_LEFT',
      message: 'No gifts left.',
    });
  });

  test('postJson sends a JSON body with same-origin credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    await postJson('/api/spin', { name: 'Ahmad' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/spin',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ name: 'Ahmad' }),
      })
    );
  });
});

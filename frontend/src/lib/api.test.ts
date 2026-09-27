import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

const user = { id: '1', username: 'admin' };

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
  vi.stubGlobal('sessionStorage', createStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API cookie authentication', () => {
  it('sends cookies without adding a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: user }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/auth/session')).resolves.toEqual(user);

    const [, request] = fetchMock.mock.calls[0];
    expect(request.credentials).toBe('include');
    expect(request.headers).not.toHaveProperty('Authorization');
  });

  it('refreshes with the HttpOnly cookie and retries without a token payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { user, authMode: 'cookie' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: user }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/auth/session')).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [refreshUrl, refreshRequest] = fetchMock.mock.calls[1];
    expect(refreshUrl).toContain('/auth/refresh');
    expect(refreshRequest).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(refreshRequest.body).toBeUndefined();
    expect(refreshRequest.headers).not.toHaveProperty('Authorization');
    expect(fetchMock.mock.calls[2][1].headers).not.toHaveProperty('Authorization');
  });
});

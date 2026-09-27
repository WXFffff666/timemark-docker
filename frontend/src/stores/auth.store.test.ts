import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: {
    get: getMock,
    post: postMock,
  },
}));

import { useAuthStore } from './auth.store.js';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => values.set(key, String(value))),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: () => values.clear(),
  };
}

const user = { id: '1', username: 'admin', createdAt: '2026-01-01T00:00:00.000Z' };
let localStorageMock: ReturnType<typeof createStorage>;
let sessionStorageMock: ReturnType<typeof createStorage>;

beforeEach(() => {
  localStorageMock = createStorage();
  sessionStorageMock = createStorage();
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('sessionStorage', sessionStorageMock);
  postMock.mockReset();
  getMock.mockReset();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cookie-backed authentication store', () => {
  it('accepts a cookie login response without persisting tokens', async () => {
    postMock.mockResolvedValue({ user, sessionId: 'session-id', authMode: 'cookie' });

    await useAuthStore.getState().login('admin', 'unit-test-only-password', true);

    expect(useAuthStore.getState()).toMatchObject({ user, isAuthenticated: true, isLoading: false });
    expect(localStorageMock.getItem('accessToken')).toBeNull();
    expect(localStorageMock.getItem('refreshToken')).toBeNull();
    expect(sessionStorageMock.getItem('accessToken')).toBeNull();
    expect(sessionStorageMock.getItem('refreshToken')).toBeNull();
  });

  it('checks the session through the cookie without requiring a stored token', async () => {
    getMock.mockResolvedValue(user);

    await useAuthStore.getState().checkAuth();

    expect(getMock).toHaveBeenCalledWith('/auth/session');
    expect(useAuthStore.getState()).toMatchObject({ user, isAuthenticated: true, isLoading: false });
  });
});

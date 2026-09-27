import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getUserById: vi.fn(),
  getSessionByToken: vi.fn(),
  getAccessTokenFromCookie: vi.fn(),
}));

vi.mock('../utils/jwt.js', () => ({ verifyToken: mocks.verifyToken }));
vi.mock('../services/auth.service.js', () => ({ getUserById: mocks.getUserById }));
vi.mock('../services/session.service.js', () => ({ getSessionByToken: mocks.getSessionByToken }));
vi.mock('../utils/auth-cookies.js', () => ({ getAccessTokenFromCookie: mocks.getAccessTokenFromCookie }));

import { authMiddleware } from '../middleware/auth.middleware.js';

const app = new Hono();
app.get('/protected', authMiddleware as any, (c) => c.text('ok'));

beforeEach(() => {
  mocks.verifyToken.mockReset().mockResolvedValue({
    userId: '7',
    sessionToken: 'session-token',
    tokenUse: 'refresh',
    refreshTokenId: 'refresh-token-id',
  });
  mocks.getUserById.mockReset().mockResolvedValue({ id: '7', username: 'admin' });
  mocks.getSessionByToken.mockReset().mockResolvedValue({ id: 1 });
  mocks.getAccessTokenFromCookie.mockReset().mockReturnValue(undefined);
});

describe('authMiddleware token use', () => {
  it('does not accept refresh tokens for protected API routes', async () => {
    const response = await app.request('/protected', {
      headers: { Authorization: 'Bearer unit-test-refresh-token' },
    });

    expect(response.status).toBe(401);
    expect(mocks.getSessionByToken).not.toHaveBeenCalled();
    expect(mocks.getUserById).not.toHaveBeenCalled();
  });
});

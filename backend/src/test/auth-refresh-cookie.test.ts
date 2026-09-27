import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
  getSessionByToken: vi.fn(),
  rotateSessionRefreshToken: vi.fn(),
  verifyToken: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  setAccessCookie: vi.fn(),
  setRefreshCookie: vi.fn(),
  getRefreshTokenFromCookie: vi.fn(() => 'unit-test-refresh-token'),
  passthrough: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock('../services/auth.service.js', () => ({
  getUserById: mocks.getUserById,
  verifyUserForLogin: vi.fn(),
  getUserByUsername: vi.fn(),
  createLoginLog: vi.fn(),
  trackLoginFailure: vi.fn(),
  getAccountLockStatus: vi.fn(),
  clearAccountLock: vi.fn(),
  getIpBlockStatus: vi.fn(),
  evaluateIpBlock: vi.fn(),
  checkIpWhitelistFromUser: vi.fn(),
  verifyTotpCode: vi.fn(),
  verifyUserPassword: vi.fn(),
}));
vi.mock('../utils/client-ip.js', () => ({ getClientIp: vi.fn(), getClientIpInfo: vi.fn() }));
vi.mock('../utils/turnstile.js', () => ({
  getTurnstileSiteKey: vi.fn(),
  isTurnstileEnabled: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));
vi.mock('../utils/url-safety.js', () => ({ isSafePublicUrl: vi.fn() }));
vi.mock('../utils/geoip.js', () => ({ lookupGeoLabel: vi.fn() }));
vi.mock('../services/security-event.service.js', () => ({ logSecurityEvent: vi.fn() }));
vi.mock('../services/session.service.js', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteAllUserSessions: vi.fn(),
  getSessionByToken: mocks.getSessionByToken,
  rotateSessionRefreshToken: mocks.rotateSessionRefreshToken,
}));
vi.mock('../utils/jwt.js', () => ({
  generateAccessToken: mocks.generateAccessToken,
  generateRefreshToken: mocks.generateRefreshToken,
  verifyToken: mocks.verifyToken,
}));
vi.mock('../middleware/auth.middleware.js', () => ({ authMiddleware: mocks.passthrough }));
vi.mock('../services/alert.service.js', () => ({ sendSecurityAlert: vi.fn() }));
vi.mock('../services/lunar-holidays.js', () => ({ ensureLunarHolidayEvents: vi.fn() }));
vi.mock('../utils/password.js', () => ({ hashPassword: vi.fn() }));
vi.mock('../db/index.js', () => ({ query: vi.fn() }));
vi.mock('../utils/auth-cookies.js', () => ({
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  getRefreshTokenFromCookie: mocks.getRefreshTokenFromCookie,
  getAccessTokenFromCookie: vi.fn(),
  setAccessCookie: mocks.setAccessCookie,
  setRefreshCookie: mocks.setRefreshCookie,
}));
vi.mock('../middleware/rate-limit.js', () => ({
  loginRateLimit: mocks.passthrough,
  authMutationRateLimit: mocks.passthrough,
}));

import auth from '../routes/auth.js';

const user = { id: '7', username: 'admin', avatarUrl: null, createdAt: '2026-01-01T00:00:00.000Z' };

beforeEach(() => {
  mocks.getUserById.mockReset().mockResolvedValue(user);
  mocks.getSessionByToken.mockReset().mockResolvedValue({
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  });
  mocks.rotateSessionRefreshToken.mockReset().mockResolvedValue(true);
  mocks.verifyToken.mockReset().mockResolvedValue({
    userId: user.id,
    sessionToken: 'session-token',
    tokenUse: 'refresh',
    refreshTokenId: 'current-refresh-token-id',
  });
  mocks.generateAccessToken.mockReset().mockResolvedValue('unit-test-access-token');
  mocks.generateRefreshToken.mockReset().mockResolvedValue('unit-test-refresh-token-rotated');
  mocks.setAccessCookie.mockReset();
  mocks.setRefreshCookie.mockReset();
  mocks.getRefreshTokenFromCookie.mockReset().mockReturnValue('unit-test-refresh-token');
});

describe('POST /refresh cookie contract', () => {
  it('rejects an access token presented as a refresh token', async () => {
    mocks.verifyToken.mockResolvedValue({
      userId: user.id,
      sessionToken: 'session-token',
      tokenUse: 'access',
    });

    const response = await auth.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'unit-test-access-token' }),
    });

    expect(response.status).toBe(401);
    expect(mocks.getSessionByToken).not.toHaveBeenCalled();
    expect(mocks.setAccessCookie).not.toHaveBeenCalled();
    expect(mocks.setRefreshCookie).not.toHaveBeenCalled();
  });

  it('rejects a refresh token that has already been rotated', async () => {
    mocks.rotateSessionRefreshToken.mockResolvedValue(false);

    const response = await auth.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'unit-test-refresh-token' }),
    });

    expect(response.status).toBe(401);
    expect(mocks.rotateSessionRefreshToken).toHaveBeenCalledWith(
      'session-token',
      'current-refresh-token-id',
      expect.any(String),
    );
    expect(mocks.setAccessCookie).not.toHaveBeenCalled();
    expect(mocks.setRefreshCookie).not.toHaveBeenCalled();
  });

  it('sets rotated HttpOnly cookies without returning access tokens in JSON', async () => {
    const response = await auth.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(mocks.setAccessCookie).toHaveBeenCalled();
    expect(mocks.setRefreshCookie).toHaveBeenCalled();
    const payload = await response.json() as {
      data: { user: typeof user; authMode: string; accessToken?: string };
    };
    expect(payload.data).toEqual({ user, authMode: 'cookie' });
    expect(payload.data).not.toHaveProperty('accessToken');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, generateAccessTokenMock, generateRefreshTokenMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  generateAccessTokenMock: vi.fn(),
  generateRefreshTokenMock: vi.fn(),
}));
vi.mock('../db/index.js', () => ({ query: queryMock }));
vi.mock('../utils/jwt.js', () => ({
  generateAccessToken: generateAccessTokenMock,
  generateRefreshToken: generateRefreshTokenMock,
}));

import * as sessionService from '../services/session.service.js';

describe('refresh token state', () => {
  beforeEach(() => {
    queryMock.mockReset();
    generateAccessTokenMock.mockReset().mockResolvedValue('access-token');
    generateRefreshTokenMock.mockReset().mockResolvedValue('refresh-token');
  });

  it('persists the active refresh token id when creating a session', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });
    await sessionService.createSession('7', 'fingerprint', false, false);

    const [sql, params] = queryMock.mock.calls[0];
    expect(String(sql)).toContain('refresh_token_id');
    expect(params[5]).toEqual(expect.any(String));
    expect(generateRefreshTokenMock).toHaveBeenCalledWith('7', params[1], params[5]);
  });

  it('uses a compare-and-swap update for the active session token id', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const rotate = (sessionService as Record<string, unknown>).rotateSessionRefreshToken as
      | ((sessionToken: string, currentId: string, nextId: string) => Promise<boolean>)
      | undefined;

    expect(rotate).toBeTypeOf('function');
    if (!rotate) return;

    expect(await rotate('session-token', 'current-id', 'next-id')).toBe(true);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE sessions SET refresh_token_id = \$1\s+WHERE token = \$2 AND refresh_token_id = \$3 AND julianday\(expires_at\) > julianday\('now'\)/),
      ['next-id', 'session-token', 'current-id'],
    );
  });

  it('rejects a refresh token id that has already been rotated', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    const rotate = (sessionService as Record<string, unknown>).rotateSessionRefreshToken as
      | ((sessionToken: string, currentId: string, nextId: string) => Promise<boolean>)
      | undefined;

    expect(rotate).toBeTypeOf('function');
    if (!rotate) return;

    expect(await rotate('session-token', 'stale-id', 'next-id')).toBe(false);
  });
});

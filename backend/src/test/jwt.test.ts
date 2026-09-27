import { describe, expect, it } from 'vitest';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt.js';

describe('JWT token use', () => {
  it('distinguishes access tokens from refresh tokens', async () => {
    const access = await generateAccessToken('7', 'session-token');
    const refreshTokenId = 'unit-refresh-token-id';
    const refresh = await generateRefreshToken('7', 'session-token', refreshTokenId);

    expect(await verifyToken(access)).toMatchObject({
      userId: '7',
      sessionToken: 'session-token',
      tokenUse: 'access',
    });
    expect(await verifyToken(refresh)).toMatchObject({
      userId: '7',
      sessionToken: 'session-token',
      tokenUse: 'refresh',
      refreshTokenId,
    });
  });
});

import { query } from '../db/index.js';
import { randomUUID } from 'crypto';
import type { Session } from '@timemark/shared';

export async function createSession(userId: string, deviceFingerprint: string, isTrusted: boolean, rememberMe: boolean = false): Promise<{ session: Session; accessToken: string; refreshToken: string }> {
  const { generateAccessToken, generateRefreshToken } = await import('../utils/jwt.js');
  
  const token = randomUUID();
  const expiresIn = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + expiresIn).toISOString();

  // Convert userId string to integer for database
  const numericUserId = parseInt(userId, 10);
  if (isNaN(numericUserId)) {
    throw new Error('Invalid user ID');
  }

  const result = await query(
    'INSERT INTO sessions (user_id, token, device_fingerprint, is_trusted, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [numericUserId, token, deviceFingerprint, isTrusted ? 1 : 0, expiresAt]
  );

  const id = result.rows[0].id;
  const accessToken = await generateAccessToken(userId, token, rememberMe);
  const refreshToken = await generateRefreshToken(userId, token);

  return {
    session: { id, userId, token, deviceFingerprint, isTrusted, expiresAt },
    accessToken,
    refreshToken,
  };
}

export async function getSessionByToken(token: string): Promise<Session | null> {
  const result = await query(
    "SELECT * FROM sessions WHERE token = $1 AND expires_at > datetime('now')", 
    [token]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return { id: row.id, userId: row.user_id, token: row.token, deviceFingerprint: row.device_fingerprint, isTrusted: row.is_trusted, expiresAt: row.expires_at };
}

export async function deleteSession(token: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function deleteAllUserSessions(userId: string, exceptToken?: string): Promise<void> {
  const numericUserId = parseInt(userId, 10);
  if (isNaN(numericUserId)) return;
  if (exceptToken) {
    await query('DELETE FROM sessions WHERE user_id = $1 AND token != $2', [numericUserId, exceptToken]);
    return;
  }
  await query('DELETE FROM sessions WHERE user_id = $1', [numericUserId]);
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

export async function markDeviceAsTrusted(sessionId: string): Promise<void> {
  await query('UPDATE sessions SET is_trusted = 1 WHERE id = $1', [sessionId]);
}

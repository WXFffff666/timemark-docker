import { query } from '../db/index.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { randomUUID } from 'crypto';
import type { User } from '@timemark/shared';

export async function createUser(username: string, password: string): Promise<User> {
  const existing = await query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) throw new Error('Username already exists');

  const id = randomUUID();
  const passwordHash = await hashPassword(password);

  await query('INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)', [id, username, passwordHash]);

  return { id, username, totpSecret: null, createdAt: new Date().toISOString() };
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const result = await query('SELECT id, username, totp_secret, created_at FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return { id: row.id, username: row.username, totpSecret: row.totp_secret, createdAt: row.created_at };
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await query('SELECT id, username, totp_secret, created_at FROM users WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return { id: row.id, username: row.username, totpSecret: row.totp_secret, createdAt: row.created_at };
}

export async function verifyUserPassword(username: string, password: string): Promise<User | null> {
  const result = await query('SELECT id, username, password_hash, totp_secret, created_at FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return null;

  return { id: row.id, username: row.username, totpSecret: row.totp_secret, createdAt: row.created_at };
}

export async function updateTOTPSecret(userId: string, secret: string): Promise<void> {
  await query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret, userId]);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) throw new Error('User not found');
  const valid = await verifyPassword(currentPassword, result.rows[0].password_hash);
  if (!valid) throw new Error('Current password is incorrect');

  const newHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
}

export async function createLoginLog(userIdOrUsername: string, ip: string, userAgent: string, fingerprint: string, success: boolean): Promise<void> {
  try {
    const id = randomUUID();
    const userId = success ? userIdOrUsername : null;

    await query(
      'INSERT INTO login_logs (id, user_id, ip, device_fingerprint, success, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())',
      [id, userId, ip, `${userAgent} | ${fingerprint}`, success]
    );
  } catch (error) {
    console.error('[createLoginLog] Failed to log login attempt:', error);
  }
}

export async function trackLoginFailure(params: { username: string; ip: string }): Promise<{ shouldLock: boolean; failureCount: number }> {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);

  const result = await query(
    `SELECT COUNT(*) as count FROM login_logs
     WHERE ip = $1
     AND success = FALSE
     AND timestamp > $2`,
    [params.ip, windowStart]
  );

  const count = result.rows.length > 0 ? parseInt(result.rows[0].count) : 0;
  return {
    shouldLock: count >= 10,
    failureCount: count,
  };
}

export async function getLoginHistory(userId: string): Promise<any[]> {
  const result = await query(
    `SELECT id,
            timestamp as login_time,
            ip as ip_address,
            device_fingerprint as user_agent,
            CASE WHEN success THEN 'success' ELSE 'failed' END as status
     FROM login_logs
     WHERE user_id = $1
     ORDER BY timestamp DESC
     LIMIT 100`,
    [userId]
  );

  return result.rows;
}

export async function changeUsername(userId: string, newUsername: string): Promise<void> {
  const existing = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [newUsername, userId]);
  if (existing.rows.length > 0) {
    throw new Error('Username already exists');
  }
  await query('UPDATE users SET username = $1 WHERE id = $2', [newUsername, userId]);
}

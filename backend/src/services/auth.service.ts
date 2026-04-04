import { query } from '../db/index.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import type { User } from '@timemark/shared';

export async function createUser(username: string, password: string): Promise<User> {
  const existing = await query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) throw new Error('Username already exists');

  const passwordHash = await hashPassword(password);
  const result = await query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, created_at',
    [username, passwordHash]
  );

  return { id: String(result.rows[0].id), username, totpSecret: null, createdAt: result.rows[0].created_at };
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const result = await query('SELECT id, username, totp_secret, created_at FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return { id: String(row.id), username: row.username, totpSecret: row.totp_secret, createdAt: row.created_at };
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await query('SELECT id, username, totp_secret, created_at FROM users WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return { id: String(row.id), username: row.username, totpSecret: row.totp_secret, createdAt: row.created_at };
}

export async function verifyUserPassword(username: string, password: string): Promise<User | null> {
  const result = await query('SELECT id, username, password_hash, totp_secret, created_at FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return null;

  return { id: String(row.id), username: row.username, totpSecret: row.totp_secret, createdAt: row.created_at };
}

export async function updateTOTPSecret(userId: string, secret: string): Promise<void> {
  await query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret, userId]);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) return false;

  const valid = await verifyPassword(currentPassword, result.rows[0].password_hash);
  if (!valid) return false;

  const newHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
  return true;
}

export async function updateUsername(userId: string, username: string): Promise<boolean> {
  const existing = await query('SELECT id FROM users WHERE username = $1 AND id <> $2', [username, userId]);
  if (existing.rows.length > 0) return false;

  const updated = await query('UPDATE users SET username = $1 WHERE id = $2', [username, userId]);
  return (updated.rowCount ?? 0) > 0;
}

export async function getLoginHistory(userId: string) {
  const result = await query(
    `SELECT id, login_time, ip_address, user_agent, success
       FROM login_logs
      WHERE user_id = $1
      ORDER BY login_time DESC
      LIMIT 100`,
    [userId]
  );

  return result.rows.map((row: any) => ({
    id: String(row.id),
    login_time: row.login_time,
    ip_address: row.ip_address || 'unknown',
    user_agent: row.user_agent || 'unknown',
    status: row.success ? 'success' : 'failed',
  }));
}

export async function createLoginLog(userIdOrUsername: string, ip: string, userAgent: string, fingerprint: string, success: boolean, reason?: string): Promise<void> {
  try {
    const userId = success ? userIdOrUsername : null;
    const username = success ? null : userIdOrUsername;

    await query(
      'INSERT INTO login_logs (user_id, username, ip_address, user_agent, device_fingerprint, success, failure_reason) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [userId, username, ip, userAgent, fingerprint, success, reason || null]
    );
  } catch (error) {
    console.error('[createLoginLog] Failed to log login attempt:', error);
  }
}

export async function trackLoginFailure(params: { username: string; ip: string }): Promise<{ shouldLock: boolean; failureCount: number }> {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);

  const result = await query(
    `SELECT COUNT(*) as count FROM login_logs
     WHERE (username = $1 OR ip_address = $2)
     AND success = FALSE
     AND login_time > $3`,
    [params.username, params.ip, windowStart]
  );

  const count = result.rows.length > 0 ? parseInt(result.rows[0].count) : 0;
  return {
    shouldLock: count >= 10,
    failureCount: count,
  };
}

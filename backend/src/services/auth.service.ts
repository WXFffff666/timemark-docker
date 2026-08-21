import { query } from '../db/index.js';
import { verifyPassword } from '../utils/password.js';
import { randomUUID } from 'crypto';
import { authenticator } from 'otplib';
import type { User } from '@timemark/shared';

export type LoginUser = User & {
  totpSecret?: string | null;
  totpEnabled?: boolean;
  ipWhitelist?: string[];
  ipWhitelistEnabled?: boolean;
  passwordChangedAt?: string | null;
};

export async function getUserByUsername(username: string): Promise<User | null> {
  const result = await query('SELECT id, username, avatar_url, created_at FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return { id: row.id.toString(), username: row.username, avatarUrl: row.avatar_url, createdAt: row.created_at };
}

export async function getUserById(id: string): Promise<User | null> {
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) return null;
  const result = await query('SELECT id, username, avatar_url, created_at FROM users WHERE id = $1', [numericId]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return { id: row.id.toString(), username: row.username, avatarUrl: row.avatar_url, createdAt: row.created_at };
}

export async function verifyUserPassword(username: string, password: string): Promise<User | null> {
  const login = await verifyUserForLogin(username, password);
  return login;
}

/** 单次查询：密码 + TOTP + IP 白名单 + 密码修改时间 */
export async function verifyUserForLogin(username: string, password: string): Promise<LoginUser | null> {
  const result = await query(
    `SELECT u.id, u.username, u.password_hash, u.avatar_url, u.created_at,
            u.totp_secret, u.totp_enabled,
            c.ip_whitelist, c.ip_whitelist_enabled, c.password_changed_at
     FROM users u
     LEFT JOIN user_configs c ON c.user_id = u.id
     WHERE u.username = $1`,
    [username],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as {
    id: number;
    username: string;
    password_hash: string;
    avatar_url?: string;
    created_at: string;
    totp_secret?: string;
    totp_enabled?: boolean;
    ip_whitelist?: string[];
    ip_whitelist_enabled?: boolean;
    password_changed_at?: string | null;
  };
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return null;
  return {
    id: row.id.toString(),
    username: row.username,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    totpSecret: row.totp_secret ?? null,
    totpEnabled: !!row.totp_enabled,
    ipWhitelist: Array.isArray(row.ip_whitelist) ? row.ip_whitelist : [],
    ipWhitelistEnabled: !!row.ip_whitelist_enabled,
    passwordChangedAt: row.password_changed_at ?? null,
  };
}

// ============ 登录日志 ============

export async function createLoginLog(
  userIdOrUsername: string,
  ip: string,
  userAgent: string,
  fingerprint: string,
  success: boolean,
  reason?: string,
  knownUser?: { userId: number; username: string },
): Promise<void> {
  try {
    const id = randomUUID();
    let userId: number | null = null;
    let username: string | null = null;

    if (success) {
      if (knownUser) {
        userId = knownUser.userId;
        username = knownUser.username;
      } else {
        const numericId = parseInt(userIdOrUsername, 10);
        if (!isNaN(numericId)) {
          const userResult = await query('SELECT id, username FROM users WHERE id = $1', [numericId]);
          if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
            username = userResult.rows[0].username;
          }
        }
      }
    } else {
      username = userIdOrUsername;
    }

    await query(
      `INSERT INTO login_logs (id, user_id, username, ip_address, user_agent, device_fingerprint, success, failure_reason, login_time) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [id, userId, username, ip, userAgent, fingerprint, success ? true : false, reason || null],
    );
  } catch (error) {
    console.error('[createLoginLog] Failed:', error);
  }
}

// ============ 锁定机制 ============
// 公网部署：无运维解锁后门
// 5 次密码错误触发锁定，时间线性叠加：5 / 10 / 15 … 分钟
// 锁定期间拒绝一切登录尝试，不验证密码、不累计失败次数

const LOCK_THRESHOLD = 5;
const LOCK_BASE_MINUTES = 5;

export type AccountLockStatus = {
  isLocked: boolean;
  failureCount: number;
  lockTriggerCount: number;
  remainingSeconds: number;
  lockMinutes: number;
};

async function countPasswordFailuresSinceLastSuccess(username: string): Promise<number> {
  const lastSuccessResult = await query(
    `SELECT MAX(login_time) AS last_success FROM login_logs
     WHERE success = TRUE
       AND (
         user_id = (SELECT id FROM users WHERE username = $1 LIMIT 1)
         OR username = $1
       )`,
    [username],
  );
  const lastSuccess = lastSuccessResult.rows[0]?.last_success || '1970-01-01';

  const failResult = await query(
    `SELECT COUNT(*) AS count FROM login_logs
     WHERE username = $1
       AND success = FALSE
       AND COALESCE(failure_reason, '') NOT IN ('locked_attempt', 'rate_limited', 'turnstile_failed', 'totp_invalid')
       AND login_time > $2`,
    [username, lastSuccess],
  );
  return failResult.rows.length > 0 ? parseInt(failResult.rows[0].count, 10) : 0;
}

function parseLockedUntil(lockedUntil: string | Date | null): number | null {
  if (!lockedUntil) return null;
  const raw = typeof lockedUntil === 'string' ? lockedUntil : lockedUntil.toISOString();
  const ms = raw.includes('T') || raw.endsWith('Z')
    ? new Date(raw).getTime()
    : new Date(raw + 'Z').getTime();
  return Number.isNaN(ms) ? null : ms;
}

export async function getAccountLockStatus(params: { username: string; ip: string }): Promise<AccountLockStatus> {
  const attemptResult = await query(
    `SELECT failed_count, locked_until FROM login_attempts
     WHERE identifier = $1 AND type = 'username'`,
    [params.username],
  );

  if (attemptResult.rows.length > 0) {
    const row = attemptResult.rows[0];
    const untilMs = parseLockedUntil(row.locked_until);
    if (untilMs && untilMs > Date.now()) {
      const remainingSeconds = Math.max(0, Math.floor((untilMs - Date.now()) / 1000));
      const failureCount = row.failed_count ?? 0;
      const lockTriggerCount = Math.max(1, Math.floor(failureCount / LOCK_THRESHOLD));
      return {
        isLocked: true,
        failureCount,
        lockTriggerCount,
        remainingSeconds,
        lockMinutes: Math.max(1, Math.ceil(remainingSeconds / 60)),
      };
    }
    const failedCount = row.failed_count ?? 0;
    if (failedCount === 0) {
      return {
        isLocked: false,
        failureCount: 0,
        lockTriggerCount: 0,
        remainingSeconds: 0,
        lockMinutes: 0,
      };
    }
  } else {
    return {
      isLocked: false,
      failureCount: 0,
      lockTriggerCount: 0,
      remainingSeconds: 0,
      lockMinutes: 0,
    };
  }

  const failureCount = await countPasswordFailuresSinceLastSuccess(params.username);
  const lockTriggerCount = Math.floor(failureCount / LOCK_THRESHOLD);

  return {
    isLocked: false,
    failureCount,
    lockTriggerCount,
    remainingSeconds: 0,
    lockMinutes: 0,
  };
}

export async function trackLoginFailure(params: { username: string; ip: string }): Promise<{
  shouldLock: boolean;
  failureCount: number;
  lockTriggerCount: number;
  lockMinutes: number;
}> {
  const failureCount = await countPasswordFailuresSinceLastSuccess(params.username);
  const lockTriggerCount = Math.floor(failureCount / LOCK_THRESHOLD);
  const shouldLock = failureCount > 0 && failureCount % LOCK_THRESHOLD === 0;
  const lockMinutes = shouldLock ? lockTriggerCount * LOCK_BASE_MINUTES : 0;
  const lockedUntil = shouldLock
    ? new Date(Date.now() + lockMinutes * 60 * 1000).toISOString()
    : null;

  await query(
    `INSERT INTO login_attempts (identifier, type, failed_count, locked_until, last_attempt)
     VALUES ($1, 'username', $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (identifier, type) DO UPDATE SET
       failed_count = $2,
       locked_until = $3,
       last_attempt = CURRENT_TIMESTAMP`,
    [params.username, failureCount, lockedUntil],
  );

  return { shouldLock, failureCount, lockTriggerCount, lockMinutes };
}

export async function clearAccountLock(username: string): Promise<void> {
  await query(`DELETE FROM login_attempts WHERE identifier = $1 AND type = 'username'`, [username]);
}

// ============ IP 封禁（公网暴力破解防护，基于 PostgreSQL） ============

const IP_BAN_THRESHOLD = 25;
const IP_BAN_MINUTES = 60;

function parseLockedUntilMs(lockedUntil: string | Date | null): number | null {
  if (!lockedUntil) return null;
  const raw = typeof lockedUntil === 'string' ? lockedUntil : lockedUntil.toISOString();
  const ms = raw.includes('T') || raw.endsWith('Z')
    ? new Date(raw).getTime()
    : new Date(`${raw}Z`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export async function getIpBlockStatus(ip: string): Promise<{ isBlocked: boolean; remainingSeconds: number }> {
  const result = await query(
    `SELECT locked_until FROM login_attempts WHERE identifier = $1 AND type = 'ip'`,
    [ip],
  );
  const untilMs = parseLockedUntilMs(result.rows[0]?.locked_until ?? null);
  if (!untilMs || untilMs <= Date.now()) {
    return { isBlocked: false, remainingSeconds: 0 };
  }
  return {
    isBlocked: true,
    remainingSeconds: Math.max(0, Math.floor((untilMs - Date.now()) / 1000)),
  };
}

/** 统计该 IP 近 1 小时失败次数，超阈值则封禁 */
export async function evaluateIpBlock(ip: string): Promise<void> {
  if (!ip || ip === '127.0.0.1') return;

  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM login_logs
     WHERE ip_address = $1 AND success = FALSE
       AND COALESCE(failure_reason, '') NOT IN ('turnstile_failed', 'locked_attempt', 'totp_invalid')
       AND login_time > NOW() - INTERVAL '1 hour'`,
    [ip],
  );
  const count = countResult.rows[0]?.count ?? 0;
  if (count < IP_BAN_THRESHOLD) return;

  const lockedUntil = new Date(Date.now() + IP_BAN_MINUTES * 60 * 1000).toISOString();
  await query(
    `INSERT INTO login_attempts (identifier, type, failed_count, locked_until, last_attempt)
     VALUES ($1, 'ip', $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (identifier, type) DO UPDATE SET
       failed_count = $2,
       locked_until = $3,
       last_attempt = CURRENT_TIMESTAMP`,
    [ip, count, lockedUntil],
  );
}

// ============ IP 白名单 ============

export function checkIpWhitelistFromUser(
  user: Pick<LoginUser, 'ipWhitelist' | 'ipWhitelistEnabled'>,
  ip: string,
): { allowed: boolean; reason?: string } {
  if (!user.ipWhitelistEnabled) return { allowed: true };
  const list = user.ipWhitelist ?? [];
  if (!list.length) return { allowed: true };
  if (list.includes(ip)) return { allowed: true };
  return { allowed: false, reason: `IP ${ip} 未在白名单中` };
}

export async function checkIpWhitelist(
  userId: string,
  ip: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const numericId = parseInt(userId, 10);
  if (isNaN(numericId)) return { allowed: true };

  const result = await query(
    'SELECT ip_whitelist, ip_whitelist_enabled FROM user_configs WHERE user_id = $1',
    [numericId],
  );
  const row = result.rows[0] as { ip_whitelist?: string[]; ip_whitelist_enabled?: boolean } | undefined;
  if (!row?.ip_whitelist_enabled) return { allowed: true };

  const list = Array.isArray(row.ip_whitelist) ? row.ip_whitelist : [];
  if (!list.length) return { allowed: true };
  if (list.includes(ip)) return { allowed: true };

  return { allowed: false, reason: `IP ${ip} 未在白名单中` };
}

// ============ TOTP ============

export function verifyTotpCode(secret: string, code: string): boolean {
  if (!secret || !code) return false;
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}

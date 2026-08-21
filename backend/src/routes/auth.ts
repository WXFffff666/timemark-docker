import { Hono } from 'hono';
import { verifyUserForLogin, getUserByUsername, createLoginLog, trackLoginFailure, getAccountLockStatus, clearAccountLock, getIpBlockStatus, evaluateIpBlock, checkIpWhitelistFromUser, verifyTotpCode } from '../services/auth.service.js';
import { getClientIp, getClientIpInfo } from '../utils/client-ip.js';
import { getTurnstileSiteKey, isTurnstileEnabled, verifyTurnstileToken } from '../utils/turnstile.js';
import { isSafePublicUrl } from '../utils/url-safety.js';
import { lookupGeoLabel } from '../utils/geoip.js';
import { logSecurityEvent } from '../services/security-event.service.js';
import { createSession, deleteSession, deleteAllUserSessions, getSessionByToken } from '../services/session.service.js';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt.js';
import { loginSchema, changePasswordSchema } from '@timemark/shared';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { sendSecurityAlert } from '../services/alert.service.js';
import { ensureLunarHolidayEvents } from '../services/lunar-holidays.js';
import { hashPassword } from '../utils/password.js';
import { query } from '../db/index.js';
import { setAuthCookies, clearAuthCookies, getRefreshTokenFromCookie, getAccessTokenFromCookie, setAccessCookie, setRefreshCookie } from '../utils/auth-cookies.js';
import { loginRateLimit, authMutationRateLimit } from '../middleware/rate-limit.js';

const auth = new Hono();

auth.post('/login', loginRateLimit, async (c) => {
  try {
    const { ip, trusted } = getClientIpInfo(c);
    const userAgent = c.req.header('user-agent') || 'unknown';

    const body = await c.req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        success: false,
        error: '请求参数无效',
        code: 'validation_failed',
        details: parsed.error.flatten(),
      }, 400);
    }

    const { username, password, deviceFingerprint, rememberMe = false, turnstileToken, totpCode } = parsed.data;

    const [turnstile, ipBlock, lockStatus] = await Promise.all([
      verifyTurnstileToken(turnstileToken, trusted ? ip : undefined),
      getIpBlockStatus(ip),
      getAccountLockStatus({ username, ip }),
    ]);

    if (!turnstile.ok) {
      void createLoginLog(username, ip, userAgent, deviceFingerprint || '', false, 'turnstile_failed');
      return c.json({
        success: false,
        error: turnstile.error || '人机验证失败',
        code: turnstile.code || 'turnstile_failed',
      }, 400);
    }

    if (ipBlock.isBlocked) {
      void createLoginLog(username, ip, userAgent, deviceFingerprint || '', false, 'locked_attempt');
      return c.json({
        success: false,
        error: `该 IP 已被临时封禁，剩余 ${ipBlock.remainingSeconds} 秒`,
        code: 'ip_blocked',
        locked: true,
        remainingSeconds: ipBlock.remainingSeconds,
      }, 429);
    }

    if (lockStatus.isLocked) {
      void createLoginLog(username, ip, userAgent, deviceFingerprint || '', false, 'locked_attempt');
      return c.json({
        success: false,
        error: `账户已锁定，剩余 ${lockStatus.remainingSeconds} 秒后可重试`,
        code: 'account_locked',
        locked: true,
        remainingSeconds: lockStatus.remainingSeconds,
        lockMinutes: lockStatus.lockMinutes,
      }, 429);
    }

    const user = await verifyUserForLogin(username, password);

    if (!user) {
      await createLoginLog(username, ip, userAgent, deviceFingerprint || '', false, '凭据无效');
      await evaluateIpBlock(ip);
      await logSecurityEvent({ username, eventType: 'login_failure', ip, userAgent });

      const tracking = await trackLoginFailure({ username, ip });

      if (tracking.shouldLock) {
        const targetUser = await getUserByUsername(username);
        const userId = targetUser ? parseInt(targetUser.id, 10) : undefined;

        await sendSecurityAlert({
          userId,
          adminEmails: [],
          username,
          ip,
          userAgent,
          failureCount: tracking.failureCount,
          locked: true,
          lockMinutes: tracking.lockMinutes,
          alertType: 'login_failure',
        });

        const newLockStatus = await getAccountLockStatus({ username, ip });
        return c.json({
          success: false,
          error: `登录失败次数过多，账户已锁定 ${tracking.lockMinutes} 分钟（剩余 ${newLockStatus.remainingSeconds} 秒）`,
          code: 'account_locked',
          locked: true,
          remainingSeconds: newLockStatus.remainingSeconds,
          lockMinutes: tracking.lockMinutes,
        }, 429);
      }

      const remaining = 5 - (tracking.failureCount % 5);
      return c.json({
        success: false,
        error: `登录失败，还剩 ${remaining} 次尝试机会`,
        code: 'invalid_credentials',
      }, 401);
    }

    const whitelist = checkIpWhitelistFromUser(user, ip);
    if (!whitelist.allowed) {
      return c.json({ success: false, error: whitelist.reason || '当前 IP 不在白名单' }, 403);
    }

    if (user.totpEnabled && user.totpSecret) {
      const totpOk = verifyTotpCode(user.totpSecret, totpCode || '');
      if (!totpOk) {
        void createLoginLog(user.id, ip, userAgent, deviceFingerprint || '', false, 'totp_invalid');
        return c.json({
          success: false,
          error: '需要双因素验证码',
          code: 'totp_required',
          requiresTotp: true,
        }, 401);
      }
    }

    const numericUserId = parseInt(user.id, 10);
    const { session, accessToken, refreshToken } = await createSession(user.id, deviceFingerprint || '', false, rememberMe);
    setAuthCookies(c, accessToken, refreshToken, rememberMe);

    void Promise.all([
      createLoginLog(user.id, ip, userAgent, deviceFingerprint || '', true, undefined, {
        userId: numericUserId,
        username: user.username,
      }),
      clearAccountLock(username),
      query(
        `INSERT INTO user_configs (user_id, timezone) VALUES ($1, 'Asia/Shanghai') ON CONFLICT (user_id) DO NOTHING`,
        [numericUserId],
      ),
      logSecurityEvent({
        userId: numericUserId,
        username: user.username,
        eventType: 'login_success',
        ip,
        userAgent,
      }),
    ]).catch((err) => console.error('[Login post-success]', err));

    const mustChangePassword = !user.passwordChangedAt;

    ensureLunarHolidayEvents(numericUserId).catch(() => {});

    return c.json({
      success: true,
      data: {
        sessionId: session.id,
        user: {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
        },
        mustChangePassword,
        authMode: 'cookie',
      },
    });
  } catch (error: any) {
    console.error('[Login Error]', error);
    return c.json({ success: false, error: error.message || 'Login failed' }, 500);
  }
});

// 2FA endpoints removed - not needed for local deployment

auth.post('/verify-device', authMiddleware, async (c) => {
  const { deviceFingerprint } = await c.req.json();
  
  if (!deviceFingerprint) {
    return c.json({ success: false, error: 'Missing deviceFingerprint' }, 400);
  }

  const bearer = c.req.header('Authorization')?.replace('Bearer ', '');
  const accessToken = bearer || getAccessTokenFromCookie(c);
  const payload = accessToken ? await verifyToken(accessToken) : null;
  if (!payload?.sessionToken) {
    return c.json({ success: true, data: { trusted: false } });
  }

  const { getSessionByToken } = await import('../services/session.service.js');
  const session = await getSessionByToken(payload.sessionToken);
  
  const trusted = session?.isTrusted && session?.deviceFingerprint === deviceFingerprint;
  return c.json({ success: true, data: { trusted } });
});

auth.post('/logout', authMiddleware, async (c) => {
  const user = c.get('user');
  const numericUserId = parseInt(user.id, 10);
  const body = await c.req.json().catch(() => ({}));
  const sessionId = body?.sessionId as string | undefined;

  if (sessionId) {
    await query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [sessionId, numericUserId]);
  } else {
    let sessionToken: string | undefined;
    const bearer = c.req.header('Authorization')?.replace('Bearer ', '');
    if (bearer) {
      const payload = await verifyToken(bearer);
      sessionToken = payload?.sessionToken;
    }
    if (!sessionToken) {
      const accessToken = getAccessTokenFromCookie(c);
      if (accessToken) {
        const payload = await verifyToken(accessToken);
        sessionToken = payload?.sessionToken;
      }
    }
    if (!sessionToken) {
      const refreshToken = getRefreshTokenFromCookie(c);
      if (refreshToken) {
        const payload = await verifyToken(refreshToken);
        sessionToken = payload?.sessionToken;
      }
    }
    if (sessionToken) {
      await deleteSession(sessionToken);
    }
  }
  clearAuthCookies(c);
  return c.json({ success: true });
});

auth.post('/change-password', authMiddleware, authMutationRateLimit, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ success: false, error: 'Invalid input', details: parsed.error }, 400);
    }

    const { currentPassword, newPassword } = parsed.data;

    // Verify current password
    const userWithPassword = await verifyUserPassword(user.username, currentPassword);
    if (!userWithPassword) {
      return c.json({ success: false, error: 'Current password is incorrect' }, 401);
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return c.json({ success: false, error: 'New password must be at least 8 characters' }, 400);
    }

    // Hash new password and update
    const newPasswordHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, user.id]);
    await query(
      `INSERT INTO user_configs (user_id, password_changed_at)
       VALUES ($1, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET password_changed_at = CURRENT_TIMESTAMP`,
      [user.id],
    );

    const bearer = c.req.header('Authorization')?.replace('Bearer ', '');
    const currentPayload = bearer ? await verifyToken(bearer) : null;
    await deleteAllUserSessions(user.id, currentPayload?.sessionToken);

    await sendSecurityAlert({
      userId: Number(user.id),
      adminEmails: [],
      username: user.username,
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent') || 'unknown',
      failureCount: 0,
      locked: false,
      alertType: 'password_change',
    });

    return c.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('[Change Password Error]', error);
    return c.json({ success: false, error: error.message || 'Failed to change password' }, 500);
  }
});

auth.post('/refresh', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const refreshToken = body.refreshToken || getRefreshTokenFromCookie(c);

    if (!refreshToken) {
      return c.json({ success: false, error: 'Refresh token is required' }, 400);
    }

    // Verify refresh token
    const payload = await verifyToken(refreshToken);
    if (!payload) {
      return c.json({ success: false, error: 'Invalid or expired refresh token' }, 401);
    }

    if (!payload.sessionToken) {
      return c.json({ success: false, error: 'Invalid or expired refresh token' }, 401);
    }

    const session = await getSessionByToken(payload.sessionToken);
    if (!session) {
      return c.json({ success: false, error: 'Session expired or revoked' }, 401);
    }

    const { getUserById } = await import('../services/auth.service.js');
    const user = await getUserById(payload.userId);
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 401);
    }

    const sessionMs = new Date(session.expiresAt).getTime() - Date.now();
    const rememberMe = sessionMs > 24 * 60 * 60 * 1000;

    const accessToken = await generateAccessToken(user.id, payload.sessionToken, rememberMe);
    const newRefreshToken = await generateRefreshToken(user.id, payload.sessionToken);

    setAccessCookie(c, accessToken, rememberMe);
    setRefreshCookie(c, newRefreshToken, rememberMe);

    return c.json({ success: true, data: { user, authMode: 'cookie' } });
  } catch (error: any) {
    console.error('[Refresh Token Error]', error);
    return c.json({ success: false, error: error.message || 'Failed to refresh token' }, 500);
  }
});

export default auth;

// ============ Session endpoint for checking auth status ============

auth.get('/session', authMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({ success: true, data: user });
});

// ============ Login history endpoints ============

function toIsoLoginTime(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  if (s.includes('T') || s.endsWith('Z')) return new Date(s).toISOString();
  return new Date(`${s}Z`).toISOString();
}

auth.get('/turnstile-config', async (c) => {
  return c.json({
    success: true,
    data: {
      siteKey: getTurnstileSiteKey() || null,
      enabled: isTurnstileEnabled(),
    },
  });
});

auth.get('/login-history', authMiddleware, async (c) => {
  const user = c.get('user');
  try {
    const numericUserId = parseInt(user.id, 10);
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
    const limit = Math.min(100, parseInt(c.req.query('limit') || '50', 10));
    const offset = (page - 1) * limit;
    const ipFilter = c.req.query('ip')?.trim();

    let sql = `SELECT id, ip_address, username, user_agent, device_fingerprint, success, failure_reason, login_time
       FROM login_logs
       WHERE user_id = $1 OR (user_id IS NULL AND username = $2)`;
    const params: unknown[] = [numericUserId, user.username];
    if (ipFilter) {
      sql += ` AND ip_address = $3`;
      params.push(ipFilter);
    }
    sql += ` ORDER BY login_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const failureMap: Record<string, string> = {
      'Invalid credentials': '凭据无效',
      '凭据无效': '凭据无效',
    };

    const rows = await Promise.all(
      result.rows.map(async (row: Record<string, unknown>) => ({
        ...row,
        success: row.success === true || row.success === 't',
        login_time: toIsoLoginTime(row.login_time),
        failure_reason: failureMap[String(row.failure_reason || '')] || row.failure_reason,
        geo: await lookupGeoLabel(String(row.ip_address || '')),
      })),
    );

    return c.json({ success: true, data: rows, page, limit });
  } catch (error) {
    console.error('Failed to fetch login history:', error);
    return c.json({ success: false, error: 'Failed to fetch login history' }, 500);
  }
});

auth.get('/login-history/export', authMiddleware, async (c) => {
  const user = c.get('user');
  const numericUserId = parseInt(user.id, 10);
  const result = await query(
    `SELECT ip_address, username, success, failure_reason, login_time, user_agent
     FROM login_logs
     WHERE user_id = $1 OR (user_id IS NULL AND username = $2)
     ORDER BY login_time DESC LIMIT 500`,
    [numericUserId, user.username],
  );
  const header = 'time,ip,username,success,failure_reason,user_agent\n';
  const lines = result.rows.map((row: Record<string, unknown>) => {
    const cols = [
      toIsoLoginTime(row.login_time),
      row.ip_address,
      row.username,
      row.success ? 'success' : 'failure',
      row.failure_reason,
      String(row.user_agent || '').replace(/"/g, '""'),
    ];
    return cols.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  });
  return new Response(header + lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="login-history.csv"',
    },
  });
});

auth.delete('/login-history', authMiddleware, async (c) => {
  const user = c.get('user');
  try {
    const numericUserId = parseInt(user.id, 10);
    await query(
      'DELETE FROM login_logs WHERE user_id = $1 OR (user_id IS NULL AND username = $2)',
      [numericUserId, user.username],
    );
    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to clear login history:', error);
    return c.json({ success: false, error: 'Failed to clear logs' }, 500);
  }
});

// ============ Avatar upload endpoint ============

auth.post('/avatar', authMiddleware, async (c) => {
  const user = c.get('user');
  try {
    const body = await c.req.json();
    const { avatarUrl } = body;
    
    if (!avatarUrl) {
      return c.json({ success: false, error: 'avatarUrl is required' }, 400);
    }
    
    // Validate URL format
    try {
      new URL(avatarUrl);
    } catch {
      return c.json({ success: false, error: 'Invalid avatar URL format' }, 400);
    }

    const safe = await isSafePublicUrl(avatarUrl);
    if (!safe.safe) {
      return c.json({ success: false, error: safe.reason || 'Unsafe URL' }, 400);
    }
    
    const numericId = parseInt(user.id, 10);
    if (isNaN(numericId)) {
      return c.json({ success: false, error: 'Invalid user ID' }, 400);
    }
    
    await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, numericId]);
    
    return c.json({ success: true, data: { avatarUrl } });
  } catch (error: any) {
    console.error('[Update Avatar Error]', error);
    return c.json({ success: false, error: error.message || 'Failed to update avatar' }, 500);
  }
});

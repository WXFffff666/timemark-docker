import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getClientIp, getClientIpInfo } from '../utils/client-ip.js';
import { logSecurityEvent } from '../services/security-event.service.js';
import { getWebAuthnConfig } from '../utils/webauthn-config.js';
import { checkIpWhitelist, verifyTotpCode, createLoginLog } from '../services/auth.service.js';
import { loginRateLimit } from '../middleware/rate-limit.js';
import { verifyTurnstileToken } from '../utils/turnstile.js';
import {
  listUserPasskeys,
  createRegistrationOptions,
  verifyRegistration,
  deletePasskey,
} from '../services/webauthn.service.js';
import { query } from '../db/index.js';
import type { User } from '@timemark/shared';

const webauthn = new Hono<{ Variables: { user: User } }>();

const registerOptionsSchema = z.object({
  deviceName: z.string().max(64).optional(),
});

const registerVerifySchema = z.object({
  response: z.record(z.unknown()),
  deviceName: z.string().max(64).optional(),
});

// ============ Authenticated: Passkey management (not used for login) ============

webauthn.use('/credentials', authMiddleware);
webauthn.use('/credentials/*', authMiddleware);
webauthn.use('/register/*', authMiddleware);

webauthn.get('/credentials', async (c) => {
  const user = c.get('user');
  const credentials = await listUserPasskeys(parseInt(user.id, 10));
  return c.json({ success: true, data: credentials });
});

webauthn.delete('/credentials/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const ok = await deletePasskey(parseInt(user.id, 10), id);
  if (!ok) {
    return c.json({ success: false, error: 'Passkey 不存在' }, 404);
  }
  await logSecurityEvent({
    userId: parseInt(user.id, 10),
    username: user.username,
    eventType: 'passkey_removed',
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') || 'unknown',
  });
  return c.json({ success: true });
});

webauthn.post('/register/options', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = registerOptionsSchema.safeParse(body);

  const config = getWebAuthnConfig(c);
  const options = await createRegistrationOptions(
    parseInt(user.id, 10),
    user.username,
    config,
    parsed.success ? parsed.data.deviceName : undefined,
  );

  return c.json({ success: true, data: options });
});

webauthn.post('/register/verify', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = registerVerifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid input' }, 400);
  }

  const config = getWebAuthnConfig(c);
  const result = await verifyRegistration(
    parseInt(user.id, 10),
    parsed.data.response as any,
    config,
    parsed.data.deviceName,
  );

  if (!result.verified) {
    return c.json({ success: false, error: result.error || '注册失败' }, 400);
  }

  await logSecurityEvent({
    userId: parseInt(user.id, 10),
    username: user.username,
    eventType: 'passkey_registered',
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') || 'unknown',
  });

  return c.json({ success: true, message: 'Passkey 注册成功' });
});

webauthn.get('/supported', (c) => {
  const config = getWebAuthnConfig(c);
  return c.json({
    success: true,
    data: {
      rpID: config.rpID,
      origin: config.origin,
      supported: true,
    },
  });
});

// C40: Passkey 登录（无需已登录会话）
const loginOptionsSchema = z.object({
  username: z.string().min(1),
  turnstileToken: z.string().optional(),
});
const loginVerifySchema = z.object({
  username: z.string().min(1),
  response: z.record(z.unknown()),
  rememberMe: z.boolean().optional(),
  totpCode: z.string().optional(),
  turnstileToken: z.string().optional(),
});

async function verifyPasskeyTurnstile(c: { req: { header: (name: string) => string | undefined } }, token?: string) {
  const { ip, trusted } = getClientIpInfo(c as Parameters<typeof getClientIpInfo>[0]);
  return verifyTurnstileToken(token, trusted ? ip : undefined);
}

webauthn.post('/login/options', loginRateLimit, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = loginOptionsSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: '用户名必填' }, 400);

  const turnstile = await verifyPasskeyTurnstile(c, parsed.data.turnstileToken);
  if (!turnstile.ok) {
    return c.json({
      success: false,
      error: turnstile.error || '人机验证失败',
      code: turnstile.code || 'turnstile_failed',
    }, 400);
  }

  const userRow = await query('SELECT id FROM users WHERE username = $1', [parsed.data.username]);
  if (!userRow.rows.length) {
    return c.json({ success: false, error: '登录失败，请检查用户名与 Passkey' }, 401);
  }

  const userId = userRow.rows[0].id as number;
  const hasPasskey = await import('../services/webauthn.service.js').then((m) => m.userHasPasskeys(userId));
  if (!hasPasskey) return c.json({ success: false, error: '登录失败，请检查用户名与 Passkey' }, 401);

  const config = getWebAuthnConfig(c);
  const { createAuthenticationOptions } = await import('../services/webauthn.service.js');
  const options = await createAuthenticationOptions(userId, config);
  return c.json({ success: true, data: options });
});

webauthn.post('/login/verify', loginRateLimit, async (c) => {
  const body = await c.req.json();
  const parsed = loginVerifySchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: 'Invalid input' }, 400);

  const turnstile = await verifyPasskeyTurnstile(c, parsed.data.turnstileToken);
  if (!turnstile.ok) {
    return c.json({
      success: false,
      error: turnstile.error || '人机验证失败',
      code: turnstile.code || 'turnstile_failed',
    }, 400);
  }

  const ip = getClientIp(c);
  const userAgent = c.req.header('user-agent') || 'unknown';

  const userRow = await query('SELECT id, username FROM users WHERE username = $1', [parsed.data.username]);
  if (!userRow.rows.length) {
    return c.json({ success: false, error: 'Passkey 验证失败' }, 401);
  }

  const user = userRow.rows[0] as { id: number; username: string };

  const whitelist = await checkIpWhitelist(String(user.id), ip);
  if (!whitelist.allowed) {
    return c.json({ success: false, error: whitelist.reason || '当前 IP 不在白名单' }, 403);
  }

  const totpRequired = await query('SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [user.id]);
  const totpRow = totpRequired.rows[0] as { totp_secret?: string; totp_enabled?: boolean } | undefined;
  if (totpRow?.totp_enabled && totpRow?.totp_secret) {
    const totpOk = verifyTotpCode(totpRow.totp_secret, parsed.data.totpCode || '');
    if (!totpOk) {
      await createLoginLog(String(user.id), ip, userAgent, '', false, 'totp_invalid');
      return c.json({ success: false, error: '需要双因素验证码', requiresTotp: true }, 401);
    }
  }

  const config = getWebAuthnConfig(c);
  const { verifyAuthentication } = await import('../services/webauthn.service.js');
  const result = await verifyAuthentication(user.id, parsed.data.response as any, config);
  if (!result.verified) {
    await createLoginLog(String(user.id), ip, userAgent, '', false, 'passkey_failed');
    return c.json({ success: false, error: result.error || 'Passkey 验证失败' }, 401);
  }

  await createLoginLog(String(user.id), ip, userAgent, '', true);
  const { createSession } = await import('../services/session.service.js');
  const { setAuthCookies } = await import('../utils/auth-cookies.js');
  const { session, accessToken, refreshToken } = await createSession(String(user.id), '', false, parsed.data.rememberMe);
  await logSecurityEvent({
    userId: user.id,
    username: user.username,
    eventType: 'passkey_login_success',
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') || 'unknown',
    metadata: { method: 'passkey' },
  });
  setAuthCookies(c, accessToken, refreshToken, !!parsed.data.rememberMe);
  return c.json({ success: true, data: { user: { id: String(user.id), username: user.username }, sessionId: session.id } });
});

export default webauthn;

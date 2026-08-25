import { Context, Next } from 'hono';
import { verifyToken } from '../utils/jwt.js';
import { getUserById } from '../services/auth.service.js';
import { getSessionByToken } from '../services/session.service.js';
import { getAccessTokenFromCookie } from '../utils/auth-cookies.js';
import type { User } from '@timemark/shared';

export async function authMiddleware(c: Context<{ Variables: { user: User } }>, next: Next) {
  // Skip if user already set (e.g. by API key middleware)
  const existingUser = c.get('user');
  if (existingUser) {
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');
  let token = authHeader?.replace(/^Bearer\s+/i, '').trim() || undefined;
  if (token === '') token = undefined;
  let payload = token ? await verifyToken(token) : null;

  // Bearer 无效或缺失时，回退 HttpOnly Cookie
  if (!payload) {
    const cookieToken = getAccessTokenFromCookie(c);
    if (cookieToken) {
      token = cookieToken;
      payload = await verifyToken(cookieToken);
    }
  }

  if (!token) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  if (!payload) {
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }

  // 会话吊销检查：session 被删除/注销后令牌立即失效
  if (payload.sessionToken) {
    const session = await getSessionByToken(payload.sessionToken);
    if (!session) {
      return c.json({ success: false, error: 'Session expired or revoked' }, 401);
    }
  }

  const user = await getUserById(payload.userId);

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 401);
  }

  c.set('user', user);
  await next();
}

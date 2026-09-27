import type { Context, Next } from 'hono';
import { getConfiguredOrigins, isAllowedOrigin } from '../utils/allowed-origins.js';
import { getRequestOrigin } from '../utils/client-ip.js';

/**
 * CSRF 保护中间件
 *
 * HttpOnly Cookie 认证会自动携带凭据，存在 CSRF 风险，因此仍验证 Origin/Referer。
 * LAN 访问无需手动配置 CORS_ORIGIN；只允许 Origin 与实际请求 scheme、host、port 完全一致时通过。
 *
 * 保护范围：
 * - POST, PUT, DELETE, PATCH
 * - 排除 GET, HEAD, OPTIONS
 */

export function csrfProtection() {
  const allowedOrigins = getConfiguredOrigins();

  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }

    // webhook / inbox 公开端点不受 CSRF 限制（与 vercel 一致）
    if (c.req.path.startsWith('/api/webhook/') || c.req.path.startsWith('/api/inbox/receive/') || c.req.path === '/api/csp-report') {
      return next();
    }

    const origin = c.req.header('Origin');
    const referer = c.req.header('Referer');
    const appOrigin = getRequestOrigin(c);

    let requestOrigin = origin;
    if (!requestOrigin && referer) {
      try {
        requestOrigin = new URL(referer).origin;
      } catch {
        // invalid referer
      }
    }

    const hasCustomHeader = c.req.header('X-Requested-With') === 'XMLHttpRequest';

    if (!requestOrigin) {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ') && hasCustomHeader) {
        return next();
      }
      return c.json({ success: false, error: 'Missing origin or authorization' }, 403);
    }

    if (!isAllowedOrigin(requestOrigin, appOrigin, allowedOrigins)) {
      console.warn(`[CSRF] Blocked request from origin: ${requestOrigin} appOrigin: ${appOrigin}`);
      return c.json({ success: false, error: 'Origin not allowed' }, 403);
    }

    return next();
  };
}

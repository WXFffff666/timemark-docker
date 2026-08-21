import type { Context, Next } from 'hono';
import { getConfiguredOrigins, isAllowedOrigin } from '../utils/allowed-origins.js';

/**
 * CSRF 保护中间件
 *
 * 对于使用 JWT 认证的 SPA 应用，CSRF 风险较低（token 在 localStorage），
 * 但仍验证 Origin/Referer。
 * 修复 #4：LAN IP:端口 无需手动 CORS_ORIGIN 即可登录 — 允许 Origin 与 Host 同源时通过
 *（即使 CORS_ORIGIN 未配置），与 vercel 版 originMatchesHost 逻辑一致。
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
    const host = c.req.header('host') ?? c.req.header('x-forwarded-host');

    let requestOrigin = origin;
    if (!requestOrigin && referer) {
      try {
        requestOrigin = new URL(referer).origin;
      } catch {
        // invalid referer
      }
    }

    const apiKeyHeader = c.req.header('X-API-Key');
    if (apiKeyHeader) {
      return next();
    }

    const hasCustomHeader = c.req.header('X-Requested-With') === 'XMLHttpRequest';

    if (!requestOrigin) {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ') && hasCustomHeader) {
        return next();
      }
      return c.json({ success: false, error: 'Missing origin or authorization' }, 403);
    }

    if (!isAllowedOrigin(requestOrigin, host, allowedOrigins)) {
      console.warn(`[CSRF] Blocked request from origin: ${requestOrigin} host: ${host}`);
      return c.json({ success: false, error: 'Origin not allowed' }, 403);
    }

    return next();
  };
}

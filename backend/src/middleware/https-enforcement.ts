import type { Context, Next } from 'hono';
import { isRequestHttps } from '../utils/client-ip.js';

/**
 * Reject cleartext application requests in production. Forwarded scheme headers are
 * accepted only from configured trusted proxies. The health endpoint remains
 * reachable over HTTP for container health checks.
 */
export async function httpsEnforcement(c: Context, next: Next) {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  const allowInsecureHttp = process.env.ALLOW_INSECURE_HTTP === 'true';
  if (c.req.path === '/health') {
    await next();
    return;
  }
  if (isProduction && !allowInsecureHttp && !isRequestHttps(c)) {
    return c.json({ success: false, error: '必须使用 HTTPS 访问' }, 403);
  }
  await next();
}

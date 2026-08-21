import type { Context, Next } from 'hono';

/**
 * Reject cleartext API requests in production. Vercel terminates TLS and sets
 * X-Forwarded-Proto; credentials must never travel over HTTP.
 */
export async function httpsEnforcement(c: Context, next: Next) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    const proto = c.req.header('x-forwarded-proto');
    if (proto && proto !== 'https') {
      return c.json({ success: false, error: '必须使用 HTTPS 访问' }, 403);
    }
  }
  await next();
}

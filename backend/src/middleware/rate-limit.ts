import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();

function getClientIP(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    '127.0.0.1'
  );
}

/**
 * Sliding window rate limiter middleware for Hono.
 * @param maxRequests Maximum requests allowed in the window
 * @param windowMs Time window in milliseconds
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    const ip = getClientIP(c);
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Prevent unbounded growth
    if (store.size > 10000) {
      const now2 = Date.now();
      for (const [k, v] of store) {
        if (v.resetAt <= now2) store.delete(k);
      }
      // If still too large, delete oldest 10%
      if (store.size > 10000) {
        const entries = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
        const toDelete = Math.ceil(store.size * 0.1);
        for (let i = 0; i < toDelete; i++) store.delete(entries[i][0]);
      }
    }

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        { success: false, error: '请求过于频繁，请稍后再试' },
        429
      );
    }

    await next();
  };
}

/**
 * Rate limiter for auth endpoints (15 requests per minute).
 * Must exceed the account lockout threshold (5 failures) to ensure
 * lockout logic in the route handler always has room to trigger.
 */
export const authRateLimit = rateLimit(15, 60 * 1000);

/**
 * General API rate limiter (100 requests per minute)
 */
export const apiRateLimit = rateLimit(100, 60 * 1000);

export const loginRateLimit = rateLimit(15, 60 * 1000);
export const authMutationRateLimit = rateLimit(15, 60 * 1000);

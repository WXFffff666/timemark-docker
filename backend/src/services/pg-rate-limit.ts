import { query } from '../db/index.js';

/** PostgreSQL-backed fixed-window rate limiter (serverless-safe). */
export async function checkPgRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const result = await query(
    `INSERT INTO rate_limits (key, count, window_start)
     VALUES ($1, 1, NOW())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE
         WHEN rate_limits.window_start + ($3 || ' seconds')::interval <= NOW() THEN 1
         ELSE rate_limits.count + 1
       END,
       window_start = CASE
         WHEN rate_limits.window_start + ($3 || ' seconds')::interval <= NOW() THEN NOW()
         ELSE rate_limits.window_start
       END
     RETURNING count, window_start`,
    [key, maxRequests, windowSeconds],
  );

  const row = result.rows[0] as { count: number; window_start: Date | string };
  const count = Number(row.count);
  const windowStart = row.window_start instanceof Date ? row.window_start : new Date(row.window_start);
  const resetAt = windowStart.getTime() + windowSeconds * 1000;

  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
    resetAt,
  };
}

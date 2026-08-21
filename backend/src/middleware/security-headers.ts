import type { Context, Next } from 'hono';

const ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet, noimageai, noai';

export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('X-Robots-Tag', ROBOTS_TAG);
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  const cspReportUri = process.env.CSP_REPORT_URI || '/api/csp-report';
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; report-uri " +
        cspReportUri,
    );
  } else if (cspReportUri) {
    c.header('Content-Security-Policy-Report-Only', `default-src 'self'; report-uri ${cspReportUri}`);
  }
  c.res.headers.delete('X-Powered-By');
  c.res.headers.delete('Server');
}

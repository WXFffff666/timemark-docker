import type { Context, Next } from 'hono';

const ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet, noimageai, noai';

/** 判断请求是否真的走了 HTTPS（反代 X-Forwarded-Proto 优先），而不是只看 NODE_ENV。 */
function isHttpsRequest(c: Context): boolean {
  const proto = c.req.header('x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('X-Robots-Tag', ROBOTS_TAG);
  c.header('Cross-Origin-Opener-Policy', 'same-origin');

  const https = isHttpsRequest(c);
  // HSTS 只在真实 HTTPS 响应上发送；HTTP LAN/NAS 部署发送 HSTS 反而有害。
  if (https && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // CSP:
  // - upgrade-insecure-requests 仅在 HTTPS 请求下附加，否则纯 HTTP 部署的浏览器会把子资源
  //   强制升级到 https://ip:3000 导致连接失败、页面白屏。
  // - report-uri 默认不启用（内置默认指向的 /api/csp-report 并未挂载）；需要时设置 CSP_REPORT_URI。
  const cspDirectives =
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; script-src-attr 'none'; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; " +
    'frame-src https://challenges.cloudflare.com; object-src \'none\'; base-uri \'self\'; form-action \'self\'';
  const cspReportUri = process.env.CSP_REPORT_URI;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL || https) {
    let csp = cspDirectives;
    if (https) csp += '; upgrade-insecure-requests';
    if (cspReportUri) csp += `; report-uri ${cspReportUri}`;
    c.header('Content-Security-Policy', csp);
  } else {
    c.header('Content-Security-Policy-Report-Only', `default-src 'self'; report-uri ${cspReportUri ?? '/csp-reports'}`);
  }

  c.res.headers.delete('X-Powered-By');
  c.res.headers.delete('Server');
}

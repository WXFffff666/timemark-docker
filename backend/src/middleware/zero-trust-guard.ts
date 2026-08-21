import type { Context, Next } from 'hono';
import { timingSafeEqual } from 'crypto';
import { getCronSecret } from '../utils/heartbeat.js';
import { getClientIp } from '../utils/client-ip.js';

/** Paths with their own auth — never block automation here */
const BYPASS_PREFIXES = [
  '/api/cron/',
  '/api/webhook/',
  '/api/inbox/receive/',
  '/api/calendar/feed/',
  '/api/csp-report',
  '/health',
  '/api/health',
] as const;

/** Common vulnerability-scan / probe targets — return 404 without touching DB */
const PROBE_PATH_PATTERNS: RegExp[] = [
  /\/\.env/i,
  /\/\.git/i,
  /\/wp-admin/i,
  /\/wp-login/i,
  /\/wp-content/i,
  /\/phpmyadmin/i,
  /\/pma\//i,
  /\/admin\.php/i,
  /\/xmlrpc\.php/i,
  /\/\.aws/i,
  /\/config\.json$/i,
  /\/server-status/i,
  /\/actuator/i,
  /\/\.well-known\/security\.txt$/i,
  /\/vendor\/phpunit/i,
  /\/cgi-bin/i,
  /\/shell/i,
  /\/\.htaccess/i,
  /\/backup\.(sql|zip|tar|gz)$/i,
  /\/database\.(sql|yml)$/i,
];

/** AI crawlers, SEO bots, and security scanners */
const BLOCKED_UA_PATTERNS: RegExp[] = [
  /gptbot/i,
  /chatgpt-user/i,
  /claudebot/i,
  /anthropic-ai/i,
  /ccbot/i,
  /bytespider/i,
  /amazonbot/i,
  /cohere-ai/i,
  /diffbot/i,
  /google-extended/i,
  /applebot-extended/i,
  /meta-externalagent/i,
  /omgili/i,
  /petalbot/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /dataforseo/i,
  /serpstatbot/i,
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /dirbuster/i,
  /gobuster/i,
  /wpscan/i,
  /acunetix/i,
  /nessus/i,
  /openvas/i,
  /netsparker/i,
  /burpsuite/i,
  /havij/i,
  /scrapy/i,
  /httpx/i,
  /nuclei/i,
  /feroxbuster/i,
  /ffuf/i,
  /shodan/i,
  /censys/i,
];

const probeHits = new Map<string, { count: number; resetAt: number }>();
const PROBE_WINDOW_MS = 60_000;
const PROBE_MAX_HITS = 20;

export function isProbePath(path: string): boolean {
  const normalized = path.split('?')[0] || path;
  return PROBE_PATH_PATTERNS.some((re) => re.test(normalized));
}

export function isBlockedUserAgent(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return BLOCKED_UA_PATTERNS.some((re) => re.test(userAgent));
}

export function matchesBypassPrefix(path: string): boolean {
  return BYPASS_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function hasCronBearer(authHeader: string | undefined): boolean {
  const secret = getCronSecret();
  if (!secret || !authHeader) return false;
  const expected = `Bearer ${secret}`;
  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function shouldBypassZeroTrust(input: {
  path: string;
  authorization?: string;
  vercelCronToken?: string;
}): boolean {
  if (matchesBypassPrefix(input.path)) return true;
  if (hasCronBearer(input.authorization)) return true;
  return false;
}

function trackProbeHit(ip: string): boolean {
  const now = Date.now();
  let entry = probeHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + PROBE_WINDOW_MS };
    probeHits.set(ip, entry);
  }
  entry.count++;
  if (probeHits.size > 5000) {
    for (const [key, value] of probeHits) {
      if (value.resetAt <= now) probeHits.delete(key);
    }
  }
  return entry.count > PROBE_MAX_HITS;
}

/**
 * Zero-trust edge guard: block known bots/scanners and common probe paths.
 * Legitimate cron, webhooks, calendar feeds, and API-key clients bypass checks.
 */
export async function zeroTrustGuard(c: Context, next: Next) {
  const path = c.req.path;
  const authorization = c.req.header('Authorization');
  const apiKey = c.req.header('X-API-Key');
  const vercelCronToken = c.req.header('x-vercel-cron-auth-token');

  if (
    shouldBypassZeroTrust({
      path,
      authorization,
      vercelCronToken,
    })
  ) {
    return next();
  }

  if (isProbePath(path)) {
    const ip = getClientIp(c);
    if (trackProbeHit(ip)) {
      return c.json({ success: false, error: '请求过于频繁' }, 429);
    }
    return c.body(null, 404);
  }

  const userAgent = c.req.header('User-Agent');
  if (isBlockedUserAgent(userAgent)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  // API mutation without browser fingerprint — likely scripted abuse (cron/webhook already bypassed)
  const method = c.req.method.toUpperCase();
  if (
    path.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    !authorization &&
    !apiKey &&
    c.req.header('X-Requested-With') !== 'XMLHttpRequest'
  ) {
    const origin = c.req.header('Origin');
    const referer = c.req.header('Referer');
    if (!origin && !referer) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }
  }

  await next();
}

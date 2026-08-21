import type { Context } from 'hono';

function normalizeIp(raw: string): string {
  let ip = raw.trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  if (!ip || ip === '::1') {
    return '127.0.0.1';
  }
  return ip.slice(0, 45);
}

export type ClientIpInfo = {
  ip: string;
  /** From Cloudflare or Vercel platform headers — safe to pass as Turnstile remoteip */
  trusted: boolean;
};

/**
 * Resolve client IP on Vercel / Cloudflare / reverse proxies.
 * Prefer cf-connecting-ip (end-user IP behind Cloudflare) over generic X-Forwarded-For.
 */
export function getClientIpInfo(c: Context): ClientIpInfo {
  const cfIp = c.req.header('cf-connecting-ip')?.trim();
  const vercelForwarded = c.req.header('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  const realIp = c.req.header('x-real-ip')?.trim();
  const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();

  if (cfIp) {
    return { ip: normalizeIp(cfIp), trusted: true };
  }
  if (vercelForwarded) {
    return { ip: normalizeIp(vercelForwarded), trusted: true };
  }
  if (realIp) {
    return { ip: normalizeIp(realIp), trusted: false };
  }
  if (forwardedFor) {
    return { ip: normalizeIp(forwardedFor), trusted: false };
  }

  let ip = '';
  try {
    // @ts-expect-error Hono optional API
    if (typeof c.getClientIp === 'function') {
      // @ts-expect-error Hono optional API
      ip = c.getClientIp({ proxyProof: true }) || '';
    }
  } catch {
    // ignore
  }

  return { ip: normalizeIp(ip || '127.0.0.1'), trusted: false };
}

export function getClientIp(c: Context): string {
  return getClientIpInfo(c).ip;
}

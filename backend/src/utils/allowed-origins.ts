/** Shared CORS / CSRF origin rules — synced from timemark-vercel, adapted for docker (LAN IP friendly) */

export const CANONICAL_ORIGIN = 'https://timemark.the37777777.top';

export function getConfiguredOrigins(): string[] {
  const origins: string[] = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  const corsOrigin = process.env.CORS_ORIGIN;
  if (corsOrigin && corsOrigin !== '*') {
    origins.push(...corsOrigin.split(',').map((o) => o.trim()).filter(Boolean));
  }

  // Docker: no Vercel preview logic; optional canonical fallback like vercel
  // (kept so CORS_ORIGIN 未配置时，公网域名仍在白名单；LAN 场景由 originMatchesHost 覆盖)
  if (!corsOrigin && !origins.includes(CANONICAL_ORIGIN)) {
    // 仅当非本地开发且未配置时，兜底加入 canonical（与 vercel 一致，可选）
    // Docker 本地/NAS 场景虽然不会命中该域名，但保留不影响 LAN 逻辑
    origins.push(CANONICAL_ORIGIN);
  }

  return [...new Set(origins)];
}

// 别名：docker 历史命名兼容
export const getAllowedOrigins = getConfiguredOrigins;

export function isVercelAppOrigin(origin: string): boolean {
  return /^https:\/\/[\w-]+\.vercel\.app$/.test(origin);
}

export function originMatchesHost(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    const url = new URL(origin);
    return url.host === host;
  } catch {
    return false;
  }
}

export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes('*')) return true;
  if (originMatchesHost(origin, host)) return true;

  return allowedOrigins.some((allowed) => {
    if (origin === allowed) return true;
    if (allowed.startsWith('*.')) {
      return origin.endsWith(allowed.slice(2));
    }
    return false;
  });
}

export function resolveSafeAppOrigin(
  protocol: string | undefined,
  host: string | undefined,
): string {
  const proto = protocol === 'http' ? 'http' : 'https';
  const h = host?.trim();
  if (h) {
    const candidate = `${proto}://${h}`;
    if (isAllowedOrigin(candidate, h, getConfiguredOrigins())) {
      return candidate;
    }
  }
  return CANONICAL_ORIGIN;
}

export function resolveCorsOrigin(origin: string | undefined, host: string | undefined): string {
  const allowed = getConfiguredOrigins();
  if (!origin) return allowed[0] ?? 'http://localhost:5173';
  if (isAllowedOrigin(origin, host, allowed)) return origin;
  return allowed[0] ?? 'http://localhost:5173';
}

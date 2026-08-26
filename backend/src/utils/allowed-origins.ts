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

  // Docker/NAS 默认只信任本地回环 + 同 Host（originMatchesHost 覆盖 LAN 访问）；
  // 不再把作者个人域名硬编码进所有部署的默认允许列表。
  // 需要额外公网来源时，通过 CORS_ORIGIN 显式配置。

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
  // 不再把作者个人域名作为通用兜底；无法解析时退回本地默认。
  return 'http://localhost:3000';
}

export function resolveCorsOrigin(origin: string | undefined, host: string | undefined): string {
  const allowed = getConfiguredOrigins();
  if (!origin) return allowed[0] ?? 'http://localhost:5173';
  if (isAllowedOrigin(origin, host, allowed)) return origin;
  return allowed[0] ?? 'http://localhost:5173';
}

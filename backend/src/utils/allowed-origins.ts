/** Shared CORS / CSRF origin rules — synced from timemark-vercel, adapted for docker (LAN IP friendly) */

export const CANONICAL_ORIGIN = 'https://timemark.the37777777.top';

function normalizeHttpOrigin(value: string): string | null {
  if (value.includes('*')) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getConfiguredOrigins(): string[] {
  const origins: string[] = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  const corsOrigin = process.env.CORS_ORIGIN;
  if (corsOrigin) {
    // Cookie-auth responses cannot safely authorize every origin.
    origins.push(
      ...corsOrigin.split(',')
        .map((origin) => normalizeHttpOrigin(origin.trim()))
        .filter((origin): origin is string => origin !== null),
    );
  }

  // Docker/NAS 默认只信任本地回环 + 与请求 origin 完全一致（覆盖 LAN 访问）；
  // 不再把作者个人域名硬编码进所有部署的默认允许列表。
  // 需要额外公网来源时，通过 CORS_ORIGIN 显式配置。

  return [...new Set(origins)];
}

// 别名：docker 历史命名兼容
export const getAllowedOrigins = getConfiguredOrigins;

export function isVercelAppOrigin(origin: string): boolean {
  return /^https:\/\/[\w-]+\.vercel\.app$/.test(origin);
}

export function originMatchesRequest(
  origin: string,
  requestOrigin: string | undefined,
): boolean {
  if (!requestOrigin) return false;
  const normalizedOrigin = normalizeHttpOrigin(origin);
  const normalizedRequestOrigin = normalizeHttpOrigin(requestOrigin);
  return normalizedOrigin !== null && normalizedOrigin === normalizedRequestOrigin;
}

export function isAllowedOrigin(
  origin: string | undefined,
  requestOrigin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin || allowedOrigins.includes('*')) return false;
  const normalizedOrigin = normalizeHttpOrigin(origin);
  if (!normalizedOrigin) return false;
  if (originMatchesRequest(origin, requestOrigin)) return true;
  return allowedOrigins.includes(normalizedOrigin);
}

export function resolveSafeAppOrigin(
  protocol: string | undefined,
  host: string | undefined,
): string {
  const proto = protocol === 'http' ? 'http' : 'https';
  const h = host?.trim();
  if (h) {
    const candidate = `${proto}://${h}`;
    if (isAllowedOrigin(candidate, candidate, getConfiguredOrigins())) {
      return candidate;
    }
  }
  // 不再把作者个人域名作为通用兜底；无法解析时退回本地默认。
  return 'http://localhost:3000';
}

export function resolveCorsOrigin(origin: string | undefined, requestOrigin: string | undefined): string {
  const allowed = getConfiguredOrigins();
  if (!origin) return allowed[0] ?? 'http://localhost:5173';
  if (isAllowedOrigin(origin, requestOrigin, allowed)) return origin;
  return allowed[0] ?? 'http://localhost:5173';
}

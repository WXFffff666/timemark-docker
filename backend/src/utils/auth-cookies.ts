import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const ACCESS_COOKIE = 'timemark_access';
const REFRESH_COOKIE = 'timemark_refresh';

/**
 * secure 不能只看 NODE_ENV：容器内恒为 production，而 NAS/LAN 常以纯 HTTP 访问，
 * 带 Secure 的 Cookie 会被浏览器直接丢弃。按真实请求协议（X-Forwarded-Proto）判定。
 */
function isHttpsRequest(c: Context): boolean {
  const proto = c.req.header('x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function cookieOpts(c: Context) {
  return {
    httpOnly: true,
    secure: isHttpsRequest(c) || !!process.env.VERCEL,
    sameSite: 'Lax' as const,
    path: '/',
  };
}

export function setAuthCookies(c: Context, accessToken: string, refreshToken: string, rememberMe: boolean) {
  const opts = cookieOpts(c);
  setCookie(c, ACCESS_COOKIE, accessToken, { ...opts, maxAge: rememberMe ? 60 * 60 : undefined });
  setCookie(c, REFRESH_COOKIE, refreshToken, { ...opts, ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 } : {}) });
}

export function clearAuthCookies(c: Context) {
  deleteCookie(c, ACCESS_COOKIE, { path: '/' });
  deleteCookie(c, REFRESH_COOKIE, { path: '/' });
}

export function getAccessTokenFromCookie(c: Context): string | undefined {
  return getCookie(c, ACCESS_COOKIE);
}

export function getRefreshTokenFromCookie(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE);
}

export function setAccessCookie(c: Context, accessToken: string, rememberMe = false) {
  setCookie(c, ACCESS_COOKIE, accessToken, { ...cookieOpts(c), maxAge: rememberMe ? 60 * 60 : undefined });
}

export function setRefreshCookie(c: Context, refreshToken: string, rememberMe = false) {
  setCookie(c, REFRESH_COOKIE, refreshToken, { ...cookieOpts(c), ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 } : {}) });
}

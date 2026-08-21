import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const ACCESS_COOKIE = 'timemark_access';
const REFRESH_COOKIE = 'timemark_refresh';

const baseOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
  sameSite: 'Lax' as const,
  path: '/',
};

export function setAuthCookies(c: Context, accessToken: string, refreshToken: string, rememberMe: boolean) {
  setCookie(c, ACCESS_COOKIE, accessToken, { ...baseOpts, maxAge: rememberMe ? 60 * 60 : undefined });
  setCookie(c, REFRESH_COOKIE, refreshToken, { ...baseOpts, ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 } : {}) });
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
  setCookie(c, ACCESS_COOKIE, accessToken, { ...baseOpts, maxAge: rememberMe ? 60 * 60 : undefined });
}

export function setRefreshCookie(c: Context, refreshToken: string, rememberMe = false) {
  setCookie(c, REFRESH_COOKIE, refreshToken, { ...baseOpts, ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 } : {}) });
}

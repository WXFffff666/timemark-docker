import { encrypt, decrypt } from '@timemark/shared/crypto';
import { sign, verify } from 'hono/jwt';
import { createLogger } from '../utils/logger.js';

const log = createLogger('google-oauth');

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

function getMasterKey(): string {
  const key = process.env.MASTER_KEY;
  if (!key) throw new Error('MASTER_KEY not set');
  return key;
}

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return secret;
}

export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
}

export function getGoogleRedirectUri(origin: string): string {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${origin.replace(/\/$/, '')}/api/calendar/google-oauth/callback`;
}

export async function buildOAuthState(userId: number): Promise<string> {
  return sign(
    { userId, purpose: 'google_oauth', exp: Math.floor(Date.now() / 1000) + 600 },
    resolveJwtSecret(),
  );
}

export async function verifyOAuthState(state: string): Promise<number | null> {
  try {
    const payload = await verify(state, resolveJwtSecret(), 'HS256');
    if (payload.purpose !== 'google_oauth') return null;
    const userId = Number(payload.userId);
    return Number.isFinite(userId) ? userId : null;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(state: string, redirectUri: string): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ refresh_token?: string; access_token: string; email?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  let email: string | undefined;
  try {
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { email?: string };
      email = profile.email;
    }
  } catch (err) {
    log.warn({ err }, 'Failed to fetch Google profile email');
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, email };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Token refresh failed');
  }
  return data.access_token;
}

export function encryptRefreshToken(token: string): string {
  return encrypt(token, getMasterKey());
}

export function decryptRefreshToken(stored: string): string {
  if (!stored) return '';
  try {
    return decrypt(stored, getMasterKey());
  } catch {
    log.warn('Google refresh token decrypt failed');
    return '';
  }
}

import { sign, verify } from 'hono/jwt';

const DEFAULT_JWT_SECRET = 'change-this-secret-in-production';

export function isSecureSecret(): boolean {
  const current = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  return current !== DEFAULT_JWT_SECRET && current.length >= 32;
}

export interface TokenPayload {
  userId: string;
  sessionToken?: string;
  tokenUse: 'access' | 'refresh';
  refreshTokenId?: string;
}

function resolveSecret(secret?: string): string {
  const resolved = secret || process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  // 生产环境禁止静默使用公开的默认密钥（vercel 同款加固）。
  // 正常启动路径中 initSecretKeys() 会先生成并写入随机 JWT_SECRET，因此不受影响。
  if (process.env.NODE_ENV === 'production' && (!resolved || resolved === DEFAULT_JWT_SECRET || resolved.length < 32)) {
    throw new Error('JWT_SECRET is missing or too weak for production — refusing to sign tokens with a publicly-known default');
  }
  return resolved;
}

export async function generateAccessToken(userId: string, sessionToken?: string, rememberMe: boolean = false, secret?: string): Promise<string> {
  const expiresIn = rememberMe ? 60 * 60 : 15 * 60;
  const payload: Record<string, unknown> = { userId, tokenUse: 'access', exp: Math.floor(Date.now() / 1000) + expiresIn };
  if (sessionToken) payload.sessionToken = sessionToken;
  return sign(payload, resolveSecret(secret));
}

export async function generateRefreshToken(userId: string, sessionToken: string, refreshTokenId: string, secret?: string): Promise<string> {
  const payload: Record<string, unknown> = { userId, sessionToken, tokenUse: 'refresh', refreshTokenId, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 };
  return sign(payload, resolveSecret(secret));
}

export async function verifyToken(token: string, secret?: string): Promise<TokenPayload | null> {
  try {
    const payload = await verify(token, resolveSecret(secret), 'HS256');
    const tokenUse = payload.tokenUse;
    const userId = payload.userId;
    const sessionToken = typeof payload.sessionToken === 'string' ? payload.sessionToken : undefined;
    const refreshTokenId = typeof payload.refreshTokenId === 'string' ? payload.refreshTokenId : undefined;
    if ((tokenUse !== 'access' && tokenUse !== 'refresh') || typeof userId !== 'string' || !userId) return null;
    if (tokenUse === 'refresh' && (!sessionToken || !refreshTokenId)) return null;
    return { userId, sessionToken, tokenUse, refreshTokenId };
  } catch {
    return null;
  }
}

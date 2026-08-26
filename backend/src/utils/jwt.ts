import { sign, verify } from 'hono/jwt';

const DEFAULT_JWT_SECRET = 'change-this-secret-in-production';

export function isSecureSecret(): boolean {
  const current = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  return current !== DEFAULT_JWT_SECRET && current.length >= 32;
}

export interface TokenPayload {
  userId: string;
  sessionToken?: string;
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
  const payload: Record<string, unknown> = { userId, exp: Math.floor(Date.now() / 1000) + expiresIn };
  if (sessionToken) payload.sessionToken = sessionToken;
  return sign(payload, resolveSecret(secret));
}

export async function generateRefreshToken(userId: string, sessionToken?: string, secret?: string): Promise<string> {
  const payload: Record<string, unknown> = { userId, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 };
  if (sessionToken) payload.sessionToken = sessionToken;
  return sign(payload, resolveSecret(secret));
}

export async function verifyToken(token: string, secret?: string): Promise<TokenPayload | null> {
  try {
    const payload = await verify(token, resolveSecret(secret), 'HS256');
    return { userId: payload.userId as string, sessionToken: payload.sessionToken as string | undefined };
  } catch {
    return null;
  }
}

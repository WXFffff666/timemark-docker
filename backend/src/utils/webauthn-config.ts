import type { Context } from 'hono';

export interface WebAuthnRuntimeConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

export function resolveRequestOrigin(c: Context): string {
  const headerOrigin = c.req.header('Origin');
  if (headerOrigin) return headerOrigin;

  const referer = c.req.header('Referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore
    }
  }

  const host = c.req.header('x-forwarded-host') || c.req.header('host');
  if (host) {
    const proto = c.req.header('x-forwarded-proto') || 'https';
    return `${proto}://${host}`;
  }

  // 最后一道兜底（正常都会命中上面的 Origin/Referer/Host 推导）。
  // 不再把作者个人域名作为所有部署的默认 Passkey 来源；需要固定来源时设置 WEBAUTHN_ORIGIN。
  return process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
}

export function getWebAuthnConfig(c: Context): WebAuthnRuntimeConfig {
  const origin = resolveRequestOrigin(c);
  const rpName = process.env.WEBAUTHN_RP_NAME || 'TimeMark';

  if (process.env.WEBAUTHN_RP_ID) {
    return { rpID: process.env.WEBAUTHN_RP_ID, rpName, origin };
  }

  try {
    const hostname = new URL(origin).hostname;
    return { rpID: hostname, rpName, origin };
  } catch {
    return { rpID: 'localhost', rpName, origin };
  }
}

import type { Context } from 'hono';
import { getRequestOrigin } from './client-ip.js';

export interface WebAuthnRuntimeConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

export function resolveRequestOrigin(c: Context): string {
  // A fixed deployment origin takes precedence over request-controlled headers.
  const configuredOrigin = process.env.WEBAUTHN_ORIGIN;
  if (configuredOrigin) return configuredOrigin;

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

  return getRequestOrigin(c);
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

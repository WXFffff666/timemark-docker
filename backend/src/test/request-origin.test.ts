import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveRequestOrigin } from '../utils/webauthn-config.js';

const originalTrustedProxies = process.env.TRUSTED_PROXIES;
const originalWebAuthnOrigin = process.env.WEBAUTHN_ORIGIN;
const app = new Hono();
app.get('/origin', (c) => c.text(resolveRequestOrigin(c)));

function request(
  options: {
    peerAddress: string;
    forwardedProto?: string;
    forwardedHost?: string;
    origin?: string;
    referer?: string;
  },
) {
  const headers = new Headers();
  if (options.forwardedProto) headers.set('x-forwarded-proto', options.forwardedProto);
  if (options.forwardedHost) headers.set('x-forwarded-host', options.forwardedHost);
  if (options.origin) headers.set('origin', options.origin);
  if (options.referer) headers.set('referer', options.referer);
  const env = {
    incoming: {
      socket: {
        remoteAddress: options.peerAddress,
        remotePort: 12345,
        remoteFamily: options.peerAddress.includes(':') ? 'IPv6' : 'IPv4',
        encrypted: false,
      },
    },
  };
  return app.request('http://timemark.test/origin', { headers }, env as any);
}

beforeEach(() => {
  process.env.TRUSTED_PROXIES = '10.0.0.0/8';
  delete process.env.WEBAUTHN_ORIGIN;
});

afterEach(() => {
  if (originalTrustedProxies === undefined) delete process.env.TRUSTED_PROXIES;
  else process.env.TRUSTED_PROXIES = originalTrustedProxies;
  if (originalWebAuthnOrigin === undefined) delete process.env.WEBAUTHN_ORIGIN;
  else process.env.WEBAUTHN_ORIGIN = originalWebAuthnOrigin;
});

describe('resolveRequestOrigin forwarded metadata', () => {
  it('ignores forwarded host and protocol from an untrusted peer', async () => {
    const response = await request({
      peerAddress: '203.0.113.10',
      forwardedProto: 'https',
      forwardedHost: 'attacker.example',
    });

    expect(await response.text()).toBe('http://timemark.test');
  });

  it('uses forwarded host and protocol from a trusted proxy', async () => {
    const response = await request({
      peerAddress: '10.0.0.2',
      forwardedProto: 'https',
      forwardedHost: 'public.example',
    });

    expect(await response.text()).toBe('https://public.example');
  });

  it('ignores ambiguous forwarded metadata', async () => {
    const response = await request({
      peerAddress: '10.0.0.2',
      forwardedProto: 'https, http',
      forwardedHost: 'public.example, attacker.example',
    });

    expect(await response.text()).toBe('http://timemark.test');
  });

  it('uses configured WebAuthn origin over request-supplied origin', async () => {
    process.env.WEBAUTHN_ORIGIN = 'https://fixed.example';
    const response = await request({
      peerAddress: '203.0.113.10',
      origin: 'https://request.example',
      referer: 'https://referer.example/path',
    });

    expect(await response.text()).toBe('https://fixed.example');
  });
});

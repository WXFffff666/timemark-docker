import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { httpsEnforcement } from '../middleware/https-enforcement.js';
import { securityHeaders } from '../middleware/security-headers.js';
import { setAuthCookies } from '../utils/auth-cookies.js';

const envKeys = ['NODE_ENV', 'VERCEL', 'TRUSTED_PROXIES', 'ALLOW_INSECURE_HTTP'] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

const app = new Hono();
app.use('*', securityHeaders);
app.use('*', httpsEnforcement);
app.get('/cookie', (c) => {
  setAuthCookies(c, 'unit-test-access-token', 'unit-test-refresh-token', false);
  return c.text('ok');
});
app.get('/', (c) => c.text('ok'));

function request(
  url: string,
  options: { peerAddress?: string; encrypted?: boolean; forwardedProto?: string } = {},
) {
  const headers = new Headers();
  if (options.forwardedProto) headers.set('x-forwarded-proto', options.forwardedProto);
  const env = {
    incoming: {
      socket: {
        remoteAddress: options.peerAddress ?? '203.0.113.10',
        remotePort: 12345,
        remoteFamily: options.peerAddress?.includes(':') ? 'IPv6' : 'IPv4',
        encrypted: options.encrypted ?? false,
      },
    },
  };
  return app.request(url, { headers }, env as any);
}

beforeEach(() => {
  process.env.NODE_ENV = 'production';
  delete process.env.VERCEL;
  process.env.TRUSTED_PROXIES = '10.0.0.0/8';
  delete process.env.ALLOW_INSECURE_HTTP;
});

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('HTTPS enforcement and auth cookies', () => {
  it('rejects direct production HTTP when no forwarded protocol is present', async () => {
    const response = await request('http://timemark.test/');

    expect(response.status).toBe(403);
  });

  it('does not accept an HTTPS header from an untrusted peer', async () => {
    const response = await request('http://timemark.test/', {
      peerAddress: '203.0.113.10',
      forwardedProto: 'https',
    });

    expect(response.status).toBe(403);
    expect(response.headers.has('strict-transport-security')).toBe(false);
    expect(response.headers.get('content-security-policy')).not.toContain('upgrade-insecure-requests');
  });

  it('accepts HTTPS reported by a configured proxy and marks auth cookies Secure', async () => {
    const response = await request('http://timemark.test/cookie', {
      peerAddress: '10.0.0.2',
      forwardedProto: 'https',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(response.headers.has('strict-transport-security')).toBe(true);
    expect(response.headers.get('content-security-policy')).toContain('upgrade-insecure-requests');
  });

  it('rejects ambiguous multi-value forwarded protocol from a trusted proxy', async () => {
    const response = await request('http://timemark.test/', {
      peerAddress: '10.0.0.2',
      forwardedProto: 'https, http',
    });

    expect(response.status).toBe(403);
  });

  it('allows HTTP only when explicitly enabled and leaves cookies non-Secure', async () => {
    process.env.ALLOW_INSECURE_HTTP = 'true';

    const response = await request('http://timemark.test/cookie');

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('marks cookies Secure for a directly encrypted request', async () => {
    const response = await request('https://timemark.test/cookie', { encrypted: true });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });
});

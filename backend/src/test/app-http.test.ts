import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

const envKeys = ['NODE_ENV', 'VERCEL', 'TRUSTED_PROXIES', 'ALLOW_INSECURE_HTTP', 'CORS_ORIGIN'] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

type RequestOptions = { protocol?: 'http' | 'https'; method?: string; origin?: string; preflightMethod?: string };

function request(path: string, options: RequestOptions = {}) {
  const protocol = options.protocol || 'http';
  return createApp().request(
    `${protocol}://timemark.test${path}`,
    {
      method: options.method,
      headers: {
        'user-agent': 'Mozilla/5.0',
        ...(options.origin ? { Origin: options.origin } : {}),
        ...(options.preflightMethod ? { 'Access-Control-Request-Method': options.preflightMethod } : {}),
      },
    },
    {
      incoming: {
        socket: {
          remoteAddress: '203.0.113.10',
          remotePort: 12345,
          remoteFamily: 'IPv4',
          encrypted: protocol === 'https',
        },
      },
    } as any,
  );
}

beforeEach(() => {
  process.env.NODE_ENV = 'production';
  delete process.env.VERCEL;
  process.env.TRUSTED_PROXIES = '10.0.0.0/8';
  delete process.env.ALLOW_INSECURE_HTTP;
  delete process.env.CORS_ORIGIN;
});

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('application HTTPS enforcement', () => {
  it('blocks cleartext requests before the frontend UI is served', async () => {
    const response = await request('/');

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('keeps the health endpoint available over HTTP for container checks', async () => {
    const response = await request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('allows CORS for an exact same-origin request', async () => {
    const response = await request('/__cors-probe', {
      protocol: 'https',
      method: 'OPTIONS',
      origin: 'https://timemark.test',
      preflightMethod: 'POST',
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('https://timemark.test');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('rejects same-host CORS origins with a different port', async () => {
    const response = await request('/__cors-probe', {
      protocol: 'https',
      method: 'OPTIONS',
      origin: 'https://timemark.test:8443',
      preflightMethod: 'POST',
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects same-host CORS origins with a different scheme', async () => {
    const response = await request('/__cors-probe', {
      protocol: 'https',
      method: 'OPTIONS',
      origin: 'http://timemark.test',
      preflightMethod: 'POST',
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects unsafe requests from same-host origins with a different scheme', async () => {
    const response = await request('/__csrf-probe', {
      protocol: 'https',
      method: 'POST',
      origin: 'http://timemark.test',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'Origin not allowed' });
  });

  it('does not log bearer tokens embedded in request paths', async () => {
    const token = 'test-only-calendar-feed-token';
    const logs: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    try {
      await request(`/api/calendar/feed/${token}.ics`);
      expect(logs.join('\n')).not.toContain(token);
    } finally {
      log.mockRestore();
    }
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { getConfiguredOrigins, isAllowedOrigin } from '../utils/allowed-origins.js';

const originalCorsOrigin = process.env.CORS_ORIGIN;

afterEach(() => {
  if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = originalCorsOrigin;
});

describe('credentialed CORS origin allowlist', () => {
  it('does not turn a mixed explicit list into an allow-all list', () => {
    process.env.CORS_ORIGIN = 'https://trusted.example,*';

    const allowedOrigins = getConfiguredOrigins();

    expect(allowedOrigins).not.toContain('*');
    expect(isAllowedOrigin('https://attacker.example', 'https://app.example', allowedOrigins)).toBe(false);
    expect(isAllowedOrigin('https://trusted.example', 'https://app.example', allowedOrigins)).toBe(true);
  });

  it('never treats a wildcard entry as credentialed origin authorization', () => {
    expect(isAllowedOrigin('https://attacker.example', 'https://app.example', ['*'])).toBe(false);
  });

  it('ignores wildcard subdomain entries in the configured allowlist', () => {
    process.env.CORS_ORIGIN = '*.example.com,https://trusted.example.com,https://path.example.com/calendar,null';

    const allowedOrigins = getConfiguredOrigins();

    expect(allowedOrigins).not.toContain('*.example.com');
    expect(allowedOrigins).not.toContain('https://path.example.com');
    expect(allowedOrigins).not.toContain('null');
    expect(isAllowedOrigin('https://trusted.example.com', 'https://app.example', allowedOrigins)).toBe(true);
    expect(isAllowedOrigin('https://attacker.example.com', 'https://app.example', allowedOrigins)).toBe(false);
  });

  it('requires the scheme, host, and port to match for same-host authorization', () => {
    expect(isAllowedOrigin('https://app.example:8443', 'https://app.example:8443', [])).toBe(true);
    expect(isAllowedOrigin('http://app.example:8443', 'https://app.example:8443', [])).toBe(false);
    expect(isAllowedOrigin('https://app.example:9443', 'https://app.example:8443', [])).toBe(false);
  });

  it('does not authorize wildcard subdomains for credentialed CORS', () => {
    expect(isAllowedOrigin('https://trusted.example.com', 'https://app.example', ['*.example.com'])).toBe(false);
    expect(isAllowedOrigin('http://trusted.example.com:8080', 'https://app.example', ['*.example.com'])).toBe(false);
  });
});

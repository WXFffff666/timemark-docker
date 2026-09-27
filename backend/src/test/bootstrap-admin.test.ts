import { describe, expect, it } from 'vitest';
import { resolveInitialAdminCredentials } from '../utils/initial-admin.js';

describe('resolveInitialAdminCredentials', () => {
  it('requires an explicit password for first-run admin creation', () => {
    expect(() => resolveInitialAdminCredentials({ DEFAULT_ADMIN_USERNAME: 'admin' }))
      .toThrow('DEFAULT_ADMIN_PASSWORD');
  });

  it('uses the configured username and password', () => {
    expect(resolveInitialAdminCredentials({
      DEFAULT_ADMIN_USERNAME: 'owner',
      DEFAULT_ADMIN_PASSWORD: 'unit-test-only-password',
    })).toEqual({
      username: 'owner',
      password: 'unit-test-only-password',
    });
  });

  it('defaults only the username, never the password', () => {
    expect(resolveInitialAdminCredentials({
      DEFAULT_ADMIN_PASSWORD: 'unit-test-only-password',
    })).toEqual({
      username: 'admin',
      password: 'unit-test-only-password',
    });
  });

  it('rejects a password that cannot pass the login schema', () => {
    expect(() => resolveInitialAdminCredentials({ DEFAULT_ADMIN_PASSWORD: 'short' })).toThrow();
  });

  it('rejects usernames outside the login schema length range', () => {
    expect(() => resolveInitialAdminCredentials({
      DEFAULT_ADMIN_USERNAME: 'ab',
      DEFAULT_ADMIN_PASSWORD: 'unit-test-only-password',
    })).toThrow();
    expect(() => resolveInitialAdminCredentials({
      DEFAULT_ADMIN_USERNAME: 'u'.repeat(51),
      DEFAULT_ADMIN_PASSWORD: 'unit-test-only-password',
    })).toThrow();
  });
});

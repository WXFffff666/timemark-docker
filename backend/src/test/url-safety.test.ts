import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

import { isSafePublicUrl } from '../utils/url-safety.js';

beforeEach(() => {
  lookupMock.mockReset().mockResolvedValue([]);
});

describe('isSafePublicUrl IPv6 handling', () => {
  it.each([
    'http://[::1]:3000/',
    'http://[::]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[2001:db8::1]/',
    'http://[2001:2::1]/',
    'http://[2d00::1]/',
    'http://[2e00::1]/',
    'http://[3000::1]/',
    'http://[3800::1]/',
    'http://[3c00::1]/',
    'http://[3e00::1]/',
    'http://[3f00::1]/',
    'http://[3ffe::1]/',
    'http://[3fff::1]/',
    'http://[64:ff9b::a9fe:a9fe]/',
    'http://[64:ff9b:1::a9fe:a9fe]/',
    'http://[2002:a9fe:a9fe::]/',
  ])('rejects non-public IPv6 URL %s', async (url) => {
    await expect(isSafePublicUrl(url)).resolves.toMatchObject({ safe: false });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to IPv6 loopback', async () => {
    lookupMock.mockResolvedValue([{ address: '::1', family: 6 }]);

    await expect(isSafePublicUrl('https://calendar.example/events.ics'))
      .resolves.toMatchObject({ safe: false });
  });

  it('continues to allow a hostname resolving to a public IPv6 address', async () => {
    lookupMock.mockResolvedValue([{ address: '2606:4700:4700::1111', family: 6 }]);

    await expect(isSafePublicUrl('https://calendar.example/events.ics'))
      .resolves.toMatchObject({ safe: true });
  });

  it('rejects an unallocated address inside the global-unicast prefix', async () => {
    await expect(isSafePublicUrl('https://[2500::1]/'))
      .resolves.toMatchObject({ safe: false });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it.each(['2001:4860::1', '2410::1'])('allows an IANA-allocated IPv6 literal %s', async (address) => {
    await expect(isSafePublicUrl(`https://[${address}]/`))
      .resolves.toMatchObject({ safe: true });
  });

  it.each([
    '2001:1::1',
    '2001:1::2',
    '2001:1::3',
    '2001:3::1',
    '2001:4:112::1',
    '2001:20::1',
    '2001:30::1',
  ])('allows globally reachable IANA special-purpose IPv6 %s', async (address) => {
    await expect(isSafePublicUrl(`https://[${address}]/`))
      .resolves.toMatchObject({ safe: true });
  });

  it('fails closed when DNS lookup fails', async () => {
    lookupMock.mockRejectedValue(new Error('DNS unavailable'));

    await expect(isSafePublicUrl('https://calendar.example/events.ics'))
      .resolves.toMatchObject({ safe: false });
  });

  it('fails closed when DNS returns no addresses', async () => {
    lookupMock.mockResolvedValue([]);

    await expect(isSafePublicUrl('https://calendar.example/events.ics'))
      .resolves.toMatchObject({ safe: false });
  });
});

describe('isSafePublicUrl IPv4 special-use handling', () => {
  it.each([
    'http://0.0.0.1/',
    'http://100.100.100.200/',
    'http://192.0.2.10/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://240.0.0.1/',
  ])('rejects non-public IPv4 URL %s', async (url) => {
    await expect(isSafePublicUrl(url)).resolves.toMatchObject({ safe: false });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects a hostname when any answer is in shared address space', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '100.100.100.200', family: 4 },
    ]);

    await expect(isSafePublicUrl('https://calendar.example/events.ics'))
      .resolves.toMatchObject({ safe: false });
  });
});

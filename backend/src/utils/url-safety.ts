import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain']);

const BLOCKED_IPV4 = new BlockList();
const BLOCKED_IPV6 = new BlockList();
const ALLOCATED_IPV6 = new BlockList();
const GLOBALLY_REACHABLE_SPECIAL_IPV6 = new BlockList();

// Mirrors the IANA allocation table (last updated 2025-10-10); unlisted 2000::/3 space is reserved.
const IANA_ALLOCATED_IPV6_SUBNETS: Array<[string, number]> = [
  ['2001::', 23],
  ['2001:200::', 23],
  ['2001:400::', 23],
  ['2001:600::', 23],
  ['2001:800::', 22],
  ['2001:c00::', 23],
  ['2001:e00::', 23],
  ['2001:1200::', 23],
  ['2001:1400::', 22],
  ['2001:1800::', 23],
  ['2001:1a00::', 23],
  ['2001:1c00::', 22],
  ['2001:2000::', 19],
  ['2001:4000::', 23],
  ['2001:4200::', 23],
  ['2001:4400::', 23],
  ['2001:4600::', 23],
  ['2001:4800::', 23],
  ['2001:4a00::', 23],
  ['2001:4c00::', 23],
  ['2001:5000::', 20],
  ['2001:8000::', 19],
  ['2001:a000::', 20],
  ['2001:b000::', 20],
  ['2002::', 16],
  ['2003::', 18],
  ['2400::', 12],
  ['2410::', 12],
  ['2600::', 12],
  ['2610::', 23],
  ['2620::', 23],
  ['2630::', 12],
  ['2800::', 12],
  ['2a00::', 12],
  ['2a10::', 12],
  ['2c00::', 12],
];

for (const [subnet, prefix] of IANA_ALLOCATED_IPV6_SUBNETS) {
  ALLOCATED_IPV6.addSubnet(subnet, prefix, 'ipv6');
}

// More-specific IANA special-purpose assignments that remain globally reachable.
for (const [subnet, prefix] of [
  ['2001:1::1', 128],
  ['2001:1::2', 128],
  ['2001:1::3', 128],
  ['2001:3::', 32],
  ['2001:4:112::', 48],
  ['2001:20::', 28],
  ['2001:30::', 28],
] as const) {
  GLOBALLY_REACHABLE_SPECIAL_IPV6.addSubnet(subnet, prefix, 'ipv6');
}

const BLOCKED_IPV4_SUBNETS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

for (const [subnet, prefix] of BLOCKED_IPV4_SUBNETS) {
  BLOCKED_IPV4.addSubnet(subnet, prefix, 'ipv4');
}

// Deny non-routable and IANA-reserved prefixes within IPv6 global unicast space.
for (const [subnet, prefix] of [
  ['2001::', 23], // Other IETF protocol assignments are blocked; global exceptions are handled above.
  ['2001:db8::', 32],
  ['2002::', 16],
  ['2d00::', 8],
  ['2e00::', 7],
  ['3000::', 5],
  ['3800::', 6],
  ['3c00::', 7],
  ['3e00::', 8],
  ['3f00::', 8],
] as const) {
  BLOCKED_IPV6.addSubnet(subnet, prefix, 'ipv6');
}

function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return BLOCKED_IPV4.check(ip, 'ipv4');
  if (family === 6) {
    if (!ALLOCATED_IPV6.check(ip, 'ipv6')) return true;
    if (GLOBALLY_REACHABLE_SPECIAL_IPV6.check(ip, 'ipv6')) return false;
    return BLOCKED_IPV6.check(ip, 'ipv6');
  }
  return false;
}

export type SafePublicUrlResolution =
  | {
      safe: true;
      url: URL;
      host: string;
      addresses: Array<{ address: string; family: 4 | 6 }>;
    }
  | { safe: false; reason: string };

/** Resolve and validate a public URL. The returned addresses can pin the later connection. */
export async function resolveSafePublicUrl(raw: string): Promise<SafePublicUrlResolution> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { safe: false, reason: 'Only http/https allowed' };
  }
  const hostname = parsed.hostname.toLowerCase();
  const host = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return { safe: false, reason: 'Private host blocked' };
  }

  if (isBlockedIp(host)) {
    return { safe: false, reason: 'Non-public IP blocked' };
  }

  if (isIP(host)) return { safe: true, url: parsed, host, addresses: [] };

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0) {
      return { safe: false, reason: 'Hostname did not resolve to an address' };
    }
    for (const r of records) {
      const family = isIP(r.address);
      if (family !== 4 && family !== 6) {
        return { safe: false, reason: 'Hostname resolved to an invalid IP address' };
      }
      if (isBlockedIp(r.address)) {
        return { safe: false, reason: 'Resolves to non-public IP' };
      }
    }
    return {
      safe: true,
      url: parsed,
      host,
      addresses: records.map((record) => ({
        address: record.address,
        family: record.family as 4 | 6,
      })),
    };
  } catch {
    return { safe: false, reason: 'Hostname DNS resolution failed' };
  }
}

/** Block SSRF-prone avatar / webhook URLs on public deployment. */
export async function isSafePublicUrl(raw: string): Promise<{ safe: boolean; reason?: string }> {
  const result = await resolveSafePublicUrl(raw);
  return result.safe ? { safe: true } : { safe: false, reason: result.reason };
}

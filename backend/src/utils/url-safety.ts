import { lookup } from 'node:dns/promises';

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1] || '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('169.254.') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  return false;
}

/** Block SSRF-prone avatar / webhook URLs on public deployment. */
export async function isSafePublicUrl(raw: string): Promise<{ safe: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { safe: false, reason: 'Only http/https allowed' };
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return { safe: false, reason: 'Private host blocked' };
  }

  if (isPrivateIp(host)) {
    return { safe: false, reason: 'Private IP blocked' };
  }

  try {
    const records = await lookup(host, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        return { safe: false, reason: 'Resolves to private IP' };
      }
    }
  } catch {
    // DNS lookup may fail for some CDNs — allow if host looks public
  }

  return { safe: true };
}

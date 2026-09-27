import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { BlockList, isIP } from 'node:net';

type ProxyBlockLists = {
  source: string;
  ipv4: BlockList;
  ipv6: BlockList;
  mappedIpv6: BlockList;
};

type NodeIncoming = {
  socket?: {
    remoteAddress?: string;
    encrypted?: boolean;
  };
};

type NodeBindings = {
  incoming?: NodeIncoming;
  server?: { incoming?: NodeIncoming };
};

let cachedProxyLists: ProxyBlockLists | undefined;

function normalizeIp(raw: string | undefined): string | null {
  let ip = raw?.trim() || '';
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (ip.toLowerCase().startsWith('::ffff:')) {
    const mappedIpv4 = ip.slice(7);
    if (isIP(mappedIpv4) === 4) ip = mappedIpv4;
  }
  return isIP(ip) ? ip : null;
}

function getProxyBlockLists(source: string): ProxyBlockLists {
  if (cachedProxyLists?.source === source) return cachedProxyLists;

  const lists: ProxyBlockLists = {
    source,
    ipv4: new BlockList(),
    ipv6: new BlockList(),
    mappedIpv6: new BlockList(),
  };

  for (const entry of source.split(',')) {
    const parts = entry.trim().split('/');
    if (parts.length > 2) continue;
    const address = normalizeIp(parts[0]);
    if (!address) continue;

    const family = isIP(address);
    const maxPrefix = family === 4 ? 32 : 128;
    const prefix = parts.length === 1 ? maxPrefix : Number(parts[1]);
    if (!Number.isInteger(prefix) || prefix <= 0 || prefix > maxPrefix) continue;

    try {
      if (family === 4) {
        lists.ipv4.addSubnet(address, prefix, 'ipv4');
        lists.mappedIpv6.addSubnet(`::ffff:${address}`, 96 + prefix, 'ipv6');
      } else {
        lists.ipv6.addSubnet(address, prefix, 'ipv6');
      }
    } catch {
      // Ignore malformed proxy ranges; they must never widen the trust boundary.
    }
  }

  cachedProxyLists = lists;
  return lists;
}

export function isTrustedProxyAddress(
  address: string | undefined,
  trustedProxyCidrs = process.env.TRUSTED_PROXIES || '',
): boolean {
  const ip = normalizeIp(address);
  if (!ip) return false;

  const lists = getProxyBlockLists(trustedProxyCidrs);
  const family = isIP(ip);
  if (family === 4) return lists.ipv4.check(ip, 'ipv4');
  return lists.ipv6.check(ip, 'ipv6') || lists.mappedIpv6.check(ip, 'ipv6');
}

function resolveForwardedChain(
  raw: string,
  peer: string,
  trustedProxyCidrs: string,
): string | null {
  const chain = raw.split(',').map(normalizeIp);
  if (!chain.length || chain.some((address) => !address)) return null;

  const addresses = [...(chain as string[]), peer];
  for (let i = addresses.length - 1; i >= 0; i--) {
    if (!isTrustedProxyAddress(addresses[i], trustedProxyCidrs)) return addresses[i];
  }
  return null;
}

export type ClientIpInfo = {
  ip: string;
  /** Resolved from headers supplied by a configured trusted proxy. */
  trusted: boolean;
};

export function resolveClientIpInfo(
  peerAddress: string | undefined,
  headers: Pick<Headers, 'get'>,
  trustedProxyCidrs = process.env.TRUSTED_PROXIES || '',
): ClientIpInfo {
  const peer = normalizeIp(peerAddress) || '127.0.0.1';
  if (!isTrustedProxyAddress(peer, trustedProxyCidrs)) {
    return { ip: peer, trusted: false };
  }

  const cfIp = normalizeIp(headers.get('cf-connecting-ip') || undefined);
  if (cfIp) return { ip: cfIp, trusted: true };

  const vercelForwarded = headers.get('x-vercel-forwarded-for');
  if (vercelForwarded) {
    const ip = resolveForwardedChain(vercelForwarded, peer, trustedProxyCidrs);
    if (ip) return { ip, trusted: true };
  }

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ip = resolveForwardedChain(forwardedFor, peer, trustedProxyCidrs);
    if (ip) return { ip, trusted: true };
  }

  const realIp = normalizeIp(headers.get('x-real-ip') || undefined);
  if (realIp) return { ip: realIp, trusted: true };

  return { ip: peer, trusted: false };
}

function getNodeIncoming(c: Context): NodeIncoming | undefined {
  const env = c.env as unknown as NodeBindings;
  return env?.server?.incoming ?? env?.incoming;
}

function getPeerAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return getNodeIncoming(c)?.socket?.remoteAddress;
  }
}

export function isRequestHttps(c: Context): boolean {
  const peerAddress = getPeerAddress(c);
  const forwardedProto = c.req.header('x-forwarded-proto')?.trim().toLowerCase();

  if (isTrustedProxyAddress(peerAddress) && forwardedProto) {
    return !forwardedProto.includes(',') && forwardedProto === 'https';
  }

  const directEncrypted = getNodeIncoming(c)?.socket?.encrypted;
  if (typeof directEncrypted === 'boolean') return directEncrypted;
  if (forwardedProto) return false;

  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Build a request origin without trusting forwarding headers from unconfigured peers. */
export function getRequestOrigin(c: Context): string {
  let requestUrl: URL;
  try {
    requestUrl = new URL(c.req.url);
  } catch {
    return 'http://localhost';
  }

  const protocol = isRequestHttps(c) ? 'https:' : 'http:';
  const peerAddress = getPeerAddress(c);
  const trustedProxy = isTrustedProxyAddress(peerAddress);
  const forwardedProto = c.req.header('x-forwarded-proto')?.trim().toLowerCase();
  const forwardedHost = c.req.header('x-forwarded-host')?.trim();
  const forwardedHostIsUsable = trustedProxy
    && (!forwardedProto || forwardedProto === 'http' || forwardedProto === 'https')
    && !!forwardedHost
    && !forwardedHost.includes(',');

  const candidates = [
    forwardedHostIsUsable ? forwardedHost : undefined,
    c.req.header('host')?.trim(),
    requestUrl.host,
  ];

  for (const host of candidates) {
    if (!host || host.includes(',')) continue;
    try {
      const origin = new URL(`${protocol}//${host}`);
      if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) continue;
      return origin.origin;
    } catch {
      // Try the next source; malformed forwarding data must not be reflected.
    }
  }

  return requestUrl.origin;
}

/** Only configured proxy peers may supply client-IP headers. */
export function getClientIpInfo(c: Context): ClientIpInfo {
  return resolveClientIpInfo(getPeerAddress(c), c.req.raw.headers);
}

export function getClientIp(c: Context): string {
  return getClientIpInfo(c).ip;
}

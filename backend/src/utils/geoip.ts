const cache = new Map<string, { label: string; expires: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;
// 上限防止登录历史页对大量陌生 IP 刷查询时缓存无限增长
const CACHE_MAX = 5000;

export async function lookupGeoLabel(ip: string): Promise<string> {
  if (!ip || ip === '127.0.0.1' || ip === '::1') return '本地';
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) return '内网';
  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.label;
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city&lang=zh-CN`, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as { status?: string; country?: string; regionName?: string; city?: string };
    if (data.status !== 'success') return '未知';
    const label = [data.country, data.regionName, data.city].filter(Boolean).join(' ') || '未知';
    if (cache.size >= CACHE_MAX) {
      // 简单过期清理；仍超限则丢弃最旧条目
      const now = Date.now();
      for (const [k, v] of cache) {
        if (v.expires <= now) cache.delete(k);
      }
      while (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
    }
    cache.set(ip, { label, expires: Date.now() + TTL_MS });
    return label;
  } catch {
    return '未知';
  }
}

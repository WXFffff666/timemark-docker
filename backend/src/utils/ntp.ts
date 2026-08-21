/**
 * 网络时间校准：按 IANA 时区拉取权威时间，Cron 提醒与双历校验共用。
 * 默认 Asia/Shanghai；用户切换时区后，后续校准跟随该时区。
 */

export const DEFAULT_SYNC_TIMEZONE = 'Asia/Shanghai';

const MAX_TIME_DRIFT = 5 * 60 * 1000;
const SYNC_TTL_MS = 5 * 60 * 1000;

interface TimezoneCacheEntry {
  offsetMs: number;
  lastSyncAt: number;
  result: TimeSyncResult;
}

const cacheByTimezone = new Map<string, TimezoneCacheEntry>();

export interface TimeSyncResult {
  success: boolean;
  timeZone: string;
  currentTime: Date;
  serverTime?: Date;
  todayYmd?: string;
  localTimeHHmm?: string;
  drift?: number;
  source: string;
  message: string;
}

function normalizeTimeZone(timeZone?: string): string {
  const tz = (timeZone || DEFAULT_SYNC_TIMEZONE).trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_SYNC_TIMEZONE;
  }
}

export function formatTodayYmd(now: Date, timeZone: string): string {
  return getTodayYmd(now, timeZone);
}

export function formatLocalHHmm(now: Date, timeZone: string): string {
  return getLocalHHmm(now, timeZone);
}

function getTodayYmd(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function getLocalHHmm(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

async function fetchMillisFromWorldTimeApi(timeZone: string): Promise<number | null> {
  try {
    const url = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(timeZone)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const data = await response.json() as { unixtime?: number; datetime?: string };
    if (typeof data.unixtime === 'number') return data.unixtime * 1000;
    if (data.datetime) return new Date(data.datetime).getTime();
    return null;
  } catch {
    return null;
  }
}

async function fetchMillisFromTimeApiIo(timeZone: string): Promise<number | null> {
  try {
    const url = `https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(timeZone)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const data = await response.json() as { dateTime?: string };
    return data.dateTime ? new Date(data.dateTime).getTime() : null;
  } catch {
    return null;
  }
}

async function queryAuthoritativeTime(timeZone: string): Promise<{ ts: number; source: string } | null> {
  const fetchers: Array<{ fn: () => Promise<number | null>; source: string }> = [
    { fn: () => fetchMillisFromWorldTimeApi(timeZone), source: 'worldtimeapi.org' },
    { fn: () => fetchMillisFromTimeApiIo(timeZone), source: 'timeapi.io' },
  ];

  const samples: Array<{ ts: number; source: string }> = [];
  await Promise.all(
    fetchers.map(async ({ fn, source }) => {
      const ts = await fn();
      if (ts) samples.push({ ts, source });
    }),
  );

  if (samples.length === 0) return null;
  samples.sort((a, b) => a.ts - b.ts);
  return samples[Math.floor(samples.length / 2)];
}

function getCache(timeZone: string): TimezoneCacheEntry | null {
  const entry = cacheByTimezone.get(timeZone);
  if (!entry) return null;
  if (Date.now() - entry.lastSyncAt > SYNC_TTL_MS) return null;
  return entry;
}

export function getClockOffsetMs(timeZone?: string): number {
  const tz = normalizeTimeZone(timeZone);
  return getCache(tz)?.offsetMs ?? cacheByTimezone.get(tz)?.offsetMs ?? 0;
}

export function getSyncedNow(timeZone?: string): Date {
  const offset = getClockOffsetMs(timeZone);
  return new Date(Date.now() + offset);
}

export function getLastTimeSyncResult(timeZone?: string): TimeSyncResult | null {
  const tz = normalizeTimeZone(timeZone);
  return getCache(tz)?.result ?? cacheByTimezone.get(tz)?.result ?? null;
}

/** 后台刷新，不阻塞请求 */
export function scheduleTimeSync(timeZone?: string): void {
  void syncTime(timeZone).catch(() => {});
}

export async function syncTime(timeZone?: string, options?: { force?: boolean }): Promise<TimeSyncResult> {
  const tz = normalizeTimeZone(timeZone);
  if (!options?.force) {
    const cached = getCache(tz);
    if (cached) return cached.result;
  }

  const currentTime = new Date();
  const currentTimestamp = Date.now();
  const authoritative = await queryAuthoritativeTime(tz);

  if (!authoritative) {
    const synced = new Date(currentTimestamp + getClockOffsetMs(tz));
    const result: TimeSyncResult = {
      success: true,
      timeZone: tz,
      currentTime,
      serverTime: synced,
      todayYmd: getTodayYmd(synced, tz),
      localTimeHHmm: getLocalHHmm(synced, tz),
      source: 'system',
      message: 'Using cached/system time (network time sources unavailable)',
    };
    const entry = cacheByTimezone.get(tz);
    if (entry) {
      entry.lastSyncAt = Date.now();
      entry.result = result;
    } else {
      cacheByTimezone.set(tz, { offsetMs: 0, lastSyncAt: Date.now(), result });
    }
    return result;
  }

  const drift = authoritative.ts - currentTimestamp;
  const synced = new Date(authoritative.ts);
  const result: TimeSyncResult = {
    success: true,
    timeZone: tz,
    currentTime,
    serverTime: synced,
    todayYmd: getTodayYmd(synced, tz),
    localTimeHHmm: getLocalHHmm(synced, tz),
    drift: Math.abs(drift),
    source: authoritative.source,
    message: Math.abs(drift) > MAX_TIME_DRIFT
      ? `Warning: Time drift of ${Math.round(Math.abs(drift) / 1000)}s detected`
      : 'Time synchronized successfully',
  };

  if (Math.abs(drift) > MAX_TIME_DRIFT) {
    console.warn(`[NTP] Time drift ${drift}ms (${tz}) from ${authoritative.source}`);
  }

  cacheByTimezone.set(tz, { offsetMs: drift, lastSyncAt: Date.now(), result });
  return result;
}

export async function getSyncedTimestamp(timeZone?: string): Promise<number> {
  const tz = normalizeTimeZone(timeZone);
  if (!getCache(tz)) {
    await syncTime(tz).catch(() => {});
  }
  return getSyncedNow(tz).getTime();
}

export async function checkTimeSync(timeZone?: string): Promise<void> {
  const result = await syncTime(timeZone, { force: true });
  console.log(`[NTP] ${result.timeZone}: ${result.message}`);
}

export async function scheduledTimeSync(timeZone?: string): Promise<void> {
  try {
    await checkTimeSync(timeZone);
  } catch (error) {
    console.error('[NTP] Scheduled sync failed:', error);
  }
}

export async function logTimeDriftIfNeeded(timeZone?: string): Promise<void> {
  const result = getLastTimeSyncResult(timeZone) ?? await syncTime(timeZone);
  if (!result.drift || result.drift <= MAX_TIME_DRIFT) return;
  console.warn(`[NTP] Significant drift ${result.drift}ms (${result.timeZone}) from ${result.source}`);
}

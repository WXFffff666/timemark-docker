import { api } from '@/lib/api';

export interface TimeSyncStatus {
  timeZone: string;
  serverNow: string;
  todayYmd: string;
  localTimeHHmm: string;
  clockOffsetMs: number;
  driftMs: number;
  source: string;
  message: string;
  calendarVerify: {
    ok: boolean;
    samples: Array<{ gregorian: string; ok: boolean }>;
  };
}

let clockOffsetMs = 0;
let lastSyncedTimezone = 'Asia/Shanghai';

export function getClientClockOffsetMs(): number {
  return clockOffsetMs;
}

export function getSyncedClientNow(): Date {
  return new Date(Date.now() + clockOffsetMs);
}

export async function refreshTimeSync(timezone: string, options?: { force?: boolean }): Promise<TimeSyncStatus> {
  const tz = timezone.trim() || 'Asia/Shanghai';
  const refresh = options?.force ? '&refresh=1' : '';
  const data = await api.get<TimeSyncStatus>(`/time/status?timezone=${encodeURIComponent(tz)}${refresh}`);
  clockOffsetMs = data.clockOffsetMs ?? 0;
  lastSyncedTimezone = data.timeZone || tz;
  return data;
}

export function getLastSyncedTimezone(): string {
  return lastSyncedTimezone;
}

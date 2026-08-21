/**
 * 事件下次发生日期（公历）—— 与前端倒计时、Cron 提醒共用
 */

/** 将 DB/API 的日期值规范为 YYYY-MM-DD（兼容 pg DATE → Date 对象） */
export function toYmdString(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

export function parseYmd(dateStr: string): { y: number; m: number; d: number } | null {
  const ymd = dateStr.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** UTC 日历日差：dateB - dateA（YYYY-MM-DD） */
export function diffCalendarDays(dateA: string, dateB: string): number {
  const a = new Date(dateA.slice(0, 10) + 'T00:00:00Z');
  const b = new Date(dateB.slice(0, 10) + 'T00:00:00Z');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function isYearlyOccurrenceEvent(
  eventType?: string,
  recurringConfig?: { enabled?: boolean; frequency?: string } | null,
): boolean {
  if (eventType === 'birthday' || eventType === 'anniversary') return true;
  return !!(recurringConfig?.enabled && recurringConfig.frequency === 'yearly');
}

/**
 * 将存储日期滚动到「不早于 today」的下次公历发生日。
 * 生日存 1990-07-28 时，在 2026 年应解析为 2026-07-28。
 */
export function resolveNextGregorianOccurrence(
  eventDate: string,
  todayYmd: string,
  options?: {
    eventType?: string;
    recurringConfig?: { enabled?: boolean; frequency?: string } | null;
    nextOccurrence?: string | Date | null;
  },
): string {
  const nextOcc = toYmdString(options?.nextOccurrence);
  if (nextOcc) {
    if (diffCalendarDays(todayYmd, nextOcc) >= 0) return nextOcc;
  }

  const normalizedEventDate = toYmdString(eventDate);
  const parts = normalizedEventDate ? parseYmd(normalizedEventDate) : null;
  if (!parts) return (normalizedEventDate ?? String(eventDate)).slice(0, 10);

  const yearly = isYearlyOccurrenceEvent(options?.eventType, options?.recurringConfig);
  if (!yearly) {
    return formatYmd(parts.y, parts.m, parts.d);
  }

  const todayParts = parseYmd(todayYmd);
  let year = todayParts?.y ?? parts.y;
  let candidate = formatYmd(year, parts.m, parts.d);

  if (diffCalendarDays(todayYmd, candidate) < 0) {
    candidate = formatYmd(year + 1, parts.m, parts.d);
  }

  return candidate;
}

/** 构建单次提醒发送的去重键（同一天、同一提前档位、同一时刻） */
export function buildReminderSendKey(todayYmd: string, daysUntil: number, reminderTime: string): string {
  return `${todayYmd}#d${daysUntil}#t${reminderTime}`;
}

/** Cron 每分钟执行：当前时刻是否在提醒时刻 ±windowMinutes 内 */
export function matchesReminderTimeWindow(
  currentHHmm: string,
  targetHHmm: string,
  windowMinutes = 2,
): boolean {
  const [ch, cm] = currentHHmm.split(':').map(Number);
  const [th, tm] = targetHHmm.split(':').map(Number);
  if ([ch, cm, th, tm].some((n) => Number.isNaN(n))) return false;
  const diff = Math.abs(ch * 60 + cm - (th * 60 + tm));
  return diff <= windowMinutes;
}

/** 在多个候选公历日中取「不早于 today」且最近的一天 */
export function pickSoonestOccurrenceOnOrAfter(todayYmd: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const ymd = c.slice(0, 10);
    const diff = diffCalendarDays(todayYmd, ymd);
    if (diff >= 0 && diff < bestDiff) {
      best = ymd;
      bestDiff = diff;
    }
  }
  return best;
}

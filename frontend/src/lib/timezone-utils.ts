/** Default timezone for personal deployment (Beijing). */
export const DEFAULT_TIMEZONE = 'Asia/Shanghai';

export interface TimezoneOption {
  value: string;
  label: string;
}

/** Full list for Settings — default first. */
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Asia/Shanghai', label: '中国标准时间 (UTC+8)' },
  { value: 'UTC', label: '世界标准时间 (UTC)' },
  { value: 'Asia/Tokyo', label: '日本标准时间 (UTC+9)' },
  { value: 'Asia/Singapore', label: '新加坡时间 (UTC+8)' },
  { value: 'Asia/Kolkata', label: '印度标准时间 (UTC+5:30)' },
  { value: 'Europe/London', label: '格林威治时间 (UTC+0)' },
  { value: 'Europe/Paris', label: '中欧时间 (UTC+1)' },
  { value: 'Europe/Moscow', label: '莫斯科时间 (UTC+3)' },
  { value: 'America/New_York', label: '美国东部时间 (UTC-5)' },
  { value: 'America/Chicago', label: '美国中部时间 (UTC-6)' },
  { value: 'America/Los_Angeles', label: '美国太平洋时间 (UTC-8)' },
  { value: 'Australia/Sydney', label: '澳大利亚东部时间 (UTC+10)' },
  { value: 'Pacific/Auckland', label: '新西兰时间 (UTC+12)' },
];

/** Quick switch on dashboard header. */
export const QUICK_TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Asia/Shanghai', label: '北京时间 (UTC+8)' },
  { value: 'UTC', label: '世界标准时间 (UTC)' },
  { value: 'America/New_York', label: '纽约时间 (EST)' },
  { value: 'Europe/London', label: '伦敦时间 (GMT)' },
  { value: 'Asia/Tokyo', label: '东京时间 (UTC+9)' },
];

export function getTodayDateKey(timeZone: string = DEFAULT_TIMEZONE, ref = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ref);
}

export function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value || '0', 10);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** UTC instant for YYYY-MM-DD HH:mm in the given IANA timezone. */
export function zonedYmdTimeToDate(
  ymd: string,
  hour: number,
  minute: number,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const targetY = parseInt(ymd.slice(0, 4), 10);
  const targetMo = parseInt(ymd.slice(5, 7), 10);
  const targetD = parseInt(ymd.slice(8, 10), 10);
  let guess = Date.UTC(targetY, targetMo - 1, targetD, hour, minute, 0);

  for (let i = 0; i < 6; i++) {
    const p = getZonedParts(new Date(guess), timeZone);
    const dayDiff = Math.round(
      (Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(targetY, targetMo - 1, targetD)) / 86_400_000,
    );
    const minuteDiff = p.hour * 60 + p.minute - (hour * 60 + minute);
    const correction = dayDiff * 1440 + minuteDiff;
    if (correction === 0) break;
    guess -= correction * 60_000;
  }

  return new Date(guess);
}

export function formatZonedLabel(timeZone: string): string {
  return (
    QUICK_TIMEZONE_OPTIONS.find((t) => t.value === timeZone)?.label
    || TIMEZONE_OPTIONS.find((t) => t.value === timeZone)?.label
    || timeZone
  );
}

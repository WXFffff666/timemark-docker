import type { Event, LunarDate } from '@timemark/shared';
import { Lunar } from 'lunar-javascript';
import {
  diffCalendarDays,
  pickSoonestOccurrenceOnOrAfter,
  resolveNextGregorianOccurrence,
} from '@timemark/shared/event-schedule';
import { DEFAULT_TIMEZONE, getTodayDateKey, zonedYmdTimeToDate } from './timezone-utils';

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @deprecated Prefer getTodayDateKey(timeZone) for user-configured timezone */
export function startOfLocalDay(ref: Date = new Date()): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseEventDate(dateStr: string): Date {
  const ymd = dateStr.slice(0, 10);
  return new Date(`${ymd}T00:00:00`);
}

/** 距事件还有多少天（0 = 今天，负数 = 已过期），基于用户时区日历日 */
export function daysUntilEvent(
  dateStr: string,
  ref = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): number {
  const today = getTodayDateKey(timeZone, ref);
  const target = dateStr.slice(0, 10);
  return diffCalendarDays(today, target);
}

/** 将农历月日滚动到不早于 today 的下次公历发生日 */
function resolveNextLunarOccurrence(
  lunarDate: LunarDate,
  todayYmd: string,
  refYear = new Date().getFullYear(),
): string | null {
  const month = lunarDate.isLeap ? -lunarDate.month : lunarDate.month;
  const candidates: string[] = [];
  for (const year of [refYear, refYear + 1]) {
    try {
      const solar = Lunar.fromYmd(year, month, lunarDate.day).getSolar();
      candidates.push(
        `${solar.getYear()}-${String(solar.getMonth()).padStart(2, '0')}-${String(solar.getDay()).padStart(2, '0')}`,
      );
    } catch {
      // invalid lunar date for this year
    }
  }
  return pickSoonestOccurrenceOnOrAfter(todayYmd, candidates);
}

/** 生日/纪念日等默认按年滚动；农历/双历取最近候选日 */
export function resolveNextOccurrenceDate(
  event: Event,
  ref = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const today = getTodayDateKey(timeZone, ref);
  const gregorian = resolveNextGregorianOccurrence(event.date, today, {
    eventType: event.type,
    recurringConfig: event.recurringConfig ?? null,
    nextOccurrence: event.nextOccurrence ?? null,
  });

  if (event.calendarType === 'gregorian' || !event.lunarDate) {
    return gregorian;
  }

  const refYear = Number.parseInt(today.slice(0, 4), 10);
  const lunarNext = resolveNextLunarOccurrence(event.lunarDate, today, refYear);

  if (event.calendarType === 'lunar') {
    return lunarNext ?? gregorian;
  }

  if (lunarNext) {
    return pickSoonestOccurrenceOnOrAfter(today, [gregorian, lunarNext]) ?? gregorian;
  }

  return gregorian;
}

/**
 * 倒计时目标时刻：下次事件日期 + 当天首个提醒时间（默认 00:00，按用户时区）
 */
export function getEventCountdownTarget(
  event: Event,
  ref = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): Date | null {
  const dateStr = resolveNextOccurrenceDate(event, ref, timeZone);
  const time = event.reminderConfig?.reminderTimes?.[0];
  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    return zonedYmdTimeToDate(dateStr, h, m, timeZone);
  }
  return zonedYmdTimeToDate(dateStr, 0, 0, timeZone);
}

export function diffToCountdownParts(target: Date, ref = new Date()): CountdownParts | null {
  const diff = target.getTime() - ref.getTime();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

export function isEventCountdownPast(
  event: Event,
  ref = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  const target = getEventCountdownTarget(event, ref, timeZone);
  if (!target) return true;
  return target.getTime() <= ref.getTime();
}

/**
 * 事件是否进入「待办」窗口：
 * 当距离事件日期 ≤ 提醒配置里最大的「提前 N 天」时显示（默认 7 天内）
 */
export function isEventInTodoWindow(
  event: Event,
  ref = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  if (event.reminderConfig?.enabled === false) return false;
  const days = daysUntilEvent(resolveNextOccurrenceDate(event, ref, timeZone), ref, timeZone);
  const list = event.reminderConfig?.daysBeforeList?.length
    ? event.reminderConfig.daysBeforeList
    : [7];
  const maxBefore = Math.max(...list, 0);
  return days >= 0 && days <= maxBefore;
}

export function todoCompletionKey(eventId: string | number, date: string): string {
  return `${eventId}:${date.slice(0, 10)}`;
}

export function buildCompletedSet(
  completions: Array<{ eventId: number; occurrenceDate: string }>,
): Set<string> {
  return new Set(completions.map((c) => todoCompletionKey(c.eventId, c.occurrenceDate)));
}

export function getTodoEvents(
  events: Event[],
  ref = new Date(),
  completedKeys?: Set<string>,
  timeZone: string = DEFAULT_TIMEZONE,
): Event[] {
  return events
    .filter((e) => isEventInTodoWindow(e, ref, timeZone))
    .filter((e) => !completedKeys?.has(todoCompletionKey(e.id, e.date)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function groupEventsByDate(events: Event[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>();
  for (const e of events) {
    const key = e.date.slice(0, 10);
    const list = map.get(key) || [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

const TYPE_LABELS: Record<string, string> = {
  birthday: '生日',
  anniversary: '纪念日',
  exam: '考试',
  holiday: '节日',
  meeting: '会议',
  deadline: '截止',
  travel: '出行',
  graduation: '毕业',
  wedding: '婚礼',
  medical: '医疗',
  other: '其他',
};

export function eventTypeLabel(type: string) {
  return TYPE_LABELS[type] || type;
}

/** 事件是否落在用户时区的「今天」 */
export function isEventToday(
  event: Event,
  ref = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  const today = getTodayDateKey(timeZone, ref);
  const next = resolveNextOccurrenceDate(event, ref, timeZone);
  return next === today;
}

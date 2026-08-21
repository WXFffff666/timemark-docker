import { query } from '../db/index.js';
import { Lunar, Solar } from 'lunar-javascript';
import {
  buildReminderSendKey,
  diffCalendarDays,
  matchesReminderTimeWindow,
  resolveNextGregorianOccurrence,
} from '@timemark/shared/event-schedule';
import { sendNotifications } from '../services/notifications/index.js';
import { refreshUserEventCache } from '../services/event-cache.service.js';
import { createLogger } from '../utils/logger.js';
import { recordEventTrigger } from '../services/trigger-log.service.js';
import { getSyncedNow, scheduleTimeSync, DEFAULT_SYNC_TIMEZONE } from '../utils/ntp.js';

const log = createLogger('tasks');
// Batch query replaces per-user getReminderSettings/getUserConfig calls

/** Get today's date string (YYYY-MM-DD) in the given timezone, robust on Alpine Linux */
function getTodayString(now: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // en-CA outputs YYYY-MM-DD
}

function parseJsonField<T>(raw: unknown): T | null {
  if (!raw) return null;
  try {
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
  } catch {
    return null;
  }
}

/** Resolve next gregorian occurrence for an event (YYYY-MM-DD date field) */
function resolveGregorianTarget(
  today: string,
  event: {
    date: string;
    type?: string;
    recurring_config?: unknown;
    next_occurrence?: string | null;
  },
  allDays: number[],
): { targetDate: Date; daysUntil: number } | null {
  const recurringConfig = parseJsonField<{ enabled?: boolean; frequency?: string }>(event.recurring_config);
  const nextOccurrence = resolveNextGregorianOccurrence(event.date, today, {
    eventType: event.type,
    recurringConfig,
    nextOccurrence: event.next_occurrence,
  });
  const diff = diffCalendarDays(today, nextOccurrence);
  if (diff >= 0 && allDays.includes(diff)) {
    return { targetDate: new Date(nextOccurrence + 'T00:00:00Z'), daysUntil: diff };
  }
  return null;
}

/** Resolve lunar date to next matching gregorian target within current/next lunar year */
function resolveLunarTarget(today: string, lunarDateRaw: unknown, allDays: number[], now: Date): Date | null {
  try {
    const lunarData = typeof lunarDateRaw === 'string' ? JSON.parse(lunarDateRaw) : lunarDateRaw;
    if (!lunarData?.month || !lunarData?.day) return null;

    const month = lunarData.isLeap ? -lunarData.month : lunarData.month;
    const currentYear = now.getFullYear();

    for (const year of [currentYear, currentYear + 1]) {
      const tryLunarDate = Lunar.fromYmd(year, month, lunarData.day);
      const trySolar = tryLunarDate.getSolar();
      const tryDateStr = `${trySolar.getYear()}-${String(trySolar.getMonth()).padStart(2, '0')}-${String(trySolar.getDay()).padStart(2, '0')}`;
      const diff = diffCalendarDays(today, tryDateStr);
      if (diff >= 0 && allDays.includes(diff)) {
        return new Date(tryDateStr + 'T00:00:00Z');
      }
    }
  } catch (error) {
    throw error;
  }
  return null;
}

/** Parse reminder_days_before from an event's JSON field, returns null if invalid */
function parseReminderDays(raw: any): number[] | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((n: any) => typeof n === 'number' && n >= 0)) {
      return parsed;
    }
  } catch { /* ignore parse errors */ }
  return null;
}

export async function sendReminders() {
  log.info('Checking reminders...');

  scheduleTimeSync(DEFAULT_SYNC_TIMEZONE);
  const now = getSyncedNow(DEFAULT_SYNC_TIMEZONE);

  // Batch load ALL user configs upfront to avoid N+1 queries
  const allUserConfigs = await query(
    `SELECT user_id, timezone, reminders_enabled, daily_check_time, days_before_list, reminder_emails 
     FROM user_configs`
  );
  const userConfigMap = new Map<number, any>();
  for (const row of allUserConfigs.rows) {
    userConfigMap.set(row.user_id, row);
  }

  // Caches derived from batch-loaded data
  const userReminderSettingsCache = new Map<number, number[]>();
  const userEnabledCache = new Map<number, boolean>();
  const userTimezoneCache = new Map<number, string>();

  // Pre-populate caches from batch data
  for (const [userId, config] of userConfigMap) {
    userTimezoneCache.set(userId, config.timezone || 'Asia/Shanghai');
    userEnabledCache.set(userId, config.reminders_enabled !== false);
    const daysList = config.days_before_list || [1, 3, 7];
    userReminderSettingsCache.set(userId, Array.isArray(daysList) ? daysList : [1, 3, 7]);
  }

  // Users with events but no user_configs row were previously skipped entirely by cron.
  const eventOwnerRows = await query(`SELECT DISTINCT user_id FROM events`);
  for (const row of eventOwnerRows.rows) {
    const userId = row.user_id as number;
    if (userConfigMap.has(userId)) continue;
    const defaults = { timezone: 'Asia/Shanghai', reminders_enabled: true, days_before_list: [1, 3, 7] };
    userConfigMap.set(userId, defaults);
    userTimezoneCache.set(userId, defaults.timezone);
    userEnabledCache.set(userId, true);
    userReminderSettingsCache.set(userId, defaults.days_before_list);
  }

  function getUserTimezone(userId: number): string {
    if (userTimezoneCache.has(userId)) return userTimezoneCache.get(userId)!;
    // User not in user_configs table - use defaults
    return 'Asia/Shanghai';
  }
  
  function getDaysBeforeList(userId: number, eventReminderDaysBefore: any): number[] {
    // 优先使用事件级别的 reminder_days_before
    const eventDays = parseReminderDays(eventReminderDaysBefore);
    if (eventDays) return eventDays;
    
    // 回退到用户级别的 days_before_list (already batch-loaded)
    if (userReminderSettingsCache.has(userId)) {
      return userReminderSettingsCache.get(userId)!;
    }
    return [1, 3, 7];
  }

  const enabledUserIds = [...userConfigMap.entries()]
    .filter(([, cfg]) => cfg.reminders_enabled !== false)
    .map(([id]) => id);

  const eventIdSet = new Set<number>();
  const allEventRows: any[] = [];

  if (enabledUserIds.length > 0) {
    const cacheRows = await query(
      `SELECT user_id, payload FROM event_reminder_cache
       WHERE user_id = ANY($1::int[]) AND expires_at > NOW()`,
      [enabledUserIds],
    );
    const cachedUserIds = new Set<number>();
    for (const row of cacheRows.rows) {
      cachedUserIds.add(row.user_id as number);
      const payload = row.payload;
      if (!Array.isArray(payload)) continue;
      for (const ev of payload) {
        const id = (ev as { id?: number }).id;
        if (id && !eventIdSet.has(id)) {
          eventIdSet.add(id);
          allEventRows.push(ev);
        }
      }
    }

    // 旧缓存可能只含 7 天窗口；补全年重复事件（生日等存历史年份）
    if (cachedUserIds.size > 0) {
      const supplemental = await query(
        `SELECT * FROM events WHERE user_id = ANY($1::int[])
         AND (
           type IN ('birthday', 'anniversary')
           OR (
             recurring_config IS NOT NULL
             AND recurring_config::jsonb->>'enabled' = 'true'
             AND recurring_config::jsonb->>'frequency' = 'yearly'
           )
         )`,
        [[...cachedUserIds]],
      );
      for (const ev of supplemental.rows) {
        if (!eventIdSet.has(ev.id)) {
          eventIdSet.add(ev.id);
          allEventRows.push(ev);
        }
      }
    }

    const uncachedUserIds = enabledUserIds.filter((id) => !cachedUserIds.has(id));
    if (uncachedUserIds.length > 0) {
      const fallback = await query('SELECT * FROM events WHERE user_id = ANY($1::int[])', [uncachedUserIds]);
      for (const ev of fallback.rows) {
        if (!eventIdSet.has(ev.id)) {
          eventIdSet.add(ev.id);
          allEventRows.push(ev);
        }
      }
      for (const userId of uncachedUserIds) {
        refreshUserEventCache(userId).catch((e) => log.warn({ userId, err: e }, 'Cache refresh failed'));
      }
    }

    const lunarRows = await query(
      `SELECT * FROM events WHERE user_id = ANY($1::int[])
       AND lunar_date IS NOT NULL
       AND calendar_type IN ('lunar', 'both')`,
      [enabledUserIds],
    );
    for (const ev of lunarRows.rows) {
      if (!eventIdSet.has(ev.id)) {
        eventIdSet.add(ev.id);
        allEventRows.push(ev);
      }
    }
  }
  
  // 筛选需要提醒的事件
  const eventsToRemind: Array<{
    id: number;
    user_id: number;
    name: string;
    date: string;
    lunar_date: any;
    calendar_type: string;
    notification_channels: string[];
    notification_account_ids: any;
    targetDate?: Date;
    daysUntil: number;
    matchedReminderTime: string;
  }> = [];
  
  for (const event of allEventRows) {
    // Check if user has reminders enabled (batch-loaded, default to true)
    if (!userEnabledCache.has(event.user_id)) {
      userEnabledCache.set(event.user_id, true); // Default: enabled
    }
    if (!userEnabledCache.get(event.user_id)) continue;

    // Get per-user timezone and calculate today's date in that timezone
    const timeZone = getUserTimezone(event.user_id);
    const today = getTodayString(now, timeZone);

    const calendarType = event.calendar_type;
    let eventTargetDate: Date | null = null;
    let matchedDaysUntil: number | null = null;
    
    // 获取此事件的提前提醒天数列表
    // 优先从 reminder_config.daysBeforeList 读取，回退到 reminder_days_before
    let daysBeforeList: number[] = [];
    const reminderConfig = parseJsonField<{
      enabled?: boolean;
      daysBeforeList?: number[];
      reminderTimes?: string[];
    }>(event.reminder_config);
    if (reminderConfig?.enabled === false) continue;
    if (reminderConfig?.daysBeforeList && reminderConfig.daysBeforeList.length > 0) {
      daysBeforeList = reminderConfig.daysBeforeList;
    }
    
    // 回退到 reminder_days_before 字段
    if (daysBeforeList.length === 0) {
      daysBeforeList = getDaysBeforeList(event.user_id, event.reminder_days_before);
    }
    
    // 包含 0 表示当天也提醒
    const allDays = daysBeforeList.includes(0) ? daysBeforeList : [0, ...daysBeforeList];
    
    try {
      if (calendarType === 'gregorian' || calendarType === 'both') {
        const gTarget = resolveGregorianTarget(today, event, allDays);
        if (gTarget) {
          eventTargetDate = gTarget.targetDate;
          matchedDaysUntil = gTarget.daysUntil;
        }
      }
      if ((calendarType === 'lunar' || calendarType === 'both') && event.lunar_date) {
        const lTarget = resolveLunarTarget(today, event.lunar_date, allDays, now);
        if (lTarget) {
          eventTargetDate = lTarget;
          if (matchedDaysUntil === null) {
            try {
              const lunarData = typeof event.lunar_date === 'string' ? JSON.parse(event.lunar_date) : event.lunar_date;
              const month = lunarData.isLeap ? -lunarData.month : lunarData.month;
              for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
                const tryLunarDate = Lunar.fromYmd(year, month, lunarData.day);
                const trySolar = tryLunarDate.getSolar();
                const tryDateStr = `${trySolar.getYear()}-${String(trySolar.getMonth()).padStart(2, '0')}-${String(trySolar.getDay()).padStart(2, '0')}`;
                const diff = diffCalendarDays(today, tryDateStr);
                if (diff >= 0 && allDays.includes(diff)) {
                  matchedDaysUntil = diff;
                  break;
                }
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (error) {
      log.error({ eventId: event.id, err: error }, 'Failed to parse lunar date');
      await recordEventTrigger(event.id, event.user_id, 'scheduled', today, 'failed', `Lunar date conversion failed: ${String(error)}`);
    }
    
    if (eventTargetDate) {
      // Check if current time matches any of the event's reminder times
      const currentHour = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        hour12: false
      }).format(now);
      const currentMinute = new Intl.DateTimeFormat('en-US', {
        timeZone,
        minute: '2-digit',
        hour12: false
      }).format(now);
      const currentTime = `${currentHour.padStart(2, '0')}:${currentMinute.padStart(2, '0')}`;
      
      let reminderTimes = reminderConfig?.reminderTimes?.length
        ? reminderConfig.reminderTimes
        : [];
      
      // Fallback to legacy reminder_time field
      if (reminderTimes.length === 0) {
        const eventReminderTime = event.reminder_time || '09:00';
        reminderTimes = [eventReminderTime];
      }
      
      // Debug logging
      const nextOccurrence = resolveNextGregorianOccurrence(event.date, today, {
        eventType: event.type,
        recurringConfig: parseJsonField(event.recurring_config),
        nextOccurrence: event.next_occurrence,
      });
      log.debug({
        eventId: event.id,
        name: event.name,
        date: event.date,
        nextOccurrence,
        today,
        diff: diffCalendarDays(today, nextOccurrence),
        allDays,
        reminderTimes,
        currentTime,
      }, 'Event check');
      
      let matchedReminderTime: string | null = null;
      const shouldRemind = reminderTimes.some((time) => {
        const match = matchesReminderTimeWindow(currentTime, time, 2);
        if (match) matchedReminderTime = time;
        return match;
      });
      
      if (!shouldRemind || !matchedReminderTime) {
        continue; // Skip - not the right time for this event
      }
      eventsToRemind.push({
        ...event,
        targetDate: eventTargetDate,
        daysUntil: matchedDaysUntil ?? 0,
        matchedReminderTime,
      });
    }
  }
  
  log.info({ count: eventsToRemind.length }, 'Events to remind');

  for (const event of eventsToRemind.slice(0, 50)) {
    const rawChannels = event.notification_channels;
    const baseChannels = typeof rawChannels === 'string' ? JSON.parse(rawChannels) : (rawChannels || []);
    const { resolveReminderChannels } = await import('../services/reminder-channel-resolver.service.js');
    const channels = await resolveReminderChannels(event.user_id, baseChannels, event.daysUntil ?? 0);
    if (channels.length > 0) {
      const timeZone = getUserTimezone(event.user_id);
      const today = getTodayString(now, timeZone);

      const sendKey = buildReminderSendKey(today, event.daysUntil ?? 0, event.matchedReminderTime);

      const claim = await query(
        `INSERT INTO reminder_send_claims (event_id, trigger_date) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING event_id`,
        [event.id, sendKey],
      );
      if (claim.rows.length === 0) {
        log.debug({ eventId: event.id, sendKey }, 'Reminder already claimed by another worker');
        continue;
      }

      const alreadySent = await query(
        `SELECT id FROM event_trigger_logs 
         WHERE event_id = $1 AND trigger_date = $2 AND status = 'success'
         LIMIT 1`,
        [event.id, sendKey],
      );
      if (alreadySent.rows.length > 0) {
        await query('DELETE FROM reminder_send_claims WHERE event_id = $1 AND trigger_date = $2', [event.id, sendKey]);
        log.debug({ eventId: event.id, sendKey }, 'Already sent for this slot, skipping');
        continue;
      }
      try {
        // Relationship mapping is handled inside sendNotifications() per-recipient
        const channelResults = await sendNotifications(event, event.user_id, channels);
        log.info({ eventId: event.id, channelResults }, 'Sent notifications');
        
        // Determine overall status from per-channel results
        const hasFailure = Object.values(channelResults).some(r => !r.success);
        const allFailed = Object.values(channelResults).every(r => !r.success);
        const status = allFailed && Object.keys(channelResults).length > 0 ? 'failed' : 'success';
        const errorMessage = hasFailure
          ? Object.entries(channelResults).filter(([, r]) => !r.success).map(([ch, r]) => `${ch}: ${r.error}`).join('; ')
          : undefined;
        
        // Build error details for failed channels
        const failedEntries = Object.entries(channelResults).filter(([, r]) => !r.success);
        const errorDetails = failedEntries.length > 0 ? {
          channel_type: failedEntries.map(([ch]) => ch).join(','),
          account_id: failedEntries[0][1].accountId,
          details: failedEntries.map(([ch, r]) => ({ channel: ch, error: r.error, accountId: r.accountId }))
        } : undefined;
        
        // 记录事件触发日志 - use timezone-aware today string for dedup consistency
        await recordEventTrigger(event.id, event.user_id, 'scheduled', sendKey, status, errorMessage, JSON.stringify(channelResults), errorDetails);
        if (status === 'success') {
          refreshUserEventCache(event.user_id).catch((e) => log.warn({ userId: event.user_id, err: e }, 'Post-send cache refresh failed'));
        }
      } catch (error) {
        log.error({ eventId: event.id, err: error }, 'Failed to send notifications');
        await query('DELETE FROM reminder_send_claims WHERE event_id = $1 AND trigger_date = $2', [event.id, sendKey]);
        await recordEventTrigger(event.id, event.user_id, 'scheduled', sendKey, 'failed', String(error));
      }
    }
  }
}

export async function githubBackup() {
  log.info('Backing up email logs...');
  const result = await query('SELECT COUNT(*) as count FROM email_logs');
  log.info({ count: result.rows[0].count }, 'Backed up email logs');
}

export async function archiveLoginHistory() {
  log.info('Archiving login history...');
  const result = await query('SELECT COUNT(*) as count FROM login_attempts');
  log.info({ count: result.rows[0].count }, 'Archived login attempts');
}

export async function cleanupSessions() {
  log.info('Cleaning up expired sessions...');
  const result = await query("DELETE FROM sessions WHERE expires_at < NOW()");
  log.info({ count: result.rowCount ?? 0 }, 'Cleaned up expired sessions');
  
  // 清理30天前的登录日志
  const loginLogsResult = await query(
    "DELETE FROM login_logs WHERE login_time < NOW() - INTERVAL '30 days'"
  );
  log.info({ count: loginLogsResult.rowCount ?? 0 }, 'Cleaned up old login logs');
  
  // 清理30天前的事件触发日志
  const triggerResult = await query(
    "DELETE FROM event_trigger_logs WHERE created_at < NOW() - INTERVAL '30 days'"
  );
  log.info({ count: triggerResult.rowCount ?? 0 }, 'Cleaned up old event trigger logs');
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

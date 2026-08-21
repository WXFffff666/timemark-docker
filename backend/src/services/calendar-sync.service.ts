import { query } from '../db/index.js';
import { createEvent } from './event.service.js';
import { parseIcsEvents } from '../utils/ics-parser.js';
import { isSafePublicUrl } from '../utils/url-safety.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('calendar-sync');

async function fetchIcsText(url: string): Promise<string> {
  const normalized = url.replace(/^webcal:\/\//i, 'https://');
  const res = await fetch(normalized, {
    headers: { 'User-Agent': 'TimeMark/2.12 CalendarSync' },
    signal: AbortSignal.timeout(20000),
    redirect: 'manual',
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error('Redirects are not allowed for external calendar URLs');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function syncExternalCalendarsForUser(userId: number): Promise<{ imported: number; deleted: number; errors: string[] }> {
  const cfg = await query(
    'SELECT external_calendar_urls, external_calendar_sync_strategy FROM user_configs WHERE user_id = $1',
    [userId],
  );
  const row = cfg.rows[0] as { external_calendar_urls?: unknown; external_calendar_sync_strategy?: string } | undefined;
  const raw = row?.external_calendar_urls;
  const strategy = row?.external_calendar_sync_strategy === 'replace' ? 'replace' : 'add_only';
  const urls: string[] = Array.isArray(raw)
    ? raw.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];

  let imported = 0;
  let deleted = 0;
  const errors: string[] = [];

  if (strategy === 'replace' && urls.length > 0) {
    const del = await query(
      `DELETE FROM events
       WHERE user_id = $1
         AND reminder_config->>'importSource' = 'external_calendar'`,
      [userId],
    );
    deleted = del.rowCount ?? 0;
  }

  for (const url of urls.slice(0, 5)) {
    try {
      const safe = await isSafePublicUrl(url.replace(/^webcal:\/\//i, 'https://'));
      if (!safe.safe) {
        errors.push(`${url}: ${safe.reason || 'URL not allowed'}`);
        continue;
      }
      const ics = await fetchIcsText(url);
      const parsed = parseIcsEvents(ics);
      for (const ev of parsed.slice(0, 100)) {
        if (strategy === 'add_only') {
          const dup = await query(
            `SELECT id FROM events WHERE user_id = $1 AND name = $2 AND date::text LIKE $3 || '%' LIMIT 1`,
            [userId, ev.name, ev.date],
          );
          if (dup.rows.length) continue;
        }

        await createEvent(String(userId), {
          name: ev.name,
          type: 'other',
          date: ev.date,
          calendarType: 'gregorian',
          reminderConfig: {
            enabled: false,
            daysBeforeList: [],
            emailRecipients: [],
            channels: [],
            accountIds: [],
            importSource: 'external_calendar',
          },
        });
        imported++;
      }
    } catch (e) {
      errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { imported, deleted, errors };
}

export async function syncAllExternalCalendars(): Promise<void> {
  const users = await query(
    `SELECT user_id FROM user_configs
     WHERE external_calendar_urls IS NOT NULL
       AND jsonb_array_length(external_calendar_urls) > 0`,
  );
  for (const row of users.rows as Array<{ user_id: number }>) {
    try {
      const r = await syncExternalCalendarsForUser(row.user_id);
      if (r.imported > 0 || r.deleted > 0) {
        log.info({ userId: row.user_id, imported: r.imported, deleted: r.deleted }, 'External calendar sync');
      }
    } catch (e) {
      log.warn({ userId: row.user_id, err: e }, 'Calendar sync failed');
    }
  }
}

import { query } from '../db/index.js';
import { createEvent } from './event.service.js';
import { createLogger } from '../utils/logger.js';
import { decryptRefreshToken, isGoogleOAuthConfigured, refreshGoogleAccessToken } from './google-oauth.service.js';

const log = createLogger('google-calendar-sync');

interface GoogleCalendarEvent {
  summary?: string;
  start?: { date?: string; dateTime?: string };
}

function parseGoogleEventDate(ev: GoogleCalendarEvent): string | null {
  const raw = ev.start?.date || ev.start?.dateTime?.slice(0, 10);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export async function syncGoogleCalendarForUser(
  userId: number,
): Promise<{ imported: number; deleted: number; errors: string[] }> {
  const cfg = await query(
    `SELECT google_oauth_refresh_token_encrypted, google_calendar_id, external_calendar_sync_strategy
     FROM user_configs WHERE user_id = $1`,
    [userId],
  );
  const row = cfg.rows[0] as {
    google_oauth_refresh_token_encrypted?: string;
    google_calendar_id?: string;
    external_calendar_sync_strategy?: string;
  } | undefined;

  const refreshToken = decryptRefreshToken(String(row?.google_oauth_refresh_token_encrypted || ''));
  if (!refreshToken) {
    return { imported: 0, deleted: 0, errors: ['Google 日历未连接或令牌无效'] };
  }

  const calendarId = row?.google_calendar_id?.trim() || 'primary';
  const strategy = row?.external_calendar_sync_strategy === 'replace' ? 'replace' : 'add_only';

  let imported = 0;
  let deleted = 0;
  const errors: string[] = [];

  if (strategy === 'replace') {
    const del = await query(
      `DELETE FROM events
       WHERE user_id = $1 AND reminder_config->>'importSource' = 'google_calendar'`,
      [userId],
    );
    deleted = del.rowCount ?? 0;
  }

  try {
    const accessToken = await refreshGoogleAccessToken(refreshToken);
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 1);
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      maxResults: '100',
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Google Calendar API HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = (await res.json()) as { items?: GoogleCalendarEvent[] };
    const items = Array.isArray(data.items) ? data.items : [];

    for (const ev of items) {
      const name = ev.summary?.trim();
      const date = parseGoogleEventDate(ev);
      if (!name || !date) continue;

      if (strategy === 'add_only') {
        const dup = await query(
          `SELECT id FROM events WHERE user_id = $1 AND name = $2 AND date::text LIKE $3 || '%' LIMIT 1`,
          [userId, name, date],
        );
        if (dup.rows.length) continue;
      }

      await createEvent(String(userId), {
        name,
        type: 'other',
        date,
        calendarType: 'gregorian',
        reminderConfig: {
          enabled: false,
          daysBeforeList: [],
          emailRecipients: [],
          channels: [],
          accountIds: [],
          importSource: 'google_calendar',
        },
      });
      imported++;
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    log.warn({ userId, err: e }, 'Google Calendar sync failed');
  }

  return { imported, deleted, errors };
}

export async function syncAllGoogleCalendars(): Promise<{ synced: number }> {
  if (!isGoogleOAuthConfigured()) {
    return { synced: 0 };
  }
  const users = await query(
    `SELECT user_id FROM user_configs
     WHERE google_oauth_refresh_token_encrypted IS NOT NULL
       AND google_oauth_refresh_token_encrypted != ''`,
  );
  let synced = 0;
  for (const row of users.rows as Array<{ user_id: number }>) {
    try {
      const r = await syncGoogleCalendarForUser(row.user_id);
      if (r.imported > 0 || r.deleted > 0) {
        synced += r.imported;
        log.info({ userId: row.user_id, imported: r.imported, deleted: r.deleted }, 'Google Calendar sync');
      }
    } catch (e) {
      log.warn({ userId: row.user_id, err: e }, 'Google Calendar sync failed');
    }
  }
  return { synced };
}

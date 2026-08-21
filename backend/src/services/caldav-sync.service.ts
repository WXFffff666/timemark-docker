import axios from 'axios';
import { query } from '../db/index.js';
import { createLogger } from '../utils/logger.js';
import { isSafePublicUrl } from '../utils/url-safety.js';
import { decrypt } from '@timemark/shared/crypto';

const log = createLogger('caldav-sync');

function getMasterKey(): string {
  const key = process.env.MASTER_KEY;
  if (!key) throw new Error('MASTER_KEY not set');
  return key;
}

function decryptCalDavPassword(stored: string): string {
  if (!stored) return '';
  try {
    return decrypt(stored, getMasterKey());
  } catch {
    log.warn('CalDAV password decrypt failed; skipping sync for this credential');
    return '';
  }
}

/** CalDAV 只读订阅：拉取 calendar 集合并解析 VEVENT（最小实现） */
export async function syncAllCalDavSubscriptions(): Promise<{ synced: number }> {
  const users = await query(
    `SELECT user_id, caldav_url, caldav_username, caldav_password_encrypted
     FROM user_configs WHERE caldav_url IS NOT NULL AND caldav_url != ''`,
  );
  let synced = 0;
  for (const row of users.rows as Array<Record<string, unknown>>) {
    try {
      const url = String(row.caldav_url);
      const safe = await isSafePublicUrl(url);
      if (!safe.safe) continue;
      const username = String(row.caldav_username || '');
      const password = decryptCalDavPassword(String(row.caldav_password_encrypted || ''));
      if (row.caldav_password_encrypted && !password) continue;
      const res = await axios.get(url, {
        auth: username ? { username, password } : undefined,
        timeout: 15000,
        maxRedirects: 0,
        headers: { Accept: 'text/calendar' },
        validateStatus: (s) => s < 500,
      });
      if (res.status >= 400) continue;
      const body = String(res.data || '');
      const events = parseIcsEvents(body);
      const userId = row.user_id as number;
      for (const ev of events) {
        const exists = await query(
          `SELECT id FROM events WHERE user_id = $1 AND name = $2 AND date = $3 LIMIT 1`,
          [userId, ev.name, ev.date],
        );
        if (exists.rows.length > 0) continue;
        await query(
          `INSERT INTO events (user_id, name, type, date, calendar_type, reminder_config, notification_channels)
           VALUES ($1, $2, 'other', $3, 'gregorian', $4, '[]')`,
          [userId, ev.name, ev.date, JSON.stringify({ enabled: false, daysBeforeList: [], channels: [], accountIds: [] })],
        );
        synced++;
      }
    } catch (err) {
      log.warn({ userId: row.user_id, err }, 'CalDAV sync failed');
    }
  }
  return { synced };
}

function parseIcsEvents(ics: string): Array<{ name: string; date: string }> {
  const events: Array<{ name: string; date: string }> = [];
  const blocks = ics.split('BEGIN:VEVENT');
  for (const block of blocks.slice(1)) {
    const summary = block.match(/SUMMARY:([^\r\n]+)/)?.[1]?.replace(/\\n/g, ' ').trim();
    const dtstart = block.match(/DTSTART[^:]*:(\d{8})/)?.[1];
    if (!summary || !dtstart) continue;
    const date = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
    events.push({ name: summary, date });
  }
  return events;
}

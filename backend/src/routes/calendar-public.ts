import { Hono } from 'hono';
import { createHash } from 'crypto';
import { query } from '../db/index.js';
import { getEventsByUserId } from '../services/event.service.js';
import { getUserConfig } from '../services/config.service.js';

const calendarPublic = new Hono();

function escapeICS(text: string): string {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function generateICS(events: Array<Record<string, unknown>>, timezone: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TimeMark//Feed//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-TIMEZONE:${timezone}`,
  ];

  for (const event of events) {
    const dateStr = String(event.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    const ymd = dateStr.replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:timemark-${event.id}@timemark.app`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
    lines.push(`DTSTART;VALUE=DATE:${ymd}`);
    lines.push(`SUMMARY:${escapeICS(String(event.name || ''))}`);
    // VALARM: 默认提前 1 天 09:00 提醒
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-P1D');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeICS(String(event.name || 'TimeMark reminder'))}`);
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

async function resolveUserIdByFeedToken(token: string): Promise<number | null> {
  const legacy = await query(
    'SELECT user_id FROM user_configs WHERE calendar_feed_token = $1',
    [token],
  );
  if (legacy.rows.length) return legacy.rows[0].user_id as number;

  const multi = await query(
    `SELECT user_id FROM user_configs
     WHERE calendar_feed_tokens @> $1::jsonb`,
    [JSON.stringify([{ token }])],
  );
  if (multi.rows.length) return multi.rows[0].user_id as number;
  return null;
}

calendarPublic.get('/feed/:token.ics', async (c) => {
  const token = c.req.param('token');
  if (!token) return c.text('Not found', 404);
  const userId = await resolveUserIdByFeedToken(token);
  if (!userId) {
    return c.text('Not found', 404);
  }

  const config = await getUserConfig(userId);
  const events = await getEventsByUserId(String(userId));
  const tz = config?.timezone || 'Asia/Shanghai';
  const ics = generateICS(events as unknown as Array<Record<string, unknown>>, tz);
  const etag = `"${createHash('sha256').update(ics).digest('hex').slice(0, 16)}"`;

  const ifNoneMatch = c.req.header('if-none-match');
  if (ifNoneMatch === etag) {
    return c.body(null, 304, { ETag: etag });
  }

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      ETag: etag,
    },
  });
});

export default calendarPublic;

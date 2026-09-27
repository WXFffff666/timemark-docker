import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { query } from '../db/index.js';
import { createEvent } from '../services/event.service.js';
import type { User } from '@timemark/shared';
import { parseIcsEvents } from '../utils/ics-parser.js';
import { getRequestOrigin } from '../utils/client-ip.js';

type CalendarFeedToken = { name?: string; token: string };

function parseStoredJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isCalendarFeedToken(value: unknown): value is CalendarFeedToken {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { token?: unknown }).token === 'string';
}

const calendarImport = new Hono<{ Variables: { user: User } }>();
calendarImport.use('*', authMiddleware);

calendarImport.post('/import-ics', async (c) => {
  const user = c.get('user');
  const body = await c.req.text();
  if (!body || body.length > 2_000_000) {
    return c.json({ success: false, error: 'ICS 文件过大或为空' }, 400);
  }

  const parsed = parseIcsEvents(body);
  if (!parsed.length) {
    return c.json({ success: false, error: '未解析到有效事件' }, 400);
  }

  let imported = 0;
  const errors: string[] = [];
  for (const ev of parsed.slice(0, 200)) {
    try {
      await createEvent(user.id, {
        name: ev.name,
        type: 'other',
        date: ev.date,
        calendarType: 'gregorian',
        reminderConfig: {
          enabled: true,
          daysBeforeList: [1, 3, 7],
          emailRecipients: [],
          channels: [],
          accountIds: [],
        },
      });
      imported++;
    } catch (e) {
      errors.push(ev.name);
    }
  }

  return c.json({ success: true, data: { imported, total: parsed.length, errors } });
});

/** Token-based WebCal subscribe URL helper */
calendarImport.get('/webcal-url', async (c) => {
  const user = c.get('user');
  const row = await query(
    'SELECT calendar_feed_token FROM user_configs WHERE user_id = $1',
    [Number(user.id)],
  );
  const token = row.rows[0]?.calendar_feed_token as string | undefined;
  const origin = getRequestOrigin(c);
  const host = new URL(origin).host;
  const feedPath = token ? `/api/calendar/feed/${token}.ics` : '/api/calendar/export.ics';
  return c.json({
    success: true,
    data: {
      webcalUrl: `webcal://${host}${feedPath}`,
      httpsUrl: `${origin}${feedPath}`,
      usesToken: !!token,
    },
  });
});

calendarImport.get('/integrations', async (c) => {
  const user = c.get('user');
  const row = await query(
    `SELECT webhook_inbound_token, calendar_feed_token, calendar_feed_tokens,
            external_calendar_urls, external_calendar_sync_strategy, inbox_receive_token
     FROM user_configs WHERE user_id = $1`,
    [Number(user.id)],
  );
  const r = row.rows[0] || {};
  const origin = getRequestOrigin(c);
  const webhookToken = r.webhook_inbound_token as string | undefined;
  const feedToken = r.calendar_feed_token as string | undefined;
  const feedTokens = (parseStoredJsonArray(r.calendar_feed_tokens) ?? []).filter(isCalendarFeedToken);
  const inboxToken = r.inbox_receive_token as string | undefined;
  return c.json({
    success: true,
    data: {
      webhookUrl: webhookToken ? `${origin}/api/webhook/receive/${webhookToken}` : null,
      inboxReceiveUrl: inboxToken ? `${origin}/api/inbox/receive/${inboxToken}` : null,
      calendarFeedUrl: feedToken ? `${origin}/api/calendar/feed/${feedToken}.ics` : null,
      calendarFeedTokens: feedTokens.map((t: { name?: string; token: string }) => ({
        name: t.name || '默认',
        url: `${origin}/api/calendar/feed/${t.token}.ics`,
      })),
      externalCalendarUrls: (parseStoredJsonArray(r.external_calendar_urls) ?? [])
        .filter((url): url is string => typeof url === 'string'),
      externalCalendarSyncStrategy: r.external_calendar_sync_strategy || 'add_only',
    },
  });
});

calendarImport.post('/feed-tokens', async (c) => {
  const user = c.get('user');
  const { name } = await c.req.json().catch(() => ({}));
  const { randomBytes } = await import('crypto');
  const token = randomBytes(24).toString('hex');
  const row = await query('SELECT calendar_feed_tokens FROM user_configs WHERE user_id = $1', [Number(user.id)]);
  const parsedExisting = parseStoredJsonArray(row.rows[0]?.calendar_feed_tokens);
  if (parsedExisting === null || parsedExisting.some((entry) => !isCalendarFeedToken(entry))) {
    return c.json({ success: false, error: '保存的日历订阅配置无效，未作更改' }, 500);
  }
  const existing = parsedExisting as CalendarFeedToken[];
  const updated = [...existing, { name: String(name || `Feed ${existing.length + 1}`), token }].slice(0, 10);
  await query(
    `UPDATE user_configs SET calendar_feed_tokens = $1 WHERE user_id = $2`,
    [JSON.stringify(updated), Number(user.id)],
  );
  const origin = getRequestOrigin(c);
  return c.json({ success: true, data: { token, url: `${origin}/api/calendar/feed/${token}.ics` } });
});

calendarImport.post('/integrations', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const urls = Array.isArray(body.externalCalendarUrls)
    ? body.externalCalendarUrls
      .map((url: unknown) => typeof url === 'string' ? url.trim() : '')
      .filter(Boolean)
    : undefined;
  if (urls && urls.length > 5) {
    return c.json({ success: false, error: '最多允许配置 5 个外部日历源' }, 400);
  }
  const strategy = body.externalCalendarSyncStrategy === 'replace' ? 'replace' : 'add_only';
  if (urls) {
    await query(
      `INSERT INTO user_configs (user_id, external_calendar_urls, external_calendar_sync_strategy)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         external_calendar_urls = COALESCE(excluded.external_calendar_urls, user_configs.external_calendar_urls),
         external_calendar_sync_strategy = COALESCE(excluded.external_calendar_sync_strategy, user_configs.external_calendar_sync_strategy)`,
      [Number(user.id), JSON.stringify(urls), strategy],
    );
  } else if (body.externalCalendarSyncStrategy) {
    await query(
      `UPDATE user_configs SET external_calendar_sync_strategy = $1 WHERE user_id = $2`,
      [strategy, Number(user.id)],
    );
  }
  return c.json({ success: true });
});

calendarImport.post('/sync-external', async (c) => {
  const user = c.get('user');
  const { syncExternalCalendarsForUser } = await import('../services/calendar-sync.service.js');
  const result = await syncExternalCalendarsForUser(Number(user.id));
  return c.json({ success: true, data: result });
});

calendarImport.post('/caldav', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (url) {
    const safe = await import('../utils/url-safety.js').then((m) => m.isSafePublicUrl(url));
    if (!safe.safe) return c.json({ success: false, error: safe.reason || 'URL 不安全' }, 400);
  }
  const { encrypt } = await import('@timemark/shared/crypto');
  const masterKey = process.env.MASTER_KEY;
  if (!masterKey) return c.json({ success: false, error: 'MASTER_KEY 未配置' }, 500);
  const encPassword = password ? encrypt(password, masterKey) : null;
  await query(
    `INSERT INTO user_configs (user_id, caldav_url, caldav_username, caldav_password_encrypted)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       caldav_url = EXCLUDED.caldav_url,
       caldav_username = EXCLUDED.caldav_username,
       caldav_password_encrypted = COALESCE(EXCLUDED.caldav_password_encrypted, user_configs.caldav_password_encrypted)`,
    [Number(user.id), url || null, username || null, encPassword],
  );
  return c.json({ success: true });
});

export default calendarImport;

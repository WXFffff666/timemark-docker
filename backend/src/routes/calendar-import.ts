import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { query } from '../db/index.js';
import { createEvent } from '../services/event.service.js';
import type { User } from '@timemark/shared';
import { parseIcsEvents } from '../utils/ics-parser.js';

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
  const host = c.req.header('Host') || 'localhost';
  const protocol = c.req.header('X-Forwarded-Proto') || 'https';
  const feedPath = token ? `/api/calendar/feed/${token}.ics` : '/api/calendar/export.ics';
  return c.json({
    success: true,
    data: {
      webcalUrl: `webcal://${host}${feedPath}`,
      httpsUrl: `${protocol}://${host}${feedPath}`,
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
  const host = c.req.header('Host') || 'localhost';
  const protocol = c.req.header('X-Forwarded-Proto') || 'https';
  const webhookToken = r.webhook_inbound_token as string | undefined;
  const feedToken = r.calendar_feed_token as string | undefined;
  const feedTokens = Array.isArray(r.calendar_feed_tokens) ? r.calendar_feed_tokens : [];
  const inboxToken = r.inbox_receive_token as string | undefined;
  return c.json({
    success: true,
    data: {
      webhookUrl: webhookToken ? `${protocol}://${host}/api/webhook/receive/${webhookToken}` : null,
      inboxReceiveUrl: inboxToken ? `${protocol}://${host}/api/inbox/receive/${inboxToken}` : null,
      calendarFeedUrl: feedToken ? `${protocol}://${host}/api/calendar/feed/${feedToken}.ics` : null,
      calendarFeedTokens: feedTokens.map((t: { name?: string; token: string }) => ({
        name: t.name || '默认',
        url: `${protocol}://${host}/api/calendar/feed/${t.token}.ics`,
      })),
      externalCalendarUrls: Array.isArray(r.external_calendar_urls) ? r.external_calendar_urls : [],
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
  const existing = Array.isArray(row.rows[0]?.calendar_feed_tokens) ? row.rows[0].calendar_feed_tokens : [];
  const updated = [...existing, { name: String(name || `Feed ${existing.length + 1}`), token }].slice(0, 10);
  await query(
    `UPDATE user_configs SET calendar_feed_tokens = $1::jsonb WHERE user_id = $2`,
    [JSON.stringify(updated), Number(user.id)],
  );
  const host = c.req.header('Host') || 'localhost';
  const protocol = c.req.header('X-Forwarded-Proto') || 'https';
  return c.json({ success: true, data: { token, url: `${protocol}://${host}/api/calendar/feed/${token}.ics` } });
});

calendarImport.post('/integrations', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const urls = Array.isArray(body.externalCalendarUrls)
    ? body.externalCalendarUrls.map((u: unknown) => String(u).trim()).filter(Boolean).slice(0, 5)
    : undefined;
  const strategy = body.externalCalendarSyncStrategy === 'replace' ? 'replace' : 'add_only';
  if (urls) {
    await query(
      `INSERT INTO user_configs (user_id, external_calendar_urls, external_calendar_sync_strategy)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         external_calendar_urls = COALESCE($2::jsonb, user_configs.external_calendar_urls),
         external_calendar_sync_strategy = COALESCE($3, user_configs.external_calendar_sync_strategy)`,
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

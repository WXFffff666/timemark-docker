import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '../db/index.js';
import { createEvent } from '../services/event.service.js';
import { rateLimit } from '../middleware/rate-limit.js';

const webhookInbound = new Hono();
const inboundLimit = rateLimit(30, 60 * 1000);
const MAX_PAYLOAD_BYTES = 64 * 1024;

webhookInbound.post('/receive/:token', inboundLimit, async (c) => {
  const token = c.req.param('token');
  if (!token || token.length < 16) {
    return c.json({ success: false, error: 'Invalid token' }, 400);
  }

  const idempotencyKey = c.req.header('x-idempotency-key');

  const userRow = await query(
    'SELECT user_id, webhook_inbound_secret FROM user_configs WHERE webhook_inbound_token = $1',
    [token],
  );
  if (!userRow.rows.length) {
    return c.json({ success: false, error: 'Unknown webhook' }, 404);
  }

  const userId = userRow.rows[0].user_id as number;
  const secret = userRow.rows[0].webhook_inbound_secret as string | null;

  if (idempotencyKey) {
    const cached = await query(
      'SELECT response_body FROM webhook_idempotency_keys WHERE idempotency_key = $1 AND user_id = $2',
      [idempotencyKey, userId],
    );
    if (cached.rows[0]?.response_body) {
      return c.body(cached.rows[0].response_body as string, 200, { 'Content-Type': 'application/json' });
    }
  }

  const rawBody = await c.req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_PAYLOAD_BYTES) {
    return c.json({ success: false, error: 'Payload too large (max 64KB)' }, 413);
  }
  const signature = c.req.header('x-timemark-signature') || c.req.header('x-hub-signature-256');
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  if (!secret) {
    if (isProduction) {
      return c.json({ success: false, error: 'Webhook 未配置签名密钥，请在设置中启用' }, 403);
    }
  } else if (!signature) {
    return c.json({ success: false, error: '缺少签名头 X-Timemark-Signature' }, 401);
  }

  if (secret && signature) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signature.replace(/^sha256=/, '');
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(provided, 'hex');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return c.json({ success: false, error: 'Invalid signature' }, 401);
      }
    } catch {
      return c.json({ success: false, error: 'Invalid signature' }, 401);
    }
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return c.json({ success: false, error: 'JSON body required' }, 400);
  }

  const name = String(body.name || body.title || body.summary || '').trim();
  const date = String(body.date || body.start || body.dtstart || '').slice(0, 10);
  const type = (body.type as string) || 'other';

  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({
      success: false,
      error: 'Required fields: name (or title), date (YYYY-MM-DD)',
    }, 400);
  }

  const event = await createEvent(String(userId), {
    name,
    type: ['birthday', 'exam', 'anniversary', 'holiday', 'other'].includes(type) ? type as 'other' : 'other',
    date,
    calendarType: 'gregorian',
    reminderConfig: {
      enabled: body.remind !== false,
      daysBeforeList: Array.isArray(body.daysBefore) ? (body.daysBefore as number[]) : [1, 3, 7],
      emailRecipients: [],
      channels: Array.isArray(body.channels) ? (body.channels as string[]) : [],
      accountIds: [],
    },
  });

  const responseBody = JSON.stringify({ success: true, data: { eventId: event.id, name: event.name, date: event.date } });
  if (idempotencyKey) {
    await query(
      `INSERT INTO webhook_idempotency_keys (idempotency_key, user_id, response_body)
       VALUES ($1, $2, $3) ON CONFLICT (idempotency_key) DO NOTHING`,
      [idempotencyKey, userId, responseBody],
    ).catch(() => {});
  }

  return c.body(responseBody, 200, { 'Content-Type': 'application/json' });
});

export default webhookInbound;

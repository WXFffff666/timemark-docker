import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '../db/index.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { createInboxMessage } from '../services/inbox.service.js';

const inboxPublic = new Hono();
const receiveLimit = rateLimit(20, 60 * 1000);
const MAX_BODY_BYTES = 8192;

inboxPublic.post('/receive/:token', receiveLimit, async (c) => {
  const token = c.req.param('token');
  if (!token || token.length < 16) {
    return c.json({ success: false, error: 'Invalid token' }, 400);
  }

  const contentLength = parseInt(c.req.header('content-length') || '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return c.json({ success: false, error: '请求体过大' }, 413);
  }

  const userRow = await query(
    'SELECT user_id, inbox_receive_secret FROM user_configs WHERE inbox_receive_token = $1',
    [token],
  );
  if (!userRow.rows.length) {
    return c.json({ success: false, error: 'Unknown inbox' }, 404);
  }

  const userId = userRow.rows[0].user_id as number;
  const secret = userRow.rows[0].inbox_receive_secret as string | null;
  const rawBody = await c.req.text();

  if (rawBody.length > MAX_BODY_BYTES) {
    return c.json({ success: false, error: '请求体过大' }, 413);
  }

  const signature = c.req.header('x-timemark-signature') || c.req.header('x-hub-signature-256');
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  if (!secret) {
    if (isProduction) {
      return c.json({ success: false, error: '收件接口未配置签名密钥，请在设置中启用' }, 403);
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

  const title = String(body.title || body.subject || body.name || '').trim();
  const messageBody = String(body.body || body.message || body.text || body.content || '').trim();
  const sender = body.sender || body.from || body.senderLabel;

  if (!title || !messageBody) {
    return c.json({
      success: false,
      error: 'Required fields: title (or subject), body (or message)',
    }, 400);
  }

  const message = await createInboxMessage({
    userId,
    title,
    body: messageBody,
    source: 'inbound',
    senderLabel: sender ? String(sender) : null,
  });

  if (!message) {
    return c.json({ success: false, error: '消息内容无效' }, 400);
  }

  return c.json({ success: true, data: { messageId: message.id } });
});

export default inboxPublic;

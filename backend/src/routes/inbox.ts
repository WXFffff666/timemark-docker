import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { User } from '@timemark/shared';
import {
  listInboxMessages,
  markInboxRead,
  markAllInboxRead,
  deleteInboxMessage,
  getInboxReceiveTokens,
} from '../services/inbox.service.js';

const inbox = new Hono<{ Variables: { user: User } }>();
inbox.use('*', authMiddleware);

inbox.get('/', async (c) => {
  const userId = Number(c.get('user').id);
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const unreadOnly = c.req.query('unread') === '1';

  const data = await listInboxMessages(userId, { limit, offset, unreadOnly });
  return c.json({ success: true, data: data.messages, pagination: { total: data.total, unreadCount: data.unreadCount, limit, offset } });
});

inbox.get('/info', async (c) => {
  const userId = Number(c.get('user').id);
  const tokens = await getInboxReceiveTokens(userId);
  const host = c.req.header('Host') || 'localhost';
  const protocol = c.req.header('X-Forwarded-Proto') || 'https';
  const receiveUrl = tokens.inboxReceiveToken
    ? `${protocol}://${host}/api/inbox/receive/${tokens.inboxReceiveToken}`
    : null;

  return c.json({
    success: true,
    data: {
      receiveUrl,
      hasSecret: !!tokens.inboxReceiveSecret,
      retentionDays: 30,
    },
  });
});

inbox.patch('/:id/read', async (c) => {
  const userId = Number(c.get('user').id);
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: '无效的消息 ID' }, 400);
  }
  const ok = await markInboxRead(userId, id);
  if (!ok) return c.json({ success: false, error: '消息不存在' }, 404);
  return c.json({ success: true });
});

inbox.post('/read-all', async (c) => {
  const userId = Number(c.get('user').id);
  const count = await markAllInboxRead(userId);
  return c.json({ success: true, data: { marked: count } });
});

inbox.delete('/:id', async (c) => {
  const userId = Number(c.get('user').id);
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: '无效的消息 ID' }, 400);
  }
  const ok = await deleteInboxMessage(userId, id);
  if (!ok) return c.json({ success: false, error: '消息不存在' }, 404);
  return c.json({ success: true });
});

export default inbox;

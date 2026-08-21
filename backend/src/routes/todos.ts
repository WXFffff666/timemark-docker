import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { User } from '@timemark/shared';
import {
  listTodoCompletions,
  markTodoComplete,
  unmarkTodoComplete,
  todoOccurrenceDate,
} from '../services/todo.service.js';
import { query } from '../db/index.js';

const todos = new Hono<{ Variables: { user: User } }>();
todos.use('*', authMiddleware);

const completeSchema = z.object({
  eventId: z.number().int().positive(),
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

todos.get('/completions', async (c) => {
  const userId = Number(c.get('user').id);
  const rows = await listTodoCompletions(userId);
  return c.json({
    success: true,
    data: rows.map((r) => ({
      eventId: r.event_id,
      occurrenceDate: todoOccurrenceDate(r.occurrence_date),
      completedAt: r.completed_at,
    })),
  });
});

todos.post('/complete', async (c) => {
  const userId = Number(c.get('user').id);
  const body = await c.req.json().catch(() => ({}));
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: '参数无效' }, 400);
  }

  const event = await query(
    'SELECT id, date FROM events WHERE id = $1 AND user_id = $2',
    [parsed.data.eventId, userId],
  );
  if (!event.rows.length) {
    return c.json({ success: false, error: '事件不存在' }, 404);
  }

  const row = event.rows[0] as { date: Date | string };
  const dateStr = parsed.data.occurrenceDate
    || (row.date instanceof Date
      ? row.date.toISOString().slice(0, 10)
      : String(row.date).slice(0, 10));

  await markTodoComplete(userId, parsed.data.eventId, dateStr);
  return c.json({ success: true, data: { eventId: parsed.data.eventId, occurrenceDate: dateStr } });
});

todos.delete('/complete', async (c) => {
  const userId = Number(c.get('user').id);
  const body = await c.req.json().catch(() => ({}));
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: '参数无效' }, 400);
  }

  const event = await query(
    'SELECT date FROM events WHERE id = $1 AND user_id = $2',
    [parsed.data.eventId, userId],
  );
  if (!event.rows.length) {
    return c.json({ success: false, error: '事件不存在' }, 404);
  }

  const row = event.rows[0] as { date: Date | string };
  const dateStr = parsed.data.occurrenceDate
    || (row.date instanceof Date
      ? row.date.toISOString().slice(0, 10)
      : String(row.date).slice(0, 10));

  const ok = await unmarkTodoComplete(userId, parsed.data.eventId, dateStr);
  if (!ok) return c.json({ success: false, error: '记录不存在' }, 404);
  return c.json({ success: true });
});

export default todos;

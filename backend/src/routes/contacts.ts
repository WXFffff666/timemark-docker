import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { User } from '@timemark/shared';
import {
  createFixedContactSchema,
  updateFixedContactSchema,
  contactSendEmailSchema,
} from '@timemark/shared';
import {
  listFixedContacts,
  createFixedContact,
  updateFixedContact,
  deleteFixedContact,
  validateContactMethods,
} from '../services/contact.service.js';
import { mergeContactMethodsInput } from '@timemark/shared';
import { sendContactEmail } from '../services/contact-send.service.js';
import { query } from '../db/index.js';

const contacts = new Hono<{ Variables: { user: User } }>();
contacts.use('*', authMiddleware);

contacts.get('/', async (c) => {
  const user = c.get('user');
  const data = await listFixedContacts(Number(user.id));
  return c.json({ success: true, data });
});

contacts.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = createFixedContactSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }
  try {
    const row = await createFixedContact(Number(user.id), parsed.data);
    return c.json({ success: true, data: row }, 201);
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : '创建失败' }, 400);
  }
});

contacts.put('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const parsed = updateFixedContactSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }
  try {
    const row = await updateFixedContact(Number(user.id), id, parsed.data);
    if (!row) return c.json({ success: false, error: '联系人不存在' }, 404);
    return c.json({ success: true, data: row });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : '更新失败' }, 400);
  }
});

contacts.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  const ok = await deleteFixedContact(Number(user.id), id);
  if (!ok) return c.json({ success: false, error: '联系人不存在' }, 404);
  return c.json({ success: true });
});

contacts.post('/validate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const methods = mergeContactMethodsInput({
    emails: body.emails,
    phones: body.phones,
    telegrams: body.telegrams,
    qqs: body.qqs,
    wxpusherUids: body.wxpusherUids,
    email: body.email,
    phone: body.phone,
    telegramChatId: body.telegramChatId,
    qq: body.qq,
    wxpusherUid: body.wxpusherUid,
  });
  const result = validateContactMethods(methods);
  return c.json({ success: true, data: result });
});

// C11: 联系人分组
contacts.get('/groups', async (c) => {
  const userId = Number(c.get('user').id);
  const groups = await query('SELECT * FROM contact_groups WHERE user_id = $1 ORDER BY name', [userId]);
  const members = await query(
    `SELECT m.* FROM contact_group_members m
     JOIN contact_groups g ON g.id = m.group_id WHERE g.user_id = $1`,
    [userId],
  );
  return c.json({ success: true, data: { groups: groups.rows, members: members.rows } });
});

contacts.post('/groups', async (c) => {
  const userId = Number(c.get('user').id);
  const { name, emails } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ success: false, error: '分组名称必填' }, 400);
  const g = await query(
    'INSERT INTO contact_groups (user_id, name) VALUES ($1, $2) RETURNING *',
    [userId, String(name)],
  );
  const groupId = g.rows[0].id as number;
  if (Array.isArray(emails)) {
    for (const e of emails.slice(0, 50)) {
      await query(
        'INSERT INTO contact_group_members (group_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [groupId, String(e)],
      );
    }
  }
  return c.json({ success: true, data: g.rows[0] }, 201);
});

// C26: vCard 生日导入
contacts.post('/import-vcard', async (c) => {
  const userId = Number(c.get('user').id);
  const text = await c.req.text();
  const blocks = text.split('BEGIN:VCARD');
  let imported = 0;
  for (const block of blocks.slice(1)) {
    const fn = block.match(/FN[^:]*:([^\r\n]+)/)?.[1]?.trim();
    const bday = block.match(/BDAY[^:]*:(\d{4}[-]?\d{2}[-]?\d{2})/)?.[1]?.replace(/-/g, '');
    const email = block.match(/EMAIL[^:]*:([^\r\n]+)/)?.[1]?.trim();
    if (!fn || !bday || bday.length < 8) continue;
    const date = `${bday.slice(0, 4)}-${bday.slice(4, 6)}-${bday.slice(6, 8)}`;
    const { createEvent } = await import('../services/event.service.js');
    await createEvent(String(userId), {
      name: `${fn} 生日`,
      type: 'birthday',
      date,
      calendarType: 'gregorian',
      personName: fn,
      reminderConfig: { enabled: true, daysBeforeList: [0, 1, 3, 7], emailRecipients: email ? [email] : [], channels: [], accountIds: [] },
    });
    imported++;
  }
  return c.json({ success: true, data: { imported } });
});

contacts.post('/:id/send-email', async (c) => {
  const user = c.get('user');
  const userId = Number(user.id);
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(id)) {
    return c.json({ success: false, error: '无效的联系人 ID' }, 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const parsed = contactSendEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }
  try {
    const result = await sendContactEmail(userId, id, parsed.data);
    return c.json({ success: true, data: result });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : '发送失败' }, 400);
  }
});

export default contacts;

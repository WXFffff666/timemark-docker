import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { query } from '../db/index.js';
import { saveUserConfig, getUserConfig } from '../services/config.service.js';
import type { User } from '@timemark/shared';

const settings = new Hono<{ Variables: { user: User } }>();
settings.use('*', authMiddleware);

const DEFAULT_REMINDER = {
  enabled: true,
  dailyTime: '09:00',
  daysBeforeList: [1, 3, 7, 30],
  emailAddresses: [] as string[],
  timezone: 'Asia/Shanghai',
};

settings.get('/reminders', async (c) => {
  const user = c.get('user');
  const result = await query('SELECT reminder_settings FROM user_configs WHERE user_id = $1', [user.id]);
  if (result.rows.length === 0 || !result.rows[0].reminder_settings) {
    return c.json({ success: true, data: DEFAULT_REMINDER });
  }

  return c.json({ success: true, data: { ...DEFAULT_REMINDER, ...result.rows[0].reminder_settings } });
});

settings.post('/reminders', async (c) => {
  const user = c.get('user');
  const payload = await c.req.json();
  const settingsPayload = {
    enabled: Boolean(payload.enabled),
    dailyTime: payload.dailyTime || '09:00',
    daysBeforeList: Array.isArray(payload.daysBeforeList) ? payload.daysBeforeList : [1, 3, 7],
    emailAddresses: Array.isArray(payload.emailAddresses) ? payload.emailAddresses : [],
    timezone: payload.timezone || 'Asia/Shanghai',
  };

  await query(
    `INSERT INTO user_configs (user_id, reminder_settings)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET reminder_settings = EXCLUDED.reminder_settings`,
    [user.id, JSON.stringify(settingsPayload)]
  );

  return c.json({ success: true, data: settingsPayload });
});

settings.get('/config', async (c) => {
  const user = c.get('user');
  const config = await getUserConfig(Number(user.id));
  return c.json({ success: true, data: config || {} });
});

settings.post('/config', async (c) => {
  const user = c.get('user');
  const payload = await c.req.json();
  await saveUserConfig(Number(user.id), payload);
  return c.json({ success: true, data: { message: 'Saved' } });
});

export default settings;

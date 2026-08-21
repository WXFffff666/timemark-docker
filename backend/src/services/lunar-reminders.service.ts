import { Lunar, Solar } from 'lunar-javascript';
import { query } from '../db/index.js';
import { sendNotifications } from './notifications/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('lunar-reminders');

/** 农历初一、十五提醒 cron */
export async function sendLunarPhaseReminders(): Promise<number> {
  const users = await query(
    `SELECT user_id, timezone FROM user_configs WHERE lunar_reminders_enabled = TRUE`,
  );
  let sent = 0;
  const now = new Date();
  for (const row of users.rows as Array<{ user_id: number; timezone: string }>) {
    const solar = Solar.fromDate(now);
    const lunar = solar.getLunar();
    const day = lunar.getDay();
    if (day !== 1 && day !== 15) continue;

    const label = day === 1 ? '农历初一' : '农历十五';
    const dateStr = `${solar.getYear()}-${String(solar.getMonth()).padStart(2, '0')}-${String(solar.getDay()).padStart(2, '0')}`;
    const event = {
      id: 0,
      name: `${label}提醒`,
      type: 'holiday',
      date: dateStr,
      notification_channels: '["feishu","email"]',
    };
    try {
      const accounts = await query(
        `SELECT type FROM notification_accounts WHERE user_id = $1 AND is_active = TRUE LIMIT 3`,
        [row.user_id],
      );
      const channels = accounts.rows.map((r: { type: string }) => r.type).filter(Boolean);
      if (channels.length === 0) continue;
      await sendNotifications(event, row.user_id, channels);
      sent++;
    } catch (err) {
      log.warn({ userId: row.user_id, err }, 'Lunar phase reminder failed');
    }
  }
  return sent;
}

import { query } from '../db/index.js';
import { NOTIFICATION_PRESETS } from '@timemark/shared/notification-presets';
import { filterSupportedChannels } from './notifications/supported-channels.js';

/**
 * 按条件规则、通知套餐与事件渠道，解析本次提醒应使用的渠道列表。
 * 优先级：条件规则 > 套餐分级 > 事件自身渠道
 */
export async function resolveReminderChannels(
  userId: number,
  eventChannels: string[],
  daysUntil: number,
): Promise<string[]> {
  const base = filterSupportedChannels(
    Array.isArray(eventChannels) ? eventChannels.filter(Boolean) : [],
  );

  const rules = await query(
    `SELECT days_before, channels FROM conditional_reminder_rules
     WHERE user_id = $1 AND days_before = $2`,
    [userId, daysUntil],
  );
  if (rules.rows.length > 0) {
    const raw = rules.rows[0].channels;
    const channels = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(channels) && channels.length > 0) {
      return filterSupportedChannels(channels);
    }
  }

  const cfg = await query(
    'SELECT notification_preset FROM user_configs WHERE user_id = $1',
    [userId],
  );
  const presetId = cfg.rows[0]?.notification_preset as string | null;
  if (presetId && NOTIFICATION_PRESETS[presetId]) {
    const tier = NOTIFICATION_PRESETS[presetId].tiers.find((t) => t.daysBefore === daysUntil);
    if (tier?.channels?.length) {
      return filterSupportedChannels(tier.channels);
    }
  }

  return base;
}

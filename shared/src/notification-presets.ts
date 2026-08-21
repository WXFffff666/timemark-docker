/** 通知套餐预设：按提前天数分级渠道（C20/C21） */
export type NotificationPresetTier = {
  daysBefore: number;
  channels: string[];
};

export type NotificationPreset = {
  id: string;
  label: string;
  description: string;
  tiers: NotificationPresetTier[];
};

export const NOTIFICATION_PRESETS: Record<string, NotificationPreset> = {
  balanced: {
    id: 'balanced',
    label: '均衡套餐',
    description: '7 天邮件、1 天 IM、当天全渠道',
    tiers: [
      { daysBefore: 7, channels: ['email', 'resend'] },
      { daysBefore: 1, channels: ['feishu', 'telegram', 'discord'] },
      { daysBefore: 0, channels: ['email', 'resend', 'feishu', 'telegram'] },
    ],
  },
  email_focus: {
    id: 'email_focus',
    label: '邮件优先',
    description: '所有提醒走邮件',
    tiers: [
      { daysBefore: 7, channels: ['email', 'resend'] },
      { daysBefore: 1, channels: ['email', 'resend'] },
      { daysBefore: 0, channels: ['email', 'resend'] },
    ],
  },
  im_focus: {
    id: 'im_focus',
    label: '即时消息优先',
    description: '飞书/钉钉/Telegram 为主',
    tiers: [
      { daysBefore: 7, channels: ['feishu', 'dingtalk'] },
      { daysBefore: 1, channels: ['feishu', 'dingtalk', 'telegram'] },
      { daysBefore: 0, channels: ['feishu', 'dingtalk', 'telegram', 'discord'] },
    ],
  },
};

export const NOTIFICATION_PRESET_LIST = Object.values(NOTIFICATION_PRESETS);

export type EventType = 'birthday' | 'exam' | 'anniversary' | 'holiday' | 'meeting' | 'deadline' | 'travel' | 'graduation' | 'wedding' | 'medical' | 'other';
export type CalendarType = 'gregorian' | 'lunar' | 'both';

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
}

export type NotificationChannel =
  // Email channels
  | 'email'
  | 'resend'
  | 'smtp'
  // Webhook channels
  | 'feishu'
  | 'dingtalk'
  | 'wecom'
  | 'discord'
  | 'slack'
  | 'googlechat'
  | 'irc'
  | 'synologychat'
  | 'twitch'
  // Token-based channels
  | 'telegram'
  | 'line'
  | 'matrix'
  | 'mattermost'
  | 'msteams'
  | 'nextcloudtalk'
  | 'wxpusher'
  | 'qmsg'
  | 'clawbot'
  | 'serverchan'
  | 'pushplus'
  | 'bark'
  | 'gotify'
  | 'meow'
  | 'pushme'
  | 'wecomapp'
  // Plugin channels
  | 'whatsapp'
  | 'signal'
  | 'qqbot'
  | 'zalo'
  | 'imessage'
  | 'wechat_official'
  | 'wechat_personal'
  // Legacy/other channels
  | 'wechat'
  | 'qq'
  | 'bluebubbles'
  | 'microsoft_teams'
  | 'nostr'
  | 'tlon'
  | 'zalo_personal'
  | 'network_chat'
  | 'google_chat'
  | 'synology_chat'
  | 'nextcloud_talk';

export interface ReminderConfig {
  enabled: boolean;
  daysBeforeList: number[];
  customMessage?: string;
  emailRecipients: string[];
  channels?: NotificationChannel[] | string[];
  accountIds?: string[];
  reminderTimes?: string[]; // 多选提醒时间 HH:mm 数组
  importSource?: string;
}

export interface RecurringConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; // 每 N 个周期
  endType: 'never' | 'count' | 'date';
  endCount?: number; // 重复次数
  endDate?: string; // 结束日期 YYYY-MM-DD
}

export interface Event {
  id: string;
  userId: string;
  name: string;
  type: EventType;
  date: string;
  calendarType: CalendarType;
  lunarDate?: LunarDate;
  reminderConfig: ReminderConfig;
  recurringConfig?: RecurringConfig;
  nextOccurrence?: string | null;
  // 被提醒人（生日/事件所有者）
  personName?: string | null;
  birthDate?: string | null;
  birthDateLunar?: string | null;
  // 提醒人（接收通知的人）- 用于关系映射
  reminderRecipientName?: string | null;
  reminderRecipientEmail?: string | null;
  relationshipMappingId?: string;
  createdAt: string;
}

export interface CreateEventRequest {
  name: string;
  type: EventType;
  date: string;
  calendarType: CalendarType;
  lunarDate?: LunarDate;
  reminderConfig: ReminderConfig;
  recurringConfig?: RecurringConfig;
  personName?: string | null;
  birthDate?: string | null;
  birthDateLunar?: string | null;
  reminderRecipientName?: string | null;
  reminderRecipientEmail?: string | null;
  relationshipMappingId?: string;
}

export interface NotificationAccount {
  id: string;
  type: Exclude<NotificationChannel, 'email'>;
  name: string;
  webhook?: string;
  token?: string;
  chatId?: string;
  configMethod?: 'webhook' | 'token' | 'plugin';
  sessionData?: any;
  pluginPackage?: string;
}

export interface RelationshipMapping {
  id: string;
  eventId: string;
  // 被提醒人（事件所有者）的称呼，如"我爸"、"我妈"
  fromRelation: string;
  // 提醒人（接收通知者）的称呼，如"妻子"、"母亲"
  toRelation: string;
  // 提醒人邮箱
  recipientEmail?: string;
  // 提醒人类型：father, mother, wife, husband, self, other 等
  recipientType?: string;
}

export interface EventTemplate {
  id: string;
  eventId: string;
  reminderId: string;
  reminderIdentity: string;
  eventSubject: string;
  relationshipMappings: RelationshipMapping[];
}

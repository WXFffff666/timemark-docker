import { sendFeishuNotification } from './feishu.service.js';
import { sendWeComNotification } from './wecom.service.js';
import { sendDingTalkNotification } from './dingtalk.service.js';
import { sendTelegramNotification } from './telegram.service.js';
import { sendDiscordNotification } from './discord.service.js';
import { sendSlackNotification } from './slack.service.js';
import { sendWxPusherNotification } from './wxpusher.service.js';
import { sendQmsgNotification } from './qmsg.service.js';
import { sendGenericWebhookNotification } from './generic-webhook.service.js';
import { sendEmailNotification } from './email.service.js';
import { sendSmtpNotification } from './smtp.service.js';
// New webhook-based channels
import { sendGoogleChatNotification } from './googlechat.service.js';
import { sendIRCNotification } from './irc.service.js';
import { sendSynologyChatNotification } from './synologychat.service.js';
import { sendTwitchNotification } from './twitch.service.js';
// New token-based channels
import { sendLINENotification } from './line.service.js';
import { sendMatrixNotification } from './matrix.service.js';
import { sendMattermostNotification } from './mattermost.service.js';
import { sendMicrosoftTeamsNotification } from './msteams.service.js';
import { sendNextcloudTalkNotification } from './nextcloudtalk.service.js';
import { sendNostrNotification } from './nostr.service.js';
import { sendNtfyNotification } from './ntfy.service.js';
import { sendPushoverNotification } from './pushover.service.js';
import { sendAppriseNotification } from './apprise.service.js';
// New token-based channels (batch 2)
import { sendClawBotNotification } from './clawbot.service.js';
import { sendServerChanNotification } from './serverchan.service.js';
import { sendPushPlusNotification } from './pushplus.service.js';
import { sendBarkNotification } from './bark.service.js';
import { sendGotifyNotification } from './gotify.service.js';
import { sendMeowNotification } from './meow.service.js';
import { sendPushMeNotification } from './pushme.service.js';
import { sendWeComAppNotification } from './wecomapp.service.js';

// Plugin channel services
import { sendNotification as sendWechatNotification } from './wechaty.service.js';
import { sendNotification as sendWhatsappNotification } from './whatsapp.service.js';
import { sendNotification as sendQQNotification } from './qqbot.service.js';
import { sendNotification as sendSignalNotification } from './signal.service.js';
import { sendNotification as sendZaloNotification } from './zalo.service.js';
import { sendNotification as sendBlueBubblesNotification } from './bluebubbles.service.js';

import { getUserConfig, getRelationshipMappings, getNotificationAccounts, getEventTemplate } from '../config.service.js';
import { applyRelationshipMapping } from '@timemark/shared/relationship';
import { getBlessing } from '../../../../shared/src/blessings.js';
import { generateNotificationContent } from '../../../../shared/src/templates.js';
import { query } from '../../db/index.js';

/**
 * Check if current time is within quiet hours for the user's timezone.
 * Handles overnight ranges (e.g., "22:00" to "07:00").
 */
function isInQuietHours(quietStart: string | null, quietEnd: string | null, timezone: string): boolean {
  if (!quietStart || !quietEnd) return false;

  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return false;

  // Get current time in user's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const currentH = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const currentM = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

  const currentMinutes = currentH * 60 + currentM;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day range (e.g., 09:00 to 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g., 22:00 to 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// 通用 Webhook 渠道（通过配置文件中的 channel_webhooks 字段配置）
const genericWebhookChannels = new Set([
  'whatsapp',
  'signal',
  'imessage',
  'bluebubbles',
  'zalo',
  'zalo_personal',
  'network_chat',
  'irc',
  'synologychat',
  'twitch',
  'googlechat',
]);

// 渠道类型到通知账户类型的映射
const channelToAccountType: Record<string, string> = {
  'feishu': 'feishu',
  'wecom': 'wecom',
  'dingtalk': 'dingtalk',
  'telegram': 'telegram',
  'discord': 'discord',
  'slack': 'slack',
  'wechat': 'wxpusher',
  'qq': 'qmsg',
  'email': 'email',
  'resend': 'resend',
  'smtp': 'smtp',
  // New mappings
  'googlechat': 'googlechat',
  'line': 'line',
  'matrix': 'matrix',
  'mattermost': 'mattermost',
  'msteams': 'msteams',
  'nextcloud_talk': 'nextcloud_talk',
  'nostr': 'nostr',
  'irc': 'irc',
  'synologychat': 'synologychat',
  'twitch': 'twitch',
  'whatsapp': 'whatsapp',
  'signal': 'signal',
  'zalo': 'zalo',
  // New channels (batch 2)
  'ntfy': 'ntfy',
  'pushover': 'pushover',
  'apprise': 'apprise',
  'clawbot': 'clawbot',
  'serverchan': 'serverchan',
  'pushplus': 'pushplus',
  'bark': 'bark',
  'gotify': 'gotify',
  'meow': 'meow',
  'pushme': 'pushme',
  'wecomapp': 'wecomapp',
  // Plugin channels
  'wechat_personal': 'wechat_personal',
  'qq_bot': 'qq_bot',
  'imessage': 'imessage',
};

/**
 * 根据账户类型获取通知配置
 */
function getChannelConfigFromAccount(
  account: any,
  channel: string
): { webhook?: string; token?: string; secret?: string; chat_id?: string; server_url?: string; sessionData?: any; toUser?: string; email?: string; apiKey?: string; emails?: string[]; fromEmail?: string } | null {
  // 直接使用账户的字段
  switch (channel) {
    // Email channels
    case 'email':
    case 'resend':
      return { 
        apiKey: account.token,  // Resend API Key
        emails: [account.chat_id || account.name],  // Recipient emails as array
        // 使用已验证域名的邮箱地址，或Resend测试地址（仅能发送到自己的邮箱）
        fromEmail: account.webhook || 'onboarding@resend.dev'
      };
    
    case 'smtp':
      return (account.webhook && account.token && account.chat_id)
        ? { webhook: account.webhook, token: account.token, secret: account.secret, chat_id: account.chat_id }
        : null;
    
    // Webhook-based channels
    case 'feishu':
    case 'wecom':
    case 'discord':
    case 'slack':
    case 'googlechat':
    case 'irc':
    case 'synologychat':
    case 'twitch':
      return account.webhook ? { webhook: account.webhook } : null;
    
    case 'dingtalk':
      return (account.webhook && account.secret)
        ? { webhook: account.webhook, secret: account.secret }
        : account.webhook ? { webhook: account.webhook } : null;
    
    // Token-based channels
    case 'telegram':
      return (account.token && account.chat_id)
        ? { token: account.token, chat_id: account.chat_id }
        : null;
    
    case 'line':
    case 'wxpusher':
    case 'qmsg':
      return (account.token && account.chat_id)
        ? { token: account.token, chat_id: account.chat_id }
        : null;
    
    case 'matrix':
      return (account.webhook && account.token && account.chat_id)
        ? { webhook: account.webhook, token: account.token, chat_id: account.chat_id, server_url: account.webhook }
        : null;
    
    case 'mattermost':
    case 'nextcloud_talk':
      return (account.webhook && account.token && account.chat_id)
        ? { webhook: account.webhook, token: account.token, chat_id: account.chat_id, server_url: account.webhook }
        : null;
    
    case 'msteams':
      return (account.token && account.chat_id)
        ? { token: account.token, chat_id: account.chat_id }
        : null;
    
    // New token-based channels (batch 2)
    case 'serverchan':
      return account.token
        ? { token: account.token }
        : null;
    
    case 'pushplus':
      return account.token
        ? { token: account.token, chat_id: account.chat_id }
        : null;
    
    case 'bark':
      return (account.webhook && account.token)
        ? { webhook: account.webhook, token: account.token, chat_id: account.chat_id, secret: account.secret }
        : null;
    
    case 'gotify':
      return (account.webhook && account.token)
        ? { webhook: account.webhook, token: account.token, chat_id: account.chat_id }
        : null;
    
    case 'meow':
      return account.token
        ? { token: account.token }
        : null;
    
    case 'pushme':
      return account.token
        ? { token: account.token }
        : null;
    
    case 'wecomapp':
      return (account.token && account.secret && account.chat_id && account.webhook)
        ? { token: account.token, secret: account.secret, chat_id: account.chat_id, webhook: account.webhook }
        : null;
    
    case 'nostr':
      return (account.token && account.chat_id)
        ? { token: account.token, chat_id: account.chat_id, webhook: account.webhook }
        : null;
    
    case 'ntfy':
      return (account.webhook && account.token)
        ? { webhook: account.webhook, token: account.token }
        : null;
    
    case 'pushover':
      return (account.token && account.secret)
        ? { token: account.token, secret: account.secret }
        : null;
    
    case 'apprise':
      return account.webhook
        ? { webhook: account.webhook, token: account.token }
        : null;
    
    // Plugin-based channels
    case 'wechat_personal':
    case 'whatsapp':
    case 'qq_bot':
    case 'signal':
    case 'clawbot':
    case 'zalo':
      return (account.session_data || account.token)
        ? { 
            sessionData: account.session_data || account.token,
            toUser: account.chat_id 
          }
        : null;
    
    // iMessage via BlueBubbles
    case 'imessage':
      return (account.webhook && account.token && account.chat_id)
        ? {
            webhook: account.webhook,
            token: account.token,
            chat_id: account.chat_id
          }
        : null;
    
    default:
      return null;
  }
}

/**
 * Send notifications for an event through specified channels
 * 
 * This is the main notification dispatcher. It:
 * 1. Loads user configuration and notification accounts
 * 2. Applies relationship mapping to the event name
 * 3. Routes to appropriate channel handlers (email, webhook, plugin)
 * 4. Handles retries with exponential backoff
 * 
 * @param event - The event object from database (raw row)
 * @param userId - The user's ID
 * @param channels - Array of channel IDs to send through (e.g., ['resend', 'telegram'])
 */
export async function sendNotifications(event: any, userId: number, channels: string[], opts?: { skipQuietHours?: boolean }): Promise<Record<string, { success: boolean; error?: string; accountId?: number }>> {
  const config = await getUserConfig(userId);

  // Quiet hours check: skip sending, scheduler will retry next minute
  if (!opts?.skipQuietHours) {
    const userTimezone = config?.timezone || 'Asia/Shanghai';
    if (isInQuietHours(config?.quiet_hours_start, config?.quiet_hours_end, userTimezone)) {
      console.log(`[Notifications] Skipping send during quiet hours for user ${userId}`);
      return { _quiet_hours: { success: false, error: 'quiet_hours' } };
    }
  }

  const channelWebhooks = config?.channel_webhooks || {};
  
  // 获取关系映射
  const mappings = await getRelationshipMappings(userId, event.id);
  // Apply default relationship mapping for all channels
  const defaultMappedName = applyRelationshipMapping(event.name, mappings);
  const mappedEvent: any = { ...event, name: defaultMappedName };
  
  // Try to get user-customized template for this event type
  const userTemplate = await getEventTemplate(userId, event.type);
  if (userTemplate) {
    const blessing = getBlessing(event.type, event.reminderConfig?.customMessage, event.personName, event.reminderRecipientName);
    const today = new Date();
    const eventDate = new Date(event.date);
    const daysUntil = Math.max(0, Math.ceil((eventDate.getTime() - today.getTime()) / (86400 * 1000)));
    const renderedContent = generateNotificationContent(
      userTemplate.template_content,
      { name: mappedEvent.name, date: event.date, type: event.type, personName: event.personName },
      daysUntil,
      blessing,
      event.reminder_time
    );
    mappedEvent.customMessage = renderedContent;
  }
  
  // 获取事件绑定的通知账户ID
  const boundAccountIds: number[] = (() => {
    const raw = event.notification_account_ids;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter((id): id is number => typeof id === 'number');
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [];
    } catch {
      return [];
    }
  })();
  
  // 获取用户所有通知账户
  const allAccounts = await getNotificationAccounts(userId);
  
  // 构建账户ID到账户的映射
  const accountsMap = new Map<number, any>();
  for (const account of allAccounts) {
    accountsMap.set(account.id, account);
  }
  
  // 为每个渠道准备配置（支持多账号：一个渠道可能有多个账号）
  const channelConfigsMap: Record<string, any[]> = {};
  
  for (const ch of channels) {
    const configs: any[] = [];
    
    if (boundAccountIds.length > 0) {
      // 找到所有匹配渠道类型的已绑定账户
      const accountType = channelToAccountType[ch];
      for (const accountId of boundAccountIds) {
        const account = accountsMap.get(accountId);
        if (account && account.type === accountType && account.is_active) {
          const accountConfig = getChannelConfigFromAccount(account, ch);
          if (accountConfig) configs.push(accountConfig);
        }
      }
    }
    
    // 如果没有绑定的账户配置，使用全局配置
    if (configs.length === 0) {
      const globalConfig: any = {};
      switch (ch) {
        case 'feishu':
          if (config?.feishu_webhook) globalConfig.webhook = config.feishu_webhook;
          break;
        case 'wecom':
          if (config?.wecom_webhook) globalConfig.webhook = config.wecom_webhook;
          break;
        case 'dingtalk':
          if (config?.dingtalk_webhook && config?.dingtalk_secret) {
            globalConfig.webhook = config.dingtalk_webhook;
            globalConfig.secret = config.dingtalk_secret;
          }
          break;
        case 'telegram':
          if (config?.telegram_bot_token && config?.telegram_chat_id) {
            globalConfig.token = config.telegram_bot_token;
            globalConfig.chat_id = config.telegram_chat_id;
          }
          break;
        case 'discord':
          if (config?.discord_webhook) globalConfig.webhook = config.discord_webhook;
          break;
        case 'slack':
          if (config?.slack_webhook) globalConfig.webhook = config.slack_webhook;
          break;
        case 'wechat':
          if (config?.wxpusher_app_token && config?.wxpusher_uid) {
            globalConfig.token = config.wxpusher_app_token;
            globalConfig.chat_id = config.wxpusher_uid;
          }
          break;
        case 'qq':
          if (config?.qmsg_key) {
            globalConfig.token = config.qmsg_key;
            globalConfig.chat_id = config.qmsg_qq;
          }
          break;
        case 'email':
        case 'resend':
          if (config?.resend_api_key) {
            globalConfig.apiKey = config.resend_api_key;
            // Get email addresses from notification_accounts
            const emailAccounts = allAccounts.filter(a => (a.type === 'email' || a.type === 'resend') && a.is_active);
            if (emailAccounts.length > 0) {
              globalConfig.emails = emailAccounts.map((a: any) => a.chat_id || a.name);
            } else if (config?.reminder_emails?.length > 0) {
              // Fallback to legacy reminder_emails
              globalConfig.emails = config.reminder_emails;
            }
          }
          break;
        default:
          if (genericWebhookChannels.has(ch) && channelWebhooks[ch]) {
            globalConfig.webhook = channelWebhooks[ch];
          }
      }
      
      if (Object.keys(globalConfig).length > 0) {
        configs.push(globalConfig);
      }
    }
    
    if (configs.length > 0) {
      channelConfigsMap[ch] = configs;
    }
  }
  
  // 发送通知（每个渠道可能有多个账号配置，独立发送）
  const channelResults: Record<string, { success: boolean; error?: string; accountId?: number }> = {};
  
  // Build account ID lookup for bound accounts
  const configToAccountId = new Map<any, number>();
  for (const ch of channels) {
    const configs = channelConfigsMap[ch];
    if (!configs) continue;
    const accountType = channelToAccountType[ch];
    for (const cfg of configs) {
      // Find matching account by config reference
      for (const accountId of boundAccountIds) {
        const account = accountsMap.get(accountId);
        if (account && account.type === accountType) {
          const accountConfig = getChannelConfigFromAccount(account, ch);
          if (accountConfig && JSON.stringify(accountConfig) === JSON.stringify(cfg)) {
            configToAccountId.set(cfg, accountId);
          }
        }
      }
    }
  }
  
  const sendTasks: Array<{ channel: string; accountId?: number; promise: Promise<void> }> = channels.flatMap((ch) => {
    const configs = channelConfigsMap[ch];
    if (!configs || configs.length === 0) return [];
    
    return configs.map((chConfig) => ({
      channel: ch,
      accountId: configToAccountId.get(chConfig),
      promise: (async () => {
        try {
        if (ch === 'feishu' && chConfig.webhook) await retryWithBackoff(() => sendFeishuNotification(mappedEvent, chConfig.webhook));
        else if (ch === 'wecom' && chConfig.webhook) await retryWithBackoff(() => sendWeComNotification(mappedEvent, chConfig.webhook));
        else if (ch === 'dingtalk' && chConfig.webhook && chConfig.secret)
          await retryWithBackoff(() => sendDingTalkNotification(mappedEvent, chConfig.webhook, chConfig.secret));
        else if (ch === 'telegram' && chConfig.token && chConfig.chat_id)
          await retryWithBackoff(() => sendTelegramNotification(mappedEvent, chConfig.token, chConfig.chat_id));
        else if (ch === 'discord' && chConfig.webhook)
          await retryWithBackoff(() => sendDiscordNotification(mappedEvent, chConfig.webhook));
        else if (ch === 'slack' && chConfig.webhook)
          await retryWithBackoff(() => sendSlackNotification(mappedEvent, chConfig.webhook));
        else if (ch === 'wechat' && chConfig.token && chConfig.chat_id)
          await retryWithBackoff(() => sendWxPusherNotification(mappedEvent, chConfig.token, chConfig.chat_id));
        else if (ch === 'qq' && chConfig.token)
          await retryWithBackoff(() => sendQmsgNotification(mappedEvent, chConfig.token, chConfig.chat_id));
        else if ((ch === 'email' || ch === 'resend') && chConfig.apiKey) {
          // 为每个收件人单独发送邮件，应用不同的关系映射（per-recipient）
          const fromEmail = chConfig.fromEmail || 'TimeMark <noreply@timemark.app>';
          
          // 解析 reminderConfig（可能是 JSON 字符串）
          let parsedReminderConfig: any = {};
          try {
            const rawConfig = event.reminder_config || event.reminderConfig;
            if (rawConfig) {
              parsedReminderConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
            }
          } catch (e) {
            console.error('[sendNotifications] Failed to parse reminder_config:', e);
          }
          
          // 获取收件人邮箱：只使用事件级别的配置
          let recipientEmails: string[] = [];
          
          // 1. 优先使用事件的 reminderRecipientEmail
          if (event.reminder_recipient_email) {
            recipientEmails = [event.reminder_recipient_email];
          }
          // 2. 其次使用 reminderConfig.emailRecipients
          else if (parsedReminderConfig.emailRecipients?.length > 0) {
            recipientEmails = parsedReminderConfig.emailRecipients;
          }
          
          // 如果没有配置收件人邮箱，跳过此渠道
          if (recipientEmails.length === 0) {
            console.warn(`[sendNotifications] No recipient emails configured for event ${event.id}, skipping email channel`);
            return;
          }
          
          console.log(`[sendNotifications] Sending email from ${fromEmail} to ${recipientEmails.length} recipients...`);
          const results = await Promise.allSettled(recipientEmails.map(async (email: string) => {
            const emailMappedEvent = {
              ...event,
              name: applyRelationshipMapping(event.name, mappings, email)
            };
            console.log(`[sendNotifications] Sending to ${email}...`);
            try {
              await retryWithBackoff(() => sendEmailNotification(
                emailMappedEvent,
                chConfig.apiKey,
                fromEmail,
                email
              ));
              console.log(`[sendNotifications] ✅ Email sent to ${email}`);
            } catch (error) {
              console.error(`[sendNotifications] ❌ Failed to send email to ${email}:`, error);
              throw error;
            }
          }));
          // Log any failures
          const failures = results.filter(r => r.status === 'rejected');
          if (failures.length > 0) {
            console.error(`[sendNotifications] ${failures.length} email(s) failed to send`);
          }
        }
        else if (ch === 'smtp' && chConfig.webhook && chConfig.token && chConfig.chat_id) {
          const smtpHost = chConfig.webhook;
          const smtpPort = parseInt(chConfig.secret || '587', 10);
          const password = chConfig.token;
          const fromEmail = chConfig.chat_id;
          
          // 获取收件人邮箱：优先使用事件级别的配置
          let smtpRecipients: string[] = [];
          if (event.reminder_recipient_email) {
            smtpRecipients = [event.reminder_recipient_email];
          } else if (event.reminderConfig?.emailRecipients?.length > 0) {
            smtpRecipients = event.reminderConfig.emailRecipients;
          } else {
            smtpRecipients = [fromEmail]; // 回退到发件人邮箱
          }
          
          for (const recipient of smtpRecipients) {
            await retryWithBackoff(() => sendSmtpNotification(mappedEvent, smtpHost, smtpPort, password, fromEmail, recipient));
          }
        }
        else if (genericWebhookChannels.has(ch) && chConfig.webhook)
          await retryWithBackoff(() => sendGenericWebhookNotification(mappedEvent, chConfig.webhook, ch));
        // Token-based channels with dedicated APIs
        else if (ch === 'nextcloud_talk' && chConfig.server_url && chConfig.token && chConfig.chat_id)
          await retryWithBackoff(() => sendNextcloudTalkNotification(mappedEvent, chConfig.server_url, chConfig.token, chConfig.chat_id));
        else if (ch === 'mattermost' && chConfig.server_url && chConfig.token && chConfig.chat_id)
          await retryWithBackoff(() => sendMattermostNotification(mappedEvent, chConfig.server_url, chConfig.token, chConfig.chat_id));
        // Matrix channel (token-based with homeserver URL)
        else if (ch === 'matrix' && chConfig.server_url && chConfig.token && chConfig.chat_id)
          await retryWithBackoff(() => sendMatrixNotification(mappedEvent, chConfig.server_url, chConfig.token, chConfig.chat_id));
        // New token-based channels (batch 2)
        else if (ch === 'serverchan' && chConfig.token)
          await retryWithBackoff(() => sendServerChanNotification(mappedEvent, chConfig.token));
        else if (ch === 'pushplus' && chConfig.token)
          await retryWithBackoff(() => sendPushPlusNotification(mappedEvent, chConfig.token, chConfig.chat_id));
        else if (ch === 'bark' && chConfig.webhook && chConfig.token)
          await retryWithBackoff(() => sendBarkNotification(mappedEvent, chConfig.webhook, chConfig.token, chConfig.chat_id, chConfig.secret));
        else if (ch === 'gotify' && chConfig.webhook && chConfig.token)
          await retryWithBackoff(() => sendGotifyNotification(mappedEvent, chConfig.webhook, chConfig.token, chConfig.chat_id ? Number(chConfig.chat_id) : 5));
        else if (ch === 'meow' && chConfig.token)
          await retryWithBackoff(() => sendMeowNotification(mappedEvent, chConfig.token));
        else if (ch === 'pushme' && chConfig.token)
          await retryWithBackoff(() => sendPushMeNotification(mappedEvent, chConfig.token));
        else if (ch === 'wecomapp' && chConfig.token && chConfig.secret && chConfig.chat_id && chConfig.webhook)
          await retryWithBackoff(() => sendWeComAppNotification(mappedEvent, chConfig.token, chConfig.secret, chConfig.chat_id, chConfig.webhook));
        // Ntfy, Pushover, Apprise
        else if (ch === 'ntfy' && chConfig.webhook && chConfig.token)
          await retryWithBackoff(() => sendNtfyNotification(mappedEvent, chConfig.webhook, chConfig.token));
        else if (ch === 'pushover' && chConfig.token && chConfig.secret)
          await retryWithBackoff(() => sendPushoverNotification(mappedEvent, chConfig.token, chConfig.secret));
        else if (ch === 'apprise' && chConfig.webhook)
          await retryWithBackoff(() => sendAppriseNotification(mappedEvent, chConfig.webhook, chConfig.token));
        // Plugin-based channels
        else if (ch === 'wechat_personal' && chConfig.sessionData) {
          const toUser = chConfig.toUser || mappedEvent.personName || 'me';
          await retryWithBackoff(() => sendWechatNotification(mappedEvent, chConfig.sessionData, toUser));
        }
        else if (ch === 'whatsapp' && chConfig.sessionData) {
          const toUser = chConfig.toUser || mappedEvent.personName || '';
          await retryWithBackoff(() => sendWhatsappNotification(mappedEvent, chConfig.sessionData, toUser));
        }
        else if (ch === 'qq_bot' && chConfig.sessionData) {
          const toUser = chConfig.toUser || mappedEvent.personName || '';
          await retryWithBackoff(() => sendQQNotification(mappedEvent, chConfig.sessionData, toUser));
        }
        else if (ch === 'signal' && chConfig.sessionData) {
          const toUser = chConfig.toUser || mappedEvent.personName || '';
          await retryWithBackoff(() => sendSignalNotification(mappedEvent, chConfig.sessionData, toUser));
        }
        else if (ch === 'zalo' && chConfig.sessionData) {
          const toUser = chConfig.toUser || mappedEvent.personName || '';
          await retryWithBackoff(() => sendZaloNotification(mappedEvent, chConfig.sessionData, toUser));
        }
        else if (ch === 'imessage' && chConfig.webhook && chConfig.token && chConfig.chat_id) {
          // iMessage via BlueBubbles
          const sessionData = {
            serverUrl: chConfig.webhook,
            password: chConfig.token,
            sessionId: 'direct'
          };
          await retryWithBackoff(() => sendBlueBubblesNotification(mappedEvent, sessionData, chConfig.chat_id));
        }
        else if (ch === 'clawbot' && chConfig.sessionData) {
          const sessionObj = typeof chConfig.sessionData === 'string'
            ? JSON.parse(chConfig.sessionData)
            : chConfig.sessionData;
          const botToken = sessionObj.bot_token;
          const baseUrl = sessionObj.baseUrl || 'https://ilinkai.weixin.qq.com';
          const toUser = chConfig.toUser || '';
          if (botToken && toUser) {
            await retryWithBackoff(() => sendClawBotNotification(mappedEvent, botToken, toUser, baseUrl));
          }
        }
      } catch (e) {
        console.error(`Failed ${ch}:`, e);
        throw e;
      }
      })(),
    }));
  });
  
  const settled = await Promise.allSettled(sendTasks.map(t => t.promise));
  
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const task = sendTasks[i];
    const ch = task.channel;
    if (result.status === 'fulfilled') {
      channelResults[ch] = { success: true, accountId: task.accountId };
      // Reset consecutive failure count on success
      if (task.accountId) {
        try {
          await query(
            `UPDATE notification_accounts SET updated_at = datetime('now') WHERE id = ?`,
            [task.accountId]
          );
        } catch { /* ignore */ }
      }
    } else {
      const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      channelResults[ch] = { success: false, error: errMsg, accountId: task.accountId };
      // Track consecutive failures and auto-disable after 3
      if (task.accountId) {
        await trackConsecutiveFailure(task.accountId, ch, errMsg);
      }
    }
  }
  
  // Channel fallback: when primary channel fails, try other active accounts (max 2 fallback attempts)
  const failedChannels = Object.entries(channelResults).filter(([, r]) => !r.success);
  if (failedChannels.length > 0 && allAccounts.length > 1) {
    // Collect account IDs already tried
    const triedAccountIds = new Set<number>();
    for (const task of sendTasks) {
      if (task.accountId) triedAccountIds.add(task.accountId);
    }
    
    // Find other active accounts not already tried
    const fallbackCandidates = allAccounts.filter(
      a => a.is_active && !triedAccountIds.has(a.id)
    );
    
    let fallbackAttempts = 0;
    const maxFallbacks = 2;
    
    for (const [failedCh] of failedChannels) {
      if (fallbackAttempts >= maxFallbacks) break;
      
      for (const candidate of fallbackCandidates) {
        if (fallbackAttempts >= maxFallbacks) break;
        
        const candidateChannel = Object.entries(channelToAccountType).find(
          ([, type]) => type === candidate.type
        )?.[0];
        if (!candidateChannel) continue;
        
        // Skip if this channel type was already tried and succeeded
        if (channelResults[candidateChannel]?.success) continue;
        
        const fallbackConfig = getChannelConfigFromAccount(candidate, candidateChannel);
        if (!fallbackConfig) continue;
        
        console.log(`[Fallback] Primary channel ${failedCh} failed, trying ${candidateChannel} (account ${candidate.id})`);
        fallbackAttempts++;
        
        try {
          await retryWithBackoff(async () => {
            await sendSingleChannel(candidateChannel, fallbackConfig, mappedEvent);
          }, 2, 500); // Fewer retries for fallback
          
          channelResults[candidateChannel] = { success: true, accountId: candidate.id };
          console.log(`[Fallback] Successfully sent via ${candidateChannel} (account ${candidate.id})`);
          break; // One successful fallback is enough for this failed channel
        } catch (fallbackErr) {
          const fbErrMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          console.error(`[Fallback] ${candidateChannel} (account ${candidate.id}) also failed: ${fbErrMsg}`);
          channelResults[`${candidateChannel}_fallback`] = { success: false, error: fbErrMsg, accountId: candidate.id };
        }
      }
    }
  }
  
  return channelResults;
}

/**
 * Send a notification through a single channel with given config.
 * Used by fallback logic to dispatch to the correct channel handler.
 */
async function sendSingleChannel(ch: string, chConfig: any, mappedEvent: any): Promise<void> {
  if (ch === 'feishu' && chConfig.webhook) await sendFeishuNotification(mappedEvent, chConfig.webhook);
  else if (ch === 'wecom' && chConfig.webhook) await sendWeComNotification(mappedEvent, chConfig.webhook);
  else if (ch === 'dingtalk' && chConfig.webhook && chConfig.secret)
    await sendDingTalkNotification(mappedEvent, chConfig.webhook, chConfig.secret);
  else if (ch === 'telegram' && chConfig.token && chConfig.chat_id)
    await sendTelegramNotification(mappedEvent, chConfig.token, chConfig.chat_id);
  else if (ch === 'discord' && chConfig.webhook) await sendDiscordNotification(mappedEvent, chConfig.webhook);
  else if (ch === 'slack' && chConfig.webhook) await sendSlackNotification(mappedEvent, chConfig.webhook);
  else if (ch === 'wechat' && chConfig.token && chConfig.chat_id)
    await sendWxPusherNotification(mappedEvent, chConfig.token, chConfig.chat_id);
  else if (ch === 'qq' && chConfig.token) await sendQmsgNotification(mappedEvent, chConfig.token, chConfig.chat_id);
  else if (ch === 'serverchan' && chConfig.token) await sendServerChanNotification(mappedEvent, chConfig.token);
  else if (ch === 'pushplus' && chConfig.token) await sendPushPlusNotification(mappedEvent, chConfig.token, chConfig.chat_id);
  else if (ch === 'bark' && chConfig.webhook && chConfig.token)
    await sendBarkNotification(mappedEvent, chConfig.webhook, chConfig.token, chConfig.chat_id, chConfig.secret);
  else if (ch === 'gotify' && chConfig.webhook && chConfig.token)
    await sendGotifyNotification(mappedEvent, chConfig.webhook, chConfig.token, chConfig.chat_id ? Number(chConfig.chat_id) : 5);
  else if (ch === 'meow' && chConfig.token) await sendMeowNotification(mappedEvent, chConfig.token);
  else if (ch === 'pushme' && chConfig.token) await sendPushMeNotification(mappedEvent, chConfig.token);
  else if (ch === 'wecomapp' && chConfig.token && chConfig.secret && chConfig.chat_id && chConfig.webhook)
    await sendWeComAppNotification(mappedEvent, chConfig.token, chConfig.secret, chConfig.chat_id, chConfig.webhook);
  else if (ch === 'ntfy' && chConfig.webhook && chConfig.token)
    await sendNtfyNotification(mappedEvent, chConfig.webhook, chConfig.token);
  else if (ch === 'pushover' && chConfig.token && chConfig.secret)
    await sendPushoverNotification(mappedEvent, chConfig.token, chConfig.secret);
  else if (ch === 'apprise' && chConfig.webhook)
    await sendAppriseNotification(mappedEvent, chConfig.webhook, chConfig.token);
  else if (genericWebhookChannels.has(ch) && chConfig.webhook)
    await sendGenericWebhookNotification(mappedEvent, chConfig.webhook, ch);
  else throw new Error(`No valid config for channel ${ch}`);
}

/**
 * Track consecutive failures for a notification account.
 * After 3 consecutive failures, auto-disable the account.
 */
async function trackConsecutiveFailure(accountId: number, channelType: string, errorMsg: string): Promise<void> {
  try {
    // Count recent consecutive failures for this account
    const result = await query(
      `SELECT COUNT(*) as fail_count FROM event_trigger_logs 
       WHERE account_id = ? AND channel_type = ? AND status = 'failed'
       AND id > COALESCE(
         (SELECT MAX(id) FROM event_trigger_logs WHERE account_id = ? AND channel_type = ? AND status = 'success'),
         0
       )`,
      [accountId, channelType, accountId, channelType]
    );
    const consecutiveFailures = (result.rows[0]?.fail_count || 0) + 1; // +1 for current failure
    
    if (consecutiveFailures >= 3) {
      await query(
        `UPDATE notification_accounts SET is_active = 0, updated_at = datetime('now') WHERE id = ?`,
        [accountId]
      );
      console.log(`[Notifications] Channel ${channelType} (account ${accountId}) disabled after 3 consecutive failures`);
    }
  } catch (error) {
    console.error('[Notifications] Failed to track consecutive failure:', error);
  }
}

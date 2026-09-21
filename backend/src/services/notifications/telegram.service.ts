import axios from 'axios';
import { getBlessing } from '../../../../shared/src/blessings.js';

/**
 * Escape reserved characters for Telegram MarkdownV2.
 *
 * Telegram rejects the whole request with 400 "can't parse entities" whenever a
 * reserved character appears in plain text without a preceding backslash, so
 * every dynamic value interpolated into the message MUST go through this.
 *
 * Reserved set (per Bot API docs): _ * [ ] ( ) ~ ` > # + - = | { } . !
 * The escape character `\` itself is included first so a literal backslash is
 * not left dangling.
 *
 * @see https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdownV2(value: unknown): string {
  return String(value ?? '').replace(/([\\_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

export async function sendTelegramNotification(event: any, botToken: string, chatId: string): Promise<void> {
  let text: string;
  if (event.customMessage) {
    text = escapeMarkdownV2(event.customMessage);
  } else {
    const blessing = getBlessing(
      event.type,
      event.reminderConfig?.customMessage,
      event.personName,
      event.reminderRecipientName
    );
    // Only the event name is wrapped in bold; every interpolated value is escaped.
    text = [
      `📅 *${escapeMarkdownV2(event.name)}*`,
      '',
      `📆 日期: ${escapeMarkdownV2(event.date)}`,
      `🏷️ 类型: ${escapeMarkdownV2(event.type)}`,
      '',
      `🎉 ${escapeMarkdownV2(blessing)}`
    ].join('\n');
  }
  await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: chatId, text, parse_mode: 'MarkdownV2'
  }, { timeout: 10000 });
}

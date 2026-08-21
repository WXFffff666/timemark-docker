import { query } from '../db/index.js';

const MAX_TITLE = 200;
const MAX_BODY = 4000;
const MAX_SENDER = 100;

export type InboxSource = 'inbound' | 'notification' | 'broadcast';

export interface InboxMessageRow {
  id: number;
  user_id: number;
  title: string;
  body: string;
  source: InboxSource;
  channel: string | null;
  event_id: number | null;
  sender_label: string | null;
  is_read: boolean;
  created_at: string;
}

function sanitizeText(input: string, maxLen: number): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export async function createInboxMessage(params: {
  userId: number;
  title: string;
  body: string;
  source: InboxSource;
  channel?: string | null;
  eventId?: number | null;
  senderLabel?: string | null;
}): Promise<InboxMessageRow | null> {
  const title = sanitizeText(params.title, MAX_TITLE);
  const body = sanitizeText(params.body, MAX_BODY);
  if (!title || !body) return null;

  const senderLabel = params.senderLabel
    ? sanitizeText(params.senderLabel, MAX_SENDER)
    : null;

  const result = await query(
    `INSERT INTO inbox_messages (user_id, title, body, source, channel, event_id, sender_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.userId,
      title,
      body,
      params.source,
      params.channel ?? null,
      params.eventId ?? null,
      senderLabel,
    ],
  );
  return result.rows[0] as InboxMessageRow;
}

export async function listInboxMessages(
  userId: number,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
): Promise<{ messages: InboxMessageRow[]; total: number; unreadCount: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const unreadOnly = options.unreadOnly === true;

  // 收件箱仅展示外部推送（inbound），出站提醒/广播回执见「提醒日志」
  const where = unreadOnly
    ? "WHERE user_id = $1 AND source = 'inbound' AND is_read = FALSE"
    : "WHERE user_id = $1 AND source = 'inbound'";
  const params: unknown[] = [userId];

  const [listResult, countResult, unreadResult] = await Promise.all([
    query(
      `SELECT * FROM inbox_messages ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [...params, limit, offset],
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM inbox_messages ${where}`,
      params,
    ),
    query(
      `SELECT COUNT(*)::int AS unread FROM inbox_messages WHERE user_id = $1 AND source = 'inbound' AND is_read = FALSE`,
      [userId],
    ),
  ]);

  return {
    messages: listResult.rows as InboxMessageRow[],
    total: countResult.rows[0]?.total ?? 0,
    unreadCount: unreadResult.rows[0]?.unread ?? 0,
  };
}

export async function markInboxRead(userId: number, messageId: number): Promise<boolean> {
  const result = await query(
    `UPDATE inbox_messages SET is_read = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [messageId, userId],
  );
  return result.rows.length > 0;
}

export async function markAllInboxRead(userId: number): Promise<number> {
  const result = await query(
    `UPDATE inbox_messages SET is_read = TRUE
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );
  return result.rowCount ?? 0;
}

export async function deleteInboxMessage(userId: number, messageId: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM inbox_messages WHERE id = $1 AND user_id = $2 RETURNING id`,
    [messageId, userId],
  );
  return result.rows.length > 0;
}

export async function purgeOldInboxMessages(): Promise<number> {
  const result = await query(
    `DELETE FROM inbox_messages WHERE created_at < NOW() - INTERVAL '30 days'`,
  );
  return result.rowCount ?? 0;
}

export async function getInboxReceiveTokens(userId: number): Promise<{
  inboxReceiveToken: string | null;
  inboxReceiveSecret: string | null;
}> {
  const row = await query(
    `SELECT inbox_receive_token, inbox_receive_secret FROM user_configs WHERE user_id = $1`,
    [userId],
  );
  const r = row.rows[0] || {};
  return {
    inboxReceiveToken: r.inbox_receive_token ?? null,
    inboxReceiveSecret: r.inbox_receive_secret ?? null,
  };
}

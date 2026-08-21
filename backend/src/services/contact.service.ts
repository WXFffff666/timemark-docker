import { query } from '../db/index.js';
import { parseChannelAccountIds } from '@timemark/shared';
import { parseContactMethods, getAllContactEmails, type ContactMethods } from '@timemark/shared';
import { contactToChannelFields } from '@timemark/shared';

export interface FixedContactRow {
  id: number;
  user_id?: number;
  name: string;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  telegram_chat_id?: string | null;
  qq?: string | null;
  wxpusher_uid?: string | null;
  emails: any[];
  phones: any[];
  telegrams: any[];
  qqs: any[];
  wxpusher_uids: any[];
  preferred_channels?: unknown;
  channel_account_ids: number[];
  contact_methods?: unknown;
  relationship?: string | null;
  gender?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }
  return fallback;
}

function methodsFromRow(row: Record<string, unknown>): ContactMethods {
  const legacy = {
    email: row.email as string | null,
    phone: row.phone as string | null,
    telegram_chat_id: row.telegram_chat_id as string | null,
    qq: row.qq as string | null,
    wxpusher_uid: row.wxpusher_uid as string | null,
  };
  const stored = parseContactMethods(parseJsonColumn(row.contact_methods, null), legacy);
  return stored;
}

function mapContactRow(row: Record<string, unknown>): FixedContactRow {
  const methods = methodsFromRow(row);
  return {
    ...(row as any),
    emails: methods.emails,
    phones: methods.phones,
    telegrams: methods.telegrams,
    qqs: methods.qqs,
    wxpusher_uids: methods.wxpusherUids,
    channel_account_ids: parseChannelAccountIds(row.preferred_channels),
  };
}

export function getContactChannelFields(row: FixedContactRow) {
  return contactToChannelFields(row as any);
}

export function getContactAllEmails(row: FixedContactRow): string[] {
  return getAllContactEmails(methodsFromRow(row as unknown as Record<string, unknown>), row.email);
}

export async function getFixedContact(userId: number, contactId: number): Promise<FixedContactRow | null> {
  const result = await query('SELECT * FROM fixed_contacts WHERE id = ? AND user_id = ?', [contactId, userId]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapContactRow(row);
}

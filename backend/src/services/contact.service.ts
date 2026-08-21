import { query } from '../db/index.js';
import type { CreateFixedContactInput, UpdateFixedContactInput } from '@timemark/shared';
import {
  parseChannelAccountIds,
  normalizeEmail,
  contactToChannelFields,
} from '@timemark/shared';
import {
  mergeContactMethodsInput,
  contactMethodsToLegacyColumns,
  contactMethodsHasAnyChannel,
  parseContactMethods,
  serializeContactMethods,
  getAllContactEmails,
  type ContactLabeledEntry,
  type ContactMethods,
} from '@timemark/shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  emails: ContactLabeledEntry[];
  phones: ContactLabeledEntry[];
  telegrams: ContactLabeledEntry[];
  qqs: ContactLabeledEntry[];
  wxpusher_uids: ContactLabeledEntry[];
  preferred_channels?: unknown;
  channel_account_ids: number[];
  relationship?: string | null;
  gender?: string | null;
  notes?: string | null;
  validation_status?: string | null;
  last_validated_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
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
  const legacy = contactMethodsToLegacyColumns(methods);
  return {
    ...(row as Omit<FixedContactRow, 'channel_account_ids' | 'emails' | 'phones' | 'telegrams' | 'qqs' | 'wxpusher_uids'>),
    email: legacy.email,
    phone: legacy.phone,
    telegram_chat_id: legacy.telegram_chat_id,
    qq: legacy.qq,
    wxpusher_uid: legacy.wxpusher_uid,
    emails: methods.emails,
    phones: methods.phones,
    telegrams: methods.telegrams,
    qqs: methods.qqs,
    wxpusher_uids: methods.wxpusherUids,
    channel_account_ids: parseChannelAccountIds(row.preferred_channels),
  };
}

export function getContactChannelFields(row: FixedContactRow) {
  return contactToChannelFields(row);
}

export function getContactAllEmails(row: FixedContactRow): string[] {
  return getAllContactEmails(methodsFromRow(row as unknown as Record<string, unknown>), row.email);
}

export function validateContactMethods(methods: ContactMethods): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const e of methods.emails) {
    if (!EMAIL_RE.test(e.value)) errors.push(`邮箱格式无效: ${e.label || e.value}`);
  }
  for (const q of methods.qqs) {
    if (!/^\d{5,12}$/.test(q.value)) errors.push(`QQ 号格式无效: ${q.label || q.value}`);
  }
  for (const t of methods.telegrams) {
    if (!/^-?\d+$/.test(t.value)) errors.push(`Telegram Chat ID 格式无效: ${t.label || t.value}`);
  }
  for (const w of methods.wxpusherUids) {
    if (!/^UID_/i.test(w.value)) errors.push(`WxPusher UID 应以 UID_ 开头: ${w.label || w.value}`);
  }
  if (!contactMethodsHasAnyChannel(methods)) errors.push('至少一种联系方式');
  return { valid: errors.length === 0, errors };
}

/** @deprecated 使用 validateContactMethods */
export function validateContactFields(contact: {
  email?: string | null;
  phone?: string | null;
  telegram_chat_id?: string | null;
  qq?: string | null;
  wxpusher_uid?: string | null;
}): { valid: boolean; errors: string[] } {
  return validateContactMethods(parseContactMethods(null, contact));
}

function inputToMethods(input: CreateFixedContactInput | UpdateFixedContactInput): ContactMethods {
  return mergeContactMethodsInput({
    emails: input.emails,
    phones: input.phones,
    telegrams: input.telegrams,
    qqs: input.qqs,
    wxpusherUids: input.wxpusherUids,
    email: input.email,
    phone: input.phone,
    telegramChatId: input.telegramChatId,
    qq: input.qq,
    wxpusherUid: input.wxpusherUid,
  });
}

export async function listFixedContacts(userId: number): Promise<FixedContactRow[]> {
  const result = await query(
    `SELECT id, name, nickname, email, phone, telegram_chat_id, qq, wxpusher_uid,
            contact_methods, preferred_channels, relationship, gender, notes,
            validation_status, last_validated_at, created_at, updated_at
     FROM fixed_contacts WHERE user_id = $1 ORDER BY name ASC`,
    [userId],
  );
  return result.rows.map(mapContactRow);
}

export async function createFixedContact(userId: number, input: CreateFixedContactInput): Promise<FixedContactRow> {
  const methods = inputToMethods(input);
  const validation = validateContactMethods(methods);
  if (!validation.valid) throw new Error(validation.errors.join('; '));

  const legacy = contactMethodsToLegacyColumns(methods);

  const result = await query(
    `INSERT INTO fixed_contacts
     (user_id, name, nickname, email, phone, telegram_chat_id, qq, wxpusher_uid, contact_methods, preferred_channels, relationship, gender, notes, validation_status, last_validated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'valid',CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      userId,
      input.name,
      input.nickname || null,
      legacy.email,
      legacy.phone,
      legacy.telegram_chat_id,
      legacy.qq,
      legacy.wxpusher_uid,
      JSON.stringify(serializeContactMethods(methods)),
      JSON.stringify(input.channelAccountIds || []),
      input.relationship?.trim() || null,
      input.gender || 'unknown',
      input.notes || null,
    ],
  );
  return mapContactRow(result.rows[0]);
}

export async function updateFixedContact(userId: number, id: number, input: UpdateFixedContactInput): Promise<FixedContactRow | null> {
  const existing = await query('SELECT * FROM fixed_contacts WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!existing.rows[0]) return null;

  const prev = mapContactRow(existing.rows[0]);
  const methods = mergeContactMethodsInput({
    emails: input.emails ?? prev.emails,
    phones: input.phones ?? prev.phones,
    telegrams: input.telegrams ?? prev.telegrams,
    qqs: input.qqs ?? prev.qqs,
    wxpusherUids: input.wxpusherUids ?? prev.wxpusher_uids,
    email: input.email !== undefined ? input.email : prev.email || undefined,
    phone: input.phone !== undefined ? input.phone : prev.phone || undefined,
    telegramChatId: input.telegramChatId !== undefined ? input.telegramChatId : prev.telegram_chat_id || undefined,
    qq: input.qq !== undefined ? input.qq : prev.qq || undefined,
    wxpusherUid: input.wxpusherUid !== undefined ? input.wxpusherUid : prev.wxpusher_uid || undefined,
  });

  const validation = validateContactMethods(methods);
  if (!validation.valid) throw new Error(validation.errors.join('; '));

  const legacy = contactMethodsToLegacyColumns(methods);

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 0;

  if (input.name !== undefined) {
    i++;
    fields.push(`name = $${i}`);
    values.push(input.name);
  }
  if (input.nickname !== undefined) {
    i++;
    fields.push(`nickname = $${i}`);
    values.push(input.nickname || null);
  }
  if (input.notes !== undefined) {
    i++;
    fields.push(`notes = $${i}`);
    values.push(input.notes || null);
  }
  if (input.relationship !== undefined) {
    i++;
    fields.push(`relationship = $${i}`);
    values.push(input.relationship?.trim() || null);
  }
  if (input.gender !== undefined) {
    i++;
    fields.push(`gender = $${i}`);
    values.push(input.gender || 'unknown');
  }

  const contactFieldsTouched =
    input.emails !== undefined
    || input.phones !== undefined
    || input.telegrams !== undefined
    || input.qqs !== undefined
    || input.wxpusherUids !== undefined
    || input.email !== undefined
    || input.phone !== undefined
    || input.telegramChatId !== undefined
    || input.qq !== undefined
    || input.wxpusherUid !== undefined;

  if (contactFieldsTouched) {
    for (const [col, val] of Object.entries({
      email: legacy.email,
      phone: legacy.phone,
      telegram_chat_id: legacy.telegram_chat_id,
      qq: legacy.qq,
      wxpusher_uid: legacy.wxpusher_uid,
    })) {
      i++;
      fields.push(`${col} = $${i}`);
      values.push(val);
    }
    i++;
    fields.push(`contact_methods = $${i}`);
    values.push(JSON.stringify(serializeContactMethods(methods)));
  }

  if (input.channelAccountIds !== undefined) {
    i++;
    fields.push(`preferred_channels = $${i}`);
    values.push(JSON.stringify(input.channelAccountIds));
  }

  if (fields.length === 0) return prev;

  i++;
  fields.push(`validation_status = $${i}`);
  values.push('valid');
  i++;
  fields.push(`last_validated_at = CURRENT_TIMESTAMP`);
  i++;
  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id, userId);

  const result = await query(
    `UPDATE fixed_contacts SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
    values,
  );
  return result.rows[0] ? mapContactRow(result.rows[0]) : null;
}

export async function getFixedContact(userId: number, id: number): Promise<FixedContactRow | null> {
  const result = await query('SELECT * FROM fixed_contacts WHERE id = $1 AND user_id = $2', [id, userId]);
  return result.rows[0] ? mapContactRow(result.rows[0]) : null;
}

export async function deleteFixedContact(userId: number, id: number) {
  const result = await query('DELETE FROM fixed_contacts WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return result.rowCount ? true : false;
}

export async function getContactsByIds(userId: number, ids: number[]): Promise<FixedContactRow[]> {
  if (ids.length === 0) return [];
  const result = await query(
    `SELECT * FROM fixed_contacts WHERE user_id = $1 AND id = ANY($2::int[])`,
    [userId, ids],
  );
  return result.rows.map(mapContactRow);
}

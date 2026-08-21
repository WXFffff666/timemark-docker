/** 通知渠道类型与联系人字段的对应关系 */
export const CONTACT_CHANNEL_FIELDS: Record<string, keyof ContactChannelFields> = {
  resend: 'email',
  email: 'email',
  smtp: 'email',
  telegram: 'telegramChatId',
  wxpusher: 'wxpusherUid',
  qq: 'qq',
  twilio: 'phone',
};

export interface ContactChannelFields {
  email?: string | null;
  emails?: Array<{ label: string; value: string }>;
  phone?: string | null;
  phones?: Array<{ label: string; value: string }>;
  telegramChatId?: string | null;
  telegrams?: Array<{ label: string; value: string }>;
  qq?: string | null;
  qqs?: Array<{ label: string; value: string }>;
  wxpusherUid?: string | null;
  wxpusherUids?: Array<{ label: string; value: string }>;
}

export const EMAIL_CHANNEL_TYPES = new Set(['resend', 'email', 'smtp']);

export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const v = email.trim().toLowerCase();
  return v || null;
}

export function parseChannelAccountIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
}

function hasLabeledValues(list?: Array<{ value: string }>): boolean {
  return !!(list?.some((e) => String(e.value || '').trim()));
}

export function contactHasChannelAddress(
  channelType: string,
  contact: ContactChannelFields,
): boolean {
  const field = CONTACT_CHANNEL_FIELDS[channelType];
  if (!field) return true;
  if (field === 'email') {
    return !!(contact.email?.trim() || hasLabeledValues(contact.emails));
  }
  if (field === 'phone') {
    return !!(contact.phone?.trim() || hasLabeledValues(contact.phones));
  }
  if (field === 'telegramChatId') {
    return !!(contact.telegramChatId?.trim() || hasLabeledValues(contact.telegrams));
  }
  if (field === 'qq') {
    return !!(contact.qq?.trim() || hasLabeledValues(contact.qqs));
  }
  if (field === 'wxpusherUid') {
    return !!(contact.wxpusherUid?.trim() || hasLabeledValues(contact.wxpusherUids));
  }
  const value = contact[field];
  return !!(value && String(value).trim());
}

export function normalizeNotificationChatId(type: string, chatId?: string | null): string | undefined {
  const trimmed = chatId?.trim();
  if (!trimmed) return undefined;
  if (EMAIL_CHANNEL_TYPES.has(type)) {
    return normalizeEmail(trimmed) ?? undefined;
  }
  return trimmed;
}

export function getContactAddressForChannel(
  channelType: string,
  contact: ContactChannelFields,
): string | null {
  const field = CONTACT_CHANNEL_FIELDS[channelType];
  if (!field) return null;
  if (field === 'email') {
    const fromList = contact.emails?.find((e) => e.value.trim());
    if (fromList) return normalizeEmail(fromList.value) || fromList.value.trim();
    return contact.email?.trim() ? (normalizeEmail(contact.email) || contact.email.trim()) : null;
  }
  if (field === 'phone') {
    return contact.phones?.[0]?.value?.trim() || contact.phone?.trim() || null;
  }
  if (field === 'telegramChatId') {
    return contact.telegrams?.[0]?.value?.trim() || contact.telegramChatId?.trim() || null;
  }
  if (field === 'qq') {
    return contact.qqs?.[0]?.value?.trim() || contact.qq?.trim() || null;
  }
  if (field === 'wxpusherUid') {
    return contact.wxpusherUids?.[0]?.value?.trim() || contact.wxpusherUid?.trim() || null;
  }
  const value = contact[field];
  return value ? String(value).trim() : null;
}

export function contactToChannelFields(row: {
  email?: string | null;
  phone?: string | null;
  telegram_chat_id?: string | null;
  qq?: string | null;
  wxpusher_uid?: string | null;
  emails?: Array<{ label: string; value: string }>;
  phones?: Array<{ label: string; value: string }>;
  telegrams?: Array<{ label: string; value: string }>;
  qqs?: Array<{ label: string; value: string }>;
  wxpusher_uids?: Array<{ label: string; value: string }>;
}): ContactChannelFields {
  return {
    email: row.email,
    emails: row.emails,
    phone: row.phone,
    phones: row.phones,
    telegramChatId: row.telegram_chat_id,
    telegrams: row.telegrams,
    qq: row.qq,
    qqs: row.qqs,
    wxpusherUid: row.wxpusher_uid,
    wxpusherUids: row.wxpusher_uids,
  };
}

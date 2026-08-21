import {
  getAllContactEmails,
  parseContactMethods,
  contactToChannelFields,
  type ContactLabeledEntry,
} from '@timemark/shared';

export interface ContactLike {
  email?: string | null;
  phone?: string | null;
  telegram_chat_id?: string | null;
  qq?: string | null;
  wxpusher_uid?: string | null;
  emails?: ContactLabeledEntry[];
  phones?: ContactLabeledEntry[];
  telegrams?: ContactLabeledEntry[];
  qqs?: ContactLabeledEntry[];
  wxpusher_uids?: ContactLabeledEntry[];
  wxpusherUids?: ContactLabeledEntry[];
}

export function getContactEmailList(contact: ContactLike): string[] {
  const methods = parseContactMethods(
    {
      emails: contact.emails,
      phones: contact.phones,
      telegrams: contact.telegrams,
      qqs: contact.qqs,
      wxpusherUids: contact.wxpusher_uids ?? contact.wxpusherUids,
    },
    {
      email: contact.email,
      phone: contact.phone,
      telegram_chat_id: contact.telegram_chat_id,
      qq: contact.qq,
      wxpusher_uid: contact.wxpusher_uid,
    },
  );
  return getAllContactEmails(methods, contact.email);
}

export function contactHasAnyEmail(contact: ContactLike): boolean {
  return getContactEmailList(contact).length > 0;
}

export function contactChannelFieldsFromRow(contact: ContactLike) {
  return contactToChannelFields({
    email: contact.email,
    emails: contact.emails,
    phone: contact.phone,
    phones: contact.phones,
    telegram_chat_id: contact.telegram_chat_id,
    telegrams: contact.telegrams,
    qq: contact.qq,
    qqs: contact.qqs,
    wxpusher_uid: contact.wxpusher_uid,
    wxpusher_uids: contact.wxpusher_uids ?? contact.wxpusherUids,
  });
}

export function formatLabeledList(entries?: ContactLabeledEntry[], legacy?: string | null): string {
  const items = entries?.filter((e) => e.value.trim()) ?? [];
  if (items.length === 0 && legacy) return legacy;
  return items.map((e) => (e.label && e.label !== '默认' ? `${e.label}: ${e.value}` : e.value)).join('、');
}

export function ensureLabeledEntries(list?: ContactLabeledEntry[], legacy?: string | null): ContactLabeledEntry[] {
  if (list?.length) return list.map((e) => ({ label: e.label || '', value: e.value || '' }));
  if (legacy?.trim()) return [{ label: '', value: legacy.trim() }];
  return [{ label: '', value: '' }];
}

import { normalizeEmail } from './contact-channels.js';

/** 带标签的联系方式，如「工作邮箱」「妈妈手机」 */
export interface ContactLabeledEntry {
  label: string;
  value: string;
}

export interface ContactMethods {
  emails: ContactLabeledEntry[];
  phones: ContactLabeledEntry[];
  telegrams: ContactLabeledEntry[];
  qqs: ContactLabeledEntry[];
  wxpusherUids: ContactLabeledEntry[];
}

export const EMPTY_CONTACT_METHODS: ContactMethods = {
  emails: [],
  phones: [],
  telegrams: [],
  qqs: [],
  wxpusherUids: [],
};

export function normalizeLabeledEntries(raw: unknown, normalizeValue?: (v: string) => string): ContactLabeledEntry[] {
  if (!Array.isArray(raw)) return [];
  const norm = normalizeValue ?? ((v: string) => v.trim());
  const out: ContactLabeledEntry[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const value = norm(item);
      if (value) out.push({ label: '默认', value });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const o = item as { label?: string; value?: string };
    const value = norm(String(o.value || ''));
    if (!value) continue;
    const label = String(o.label || '').trim() || '默认';
    out.push({ label, value });
  }
  return dedupeLabeledEntries(out);
}

function dedupeLabeledEntries(entries: ContactLabeledEntry[]): ContactLabeledEntry[] {
  const seen = new Set<string>();
  const result: ContactLabeledEntry[] = [];
  for (const e of entries) {
    const key = e.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(e);
  }
  return result;
}

export interface LegacyContactFields {
  email?: string | null;
  phone?: string | null;
  telegram_chat_id?: string | null;
  qq?: string | null;
  wxpusher_uid?: string | null;
}

export function parseContactMethods(
  raw: unknown,
  legacy?: LegacyContactFields,
): ContactMethods {
  const base = EMPTY_CONTACT_METHODS;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return {
      emails: normalizeLabeledEntries(o.emails, (v) => normalizeEmail(v) || v.trim()),
      phones: normalizeLabeledEntries(o.phones),
      telegrams: normalizeLabeledEntries(o.telegrams),
      qqs: normalizeLabeledEntries(o.qqs),
      wxpusherUids: normalizeLabeledEntries(o.wxpusherUids ?? o.wxpusher),
    };
  }

  const methods: ContactMethods = { ...base };
  if (legacy?.email) {
    const e = normalizeEmail(legacy.email);
    if (e) methods.emails.push({ label: '默认', value: e });
  }
  if (legacy?.phone?.trim()) methods.phones.push({ label: '默认', value: legacy.phone.trim() });
  if (legacy?.telegram_chat_id?.trim()) {
    methods.telegrams.push({ label: '默认', value: legacy.telegram_chat_id.trim() });
  }
  if (legacy?.qq?.trim()) methods.qqs.push({ label: '默认', value: legacy.qq.trim() });
  if (legacy?.wxpusher_uid?.trim()) {
    methods.wxpusherUids.push({ label: '默认', value: legacy.wxpusher_uid.trim() });
  }
  return methods;
}

/** 合并 API 入参（数组 + 旧单字段） */
export function mergeContactMethodsInput(input: {
  emails?: ContactLabeledEntry[];
  phones?: ContactLabeledEntry[];
  telegrams?: ContactLabeledEntry[];
  qqs?: ContactLabeledEntry[];
  wxpusherUids?: ContactLabeledEntry[];
  email?: string;
  phone?: string;
  telegramChatId?: string;
  qq?: string;
  wxpusherUid?: string;
}): ContactMethods {
  const methods = parseContactMethods(null, {
    email: input.email,
    phone: input.phone,
    telegram_chat_id: input.telegramChatId,
    qq: input.qq,
    wxpusher_uid: input.wxpusherUid,
  });

  const merge = (target: ContactLabeledEntry[], incoming?: ContactLabeledEntry[], norm?: (v: string) => string) => {
    if (!incoming?.length) return;
    const extra = normalizeLabeledEntries(incoming, norm);
    for (const e of extra) {
      if (!target.some((t) => t.value.toLowerCase() === e.value.toLowerCase())) {
        target.push(e);
      }
    }
  };

  merge(methods.emails, input.emails, (v) => normalizeEmail(v) || v.trim());
  merge(methods.phones, input.phones);
  merge(methods.telegrams, input.telegrams);
  merge(methods.qqs, input.qqs);
  merge(methods.wxpusherUids, input.wxpusherUids);

  return methods;
}

export function contactMethodsToLegacyColumns(methods: ContactMethods): LegacyContactFields {
  return {
    email: methods.emails[0]?.value ? normalizeEmail(methods.emails[0].value) : null,
    phone: methods.phones[0]?.value?.trim() || null,
    telegram_chat_id: methods.telegrams[0]?.value?.trim() || null,
    qq: methods.qqs[0]?.value?.trim() || null,
    wxpusher_uid: methods.wxpusherUids[0]?.value?.trim() || null,
  };
}

export function getAllContactEmails(methods: ContactMethods, legacyEmail?: string | null): string[] {
  const set = new Set<string>();
  for (const e of methods.emails) {
    const n = normalizeEmail(e.value);
    if (n) set.add(n);
  }
  const leg = normalizeEmail(legacyEmail);
  if (leg) set.add(leg);
  return [...set];
}

export function contactMethodsHasAnyChannel(methods: ContactMethods): boolean {
  return (
    methods.emails.length > 0
    || methods.phones.length > 0
    || methods.telegrams.length > 0
    || methods.qqs.length > 0
    || methods.wxpusherUids.length > 0
  );
}

export function serializeContactMethods(methods: ContactMethods): Record<string, ContactLabeledEntry[]> {
  return {
    emails: methods.emails,
    phones: methods.phones,
    telegrams: methods.telegrams,
    qqs: methods.qqs,
    wxpusherUids: methods.wxpusherUids,
  };
}

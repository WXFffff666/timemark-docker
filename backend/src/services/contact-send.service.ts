import {
  getFixedContact,
  getContactChannelFields,
  getContactAllEmails,
} from './contact.service.js';
import { getNotificationAccounts } from './config.service.js';
import { resolveEmailAccount, sendRawEmail } from './email-send.service.js';
import { logEmail } from './email-log.service.js';
import {
  EMAIL_CHANNEL_TYPES,
  getContactAddressForChannel,
  parseChannelAccountIds,
  normalizeEmail,
} from '@timemark/shared';
import type { ContactSendEmailInput } from '@timemark/shared';

function resolveAllowedTargets(
  allEmails: string[],
  requested?: string[],
): string[] {
  const allowed = new Set(allEmails.map((e) => normalizeEmail(e) || e).filter(Boolean));
  if (!requested?.length) return [...allowed];
  const targets: string[] = [];
  for (const raw of requested) {
    const normalized = normalizeEmail(raw) || raw.trim();
    if (normalized && allowed.has(normalized)) targets.push(normalized);
  }
  return targets;
}

export async function sendContactEmail(
  userId: number,
  contactId: number,
  input: ContactSendEmailInput,
) {
  const contact = await getFixedContact(userId, contactId);
  if (!contact) throw new Error('联系人不存在');

  const allEmails = getContactAllEmails(contact);
  if (allEmails.length === 0) throw new Error('该联系人未配置邮箱地址');

  const targets = resolveAllowedTargets(allEmails, input.recipientEmails);
  if (targets.length === 0) {
    throw new Error('收件邮箱必须属于该联系人');
  }

  const boundIds = parseChannelAccountIds(contact.channel_account_ids ?? contact.preferred_channels);
  const accounts = await getNotificationAccounts(userId);
  const activeAccounts = accounts.filter((a) => a.is_active !== false);

  let accountId = input.accountId;
  if (!accountId && boundIds.length > 0) {
    const emailBound = boundIds.find((id) => {
      const acc = activeAccounts.find((a) => Number(a.id) === id);
      return acc && EMAIL_CHANNEL_TYPES.has(acc.type);
    });
    if (emailBound) accountId = emailBound;
  }

  const creds = await resolveEmailAccount(userId, accountId);
  const account = activeAccounts.find((a) => Number(a.id) === creds.id);
  const channelFields = getContactChannelFields(contact);
  if (account && !getContactAddressForChannel(account.type, channelFields)) {
    throw new Error(`联系人缺少 ${account.type} 渠道所需的联系方式`);
  }

  const sent: string[] = [];
  const errors: string[] = [];

  for (const email of targets) {
    try {
      await sendRawEmail(creds, email, input.subject, input.html);
      sent.push(email);
      await logEmail({
        userId,
        recipient: email,
        status: 'sent',
        subject: input.subject,
        channelType: creds.type,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${email}: ${msg}`);
      await logEmail({
        userId,
        recipient: email,
        status: 'failed',
        subject: input.subject,
        errorMessage: msg,
        channelType: creds.type,
      });
    }
  }

  if (sent.length === 0) {
    throw new Error(errors.join('；') || '发送失败');
  }

  return {
    contactId,
    accountId: creds.id,
    accountName: creds.name,
    recipients: sent,
    failed: errors,
  };
}

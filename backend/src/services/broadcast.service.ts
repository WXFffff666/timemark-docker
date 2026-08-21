import { query } from '../db/index.js';
import { getContactsByIds, listFixedContacts, getContactAllEmails } from './contact.service.js';
import { resolveEmailAccount, sendRawEmail } from './email-send.service.js';
import { escapeHtml } from '../utils/html.js';
import { renderBroadcastTemplate, resolveContactGreetingName, sanitizeHtmlPreview } from '@timemark/shared';
import type { BroadcastEmailInput } from '@timemark/shared';

interface BroadcastRecipient {
  email: string;
  name?: string;
}

async function getAllowedContactEmails(userId: number): Promise<Set<string>> {
  const allowed = new Set<string>();
  const all = await listFixedContacts(userId);
  for (const c of all) {
    for (const email of getContactAllEmails(c)) {
      const normalized = String(email || '').trim().toLowerCase();
      if (normalized) allowed.add(normalized);
    }
    if (c.email) {
      const normalized = String(c.email).trim().toLowerCase();
      if (normalized) allowed.add(normalized);
    }
  }
  return allowed;
}

async function resolveRecipients(userId: number, input: BroadcastEmailInput): Promise<BroadcastRecipient[]> {
  const byEmail = new Map<string, BroadcastRecipient>();

  const add = (email: string, name?: string) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized.includes('@')) return;
    const existing = byEmail.get(normalized);
    if (!existing) {
      byEmail.set(normalized, { email: normalized, name: name?.trim() || undefined });
    } else if (name?.trim() && !existing.name) {
      existing.name = name.trim();
    }
  };

  if (input.recipientEmails?.length) {
    const allowed = await getAllowedContactEmails(userId);
    for (const e of input.recipientEmails) {
      const normalized = String(e || '').trim().toLowerCase();
      if (!allowed.has(normalized)) {
        throw new Error(`收件人 ${e} 不在联系人列表中，无法发送`);
      }
      add(e);
    }
  }
  if (input.contactIds?.length) {
    const contacts = await getContactsByIds(userId, input.contactIds);
    for (const c of contacts) {
      const emails = getContactAllEmails(c);
      if (emails.length) {
        for (const email of emails) add(email, resolveContactGreetingName(c));
      } else if (c.email) add(c.email, resolveContactGreetingName(c));
    }
  }
  if (input.useAllContacts) {
    const all = await listFixedContacts(userId);
    for (const c of all) {
      const emails = getContactAllEmails(c);
      if (emails.length) {
        for (const email of emails) add(email, resolveContactGreetingName(c));
      } else if (c.email) add(c.email, resolveContactGreetingName(c));
    }
  }
  return [...byEmail.values()];
}

function personalizeBroadcast(subject: string, html: string, recipient: BroadcastRecipient) {
  const vars = { contact_name: recipient.name, subject };
  return {
    subject: renderBroadcastTemplate(subject, vars),
    html: renderBroadcastTemplate(html, vars),
  };
}

export async function sendBroadcastEmail(userId: number, input: BroadcastEmailInput) {
  const recipients = await resolveRecipients(userId, input);
  if (recipients.length === 0) {
    throw new Error('没有有效的收件人邮箱');
  }
  if (recipients.length > 500) {
    throw new Error('单次最多发送 500 封邮件');
  }

  const creds = await resolveEmailAccount(userId, input.accountId);

  const campaign = await query(
    `INSERT INTO broadcast_campaigns (user_id, subject, body_html, recipient_count, status, recipient_source)
     VALUES ($1, $2, $3, $4, 'sending', $5) RETURNING id`,
    [
      userId,
      input.subject,
      input.html,
      recipients.length,
      input.useAllContacts ? 'all_contacts' : input.contactIds?.length ? 'contacts' : 'manual',
    ],
  );
  const campaignId = campaign.rows[0].id as number;

  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    const { subject, html } = personalizeBroadcast(input.subject, input.html, recipient);
    try {
      await sendRawEmail(creds, recipient.email, subject, html);
      successCount++;
      await query(
        `INSERT INTO email_logs (user_id, recipient, status, message_id, broadcast_id, subject, channel_type) VALUES ($1, $2, 'sent', $3, $4, $5, $6)`,
        [userId, recipient.email, null, campaignId, subject, creds.type],
      ).catch(() => {});
    } catch (err) {
      failedCount++;
      errors.push(`${recipient.email}: ${err instanceof Error ? err.message : String(err)}`);
      await query(
        `INSERT INTO email_logs (user_id, recipient, status, broadcast_id, subject, channel_type) VALUES ($1, $2, 'failed', $3, $4, $5)`,
        [userId, recipient.email, campaignId, subject, creds.type],
      ).catch(() => {});
    }
  }

  const status = failedCount === recipients.length ? 'failed' : failedCount > 0 ? 'partial' : 'completed';
  await query(
    `UPDATE broadcast_campaigns SET success_count = $1, failed_count = $2, status = $3, completed_at = CURRENT_TIMESTAMP WHERE id = $4`,
    [successCount, failedCount, status, campaignId],
  );

  return {
    campaignId,
    recipientCount: recipients.length,
    successCount,
    failedCount,
    status,
    accountId: creds.id,
    accountName: creds.name,
    errors: errors.slice(0, 10),
  };
}

export async function listBroadcastCampaigns(userId: number) {
  const result = await query(
    `SELECT id, subject, recipient_count, success_count, failed_count, status, created_at, completed_at
     FROM broadcast_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return result.rows;
}

export function renderBroadcastPreview(subject: string, html: string) {
  return {
    subject: escapeHtml(subject),
    htmlPreview: sanitizeHtmlPreview(html.slice(0, 2000)),
  };
}

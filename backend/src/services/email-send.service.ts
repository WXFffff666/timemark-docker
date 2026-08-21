import { getNotificationAccounts } from './config.service.js';
import { EMAIL_CHANNEL_TYPES } from '@timemark/shared';
import { createSmtpTransporter } from '../utils/smtp-transporter.js';
import { htmlToPlainText } from '@timemark/shared';

export interface EmailAccountCreds {
  id: number;
  type: string;
  name: string;
  apiKey?: string;
  fromEmail: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpPassword?: string;
}

function mapAccountToEmailCreds(account: Record<string, unknown>): EmailAccountCreds | null {
  const type = String(account.type || '');
  if (!EMAIL_CHANNEL_TYPES.has(type)) return null;
  if (type === 'resend' || type === 'email') {
    if (!account.token) return null;
    return {
      id: Number(account.id),
      type,
      name: String(account.name || type),
      apiKey: String(account.token),
      fromEmail: String(account.webhook || 'TimeMark <onboarding@resend.dev>'),
    };
  }
  if (type === 'smtp') {
    if (!account.webhook || !account.token || !account.chat_id) return null;
    return {
      id: Number(account.id),
      type,
      name: String(account.name || 'SMTP'),
      fromEmail: String(account.chat_id),
      smtpHost: String(account.webhook),
      smtpPort: parseInt(String(account.secret || '587'), 10),
      smtpPassword: String(account.token),
    };
  }
  return null;
}

export async function getEmailAccounts(userId: number): Promise<EmailAccountCreds[]> {
  const accounts = await getNotificationAccounts(userId);
  return accounts
    .filter((a) => (a as any).is_active !== false)
    .map((a) => mapAccountToEmailCreds(a as unknown as Record<string, unknown>))
    .filter((a): a is EmailAccountCreds => a !== null);
}

export async function resolveEmailAccount(userId: number, accountId?: number): Promise<EmailAccountCreds> {
  const accounts = await getEmailAccounts(userId);
  if (accounts.length === 0) throw new Error('请先配置邮件通知渠道（Resend 或 SMTP）');
  if (accountId) {
    const found = accounts.find((a) => a.id === accountId);
    if (!found) throw new Error('指定的通知渠道账号不存在或未激活');
    return found;
  }
  return accounts[0]!;
}

export async function sendRawEmail(creds: EmailAccountCreds, to: string, subject: string, html: string): Promise<void> {
  const body = html;
  const text = typeof htmlToPlainText === 'function' ? htmlToPlainText(html) : html;
  if (creds.type === 'resend' || creds.type === 'email') {
    const { Resend } = await import('resend');
    const resend = new Resend(creds.apiKey!);
    const { error } = await resend.emails.send({ from: creds.fromEmail, to: [to], subject, html: body, text });
    if (error) throw new Error(String((error as any).message || error));
    return;
  }
  if (creds.type === 'smtp') {
    const port = creds.smtpPort ?? 587;
    const transporter = createSmtpTransporter(creds.smtpHost!, port, creds.fromEmail, creds.smtpPassword!);
    await transporter.sendMail({ from: creds.fromEmail, to, subject, html: body, text });
    return;
  }
  throw new Error(`不支持的邮件渠道: ${creds.type}`);
}

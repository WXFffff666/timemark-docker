import { query } from '../db/index.js';

export interface LogEmailInput {
  userId: number;
  recipient: string;
  status: 'sent' | 'failed';
  subject: string;
  errorMessage?: string;
  channelType?: string;
}

export async function logEmail(input: LogEmailInput): Promise<void> {
  try {
    await query(
      'INSERT INTO email_logs (user_id, recipient, status, subject, error_message, channel_type) VALUES (?, ?, ?, ?, ?, ?)',
      [input.userId, input.recipient, input.status, input.subject, input.errorMessage || null, input.channelType || null],
    );
  } catch {
    // ignore log failures
  }
}

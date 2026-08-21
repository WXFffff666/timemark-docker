import { randomUUID } from 'crypto';
import { query } from '../db/index.js';

export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'password_change'
  | 'account_locked'
  | 'ip_blocked'
  | 'new_device'
  | 'session_revoked'
  | 'totp_enabled'
  | 'totp_disabled'
  | 'passkey_registered'
  | 'passkey_removed'
  | 'passkey_login_success'
  | 'passkey_login_failure'
  | 'master_key_rotation';

export async function logSecurityEvent(params: {
  userId?: number | null;
  username?: string | null;
  eventType: SecurityEventType;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO security_events (id, user_id, username, event_type, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        params.userId ?? null,
        params.username ?? null,
        params.eventType,
        params.ip ?? null,
        params.userAgent ?? null,
        JSON.stringify(params.metadata ?? {}),
      ],
    );
  } catch (error) {
    console.error('[logSecurityEvent]', error);
  }
}

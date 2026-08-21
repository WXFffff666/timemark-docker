import { query } from '../db/index.js';

export async function logAudit(
  userId: number,
  action: string,
  entityType?: string,
  entityId?: string | number,
  details?: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, entityType ?? null, entityId != null ? String(entityId) : null, details ? JSON.stringify(details) : null],
  ).catch(() => {});
}

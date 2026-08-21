import { query } from '../db/index.js';

/** Returns a short note when other events exist on the same date. */
export async function getConflictHint(
  userId: number,
  eventDate: string,
  excludeEventId?: number,
): Promise<string | null> {
  const dateOnly = eventDate.slice(0, 10);
  const params: unknown[] = [userId, dateOnly];
  let sql = `SELECT COUNT(*)::int AS cnt FROM events WHERE user_id = $1 AND date::text LIKE $2 || '%'`;
  if (excludeEventId) {
    sql += ` AND id <> $3`;
    params.push(excludeEventId);
  }
  const result = await query(sql, params);
  const others = (result.rows[0]?.cnt as number) ?? 0;
  if (others <= 0) return null;
  return `当天还有 ${others} 个其他日程，请注意安排`;
}

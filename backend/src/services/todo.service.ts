import { query } from '../db/index.js';

export interface TodoCompletionRow {
  event_id: number;
  occurrence_date: string;
  completed_at: string;
}

export function todoOccurrenceDate(eventDate: string): string {
  return eventDate.slice(0, 10);
}

export async function listTodoCompletions(userId: number): Promise<TodoCompletionRow[]> {
  const result = await query(
    `SELECT event_id, occurrence_date::text AS occurrence_date, completed_at
     FROM todo_completions
     WHERE user_id = $1
     ORDER BY completed_at DESC`,
    [userId],
  );
  return result.rows as TodoCompletionRow[];
}

export async function markTodoComplete(
  userId: number,
  eventId: number,
  occurrenceDate: string,
): Promise<void> {
  await query(
    `INSERT INTO todo_completions (user_id, event_id, occurrence_date)
     VALUES ($1, $2, $3::date)
     ON CONFLICT (user_id, event_id, occurrence_date) DO UPDATE SET completed_at = CURRENT_TIMESTAMP`,
    [userId, eventId, occurrenceDate],
  );
}

export async function unmarkTodoComplete(
  userId: number,
  eventId: number,
  occurrenceDate: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM todo_completions
     WHERE user_id = $1 AND event_id = $2 AND occurrence_date = $3::date
     RETURNING id`,
    [userId, eventId, occurrenceDate],
  );
  return result.rows.length > 0;
}

/** 清理超过保留期的完成记录（默认 365 天，按 occurrence_date） */
export async function purgeOldTodoCompletions(retentionDays = 365): Promise<number> {
  const result = await query(
    `DELETE FROM todo_completions
     WHERE occurrence_date < CURRENT_DATE - ($1::int * INTERVAL '1 day')`,
    [retentionDays],
  );
  return result.rowCount ?? 0;
}

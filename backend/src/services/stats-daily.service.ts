import { query } from '../db/index.js';

/** 聚合前一日统计到 stats_daily */
export async function aggregateDailyStats(): Promise<number> {
  const result = await query(
    `INSERT INTO stats_daily (user_id, stat_date, events_count, triggers_total, triggers_success, triggers_failed)
     SELECT u.id,
            date('now', '-1 day'),
            (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id),
            COALESCE((SELECT COUNT(*) FROM event_trigger_logs t
                      WHERE t.user_id = u.id AND t.trigger_date = date('now', '-1 day')), 0),
            COALESCE((SELECT COUNT(*) FROM event_trigger_logs t
                      WHERE t.user_id = u.id AND t.trigger_date = date('now', '-1 day') AND t.status = 'success'), 0),
            COALESCE((SELECT COUNT(*) FROM event_trigger_logs t
                      WHERE t.user_id = u.id AND t.trigger_date = date('now', '-1 day') AND t.status = 'failed'), 0)
     FROM users u
     ON CONFLICT (user_id, stat_date) DO UPDATE SET
       events_count = EXCLUDED.events_count,
       triggers_total = EXCLUDED.triggers_total,
       triggers_success = EXCLUDED.triggers_success,
       triggers_failed = EXCLUDED.triggers_failed`,
  );
  return result.rowCount ?? 0;
}

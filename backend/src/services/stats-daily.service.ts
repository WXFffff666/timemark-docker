import { query } from '../db/index.js';

/** 聚合前一日统计到 stats_daily */
export async function aggregateDailyStats(): Promise<number> {
  const result = await query(
    `INSERT INTO stats_daily (user_id, stat_date, events_count, triggers_total, triggers_success, triggers_failed)
     SELECT u.id,
            (CURRENT_DATE - INTERVAL '1 day')::date,
            (SELECT COUNT(*)::int FROM events e WHERE e.user_id = u.id),
            COALESCE(t.total, 0),
            COALESCE(t.success, 0),
            COALESCE(t.failed, 0)
     FROM users u
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'success')::int AS success,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM event_trigger_logs
       WHERE user_id = u.id AND trigger_date = (CURRENT_DATE - INTERVAL '1 day')::date
     ) t ON TRUE
     ON CONFLICT (user_id, stat_date) DO UPDATE SET
       events_count = EXCLUDED.events_count,
       triggers_total = EXCLUDED.triggers_total,
       triggers_success = EXCLUDED.triggers_success,
       triggers_failed = EXCLUDED.triggers_failed`,
  );
  return result.rowCount ?? 0;
}

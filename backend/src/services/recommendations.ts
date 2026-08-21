import { query } from '../db/index.js';

/** Smart recommended reminder days by event type (no AI / no API key). */
const RECOMMENDATIONS: Record<string, number[]> = {
  birthday: [0, 1, 3, 7],
  anniversary: [0, 1, 7, 14],
  exam: [0, 1, 3, 7, 14],
  holiday: [0, 1, 3],
  meeting: [0, 1],
  deadline: [0, 1, 3, 7],
  travel: [0, 1, 3],
  graduation: [0, 1, 7],
  wedding: [0, 1, 7, 14],
  medical: [0, 1],
  custom: [0, 1, 3],
};

export function getRecommendedDaysBefore(eventType: string): number[] {
  return RECOMMENDATIONS[eventType] ?? [0, 1, 3, 7];
}

/** C8: 基于历史触发统计推荐 daysBefore */
export async function getRecommendedDaysFromHistory(userId: number, eventType: string): Promise<number[]> {
  const result = await query(
    `SELECT e.reminder_config, e.date, tl.trigger_date, tl.status
     FROM event_trigger_logs tl
     JOIN events e ON e.id = tl.event_id
     WHERE tl.user_id = $1 AND e.type = $2 AND tl.status = 'success'
     ORDER BY tl.created_at DESC LIMIT 50`,
    [userId, eventType],
  );
  const dayCounts = new Map<number, number>();
  for (const row of result.rows as Array<{ reminder_config: string; date: string; trigger_date: string }>) {
    try {
      const cfg = typeof row.reminder_config === 'string' ? JSON.parse(row.reminder_config) : row.reminder_config;
      const eventDate = new Date(row.date);
      const triggerDate = new Date(row.trigger_date);
      const diff = Math.round((eventDate.getTime() - triggerDate.getTime()) / 86400000);
      if (diff >= 0 && diff <= 30) {
        dayCounts.set(diff, (dayCounts.get(diff) || 0) + 1);
      }
      if (Array.isArray(cfg?.daysBeforeList)) {
        for (const d of cfg.daysBeforeList) {
          if (typeof d === 'number') dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
        }
      }
    } catch { /* ignore */ }
  }
  if (dayCounts.size === 0) return [];
  return [...dayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d]) => d)
    .sort((a, b) => b - a);
}

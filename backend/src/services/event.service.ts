import { query } from '../db/index.js';
import type { Event, CreateEventRequest } from '@timemark/shared';

export async function createEvent(userId: string, data: CreateEventRequest): Promise<Event> {
  const result = await query(
    `INSERT INTO events (user_id, name, type, date, calendar_type, lunar_date, reminder_config) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
    [userId, data.name, data.type, data.date, data.calendarType, 
      data.lunarDate ? JSON.stringify(data.lunarDate) : null, 
      JSON.stringify(data.reminderConfig)]
  );

  return { id: String(result.rows[0].id), userId, ...data, createdAt: result.rows[0].created_at };
}

export async function getEventsByUserId(userId: string): Promise<Event[]> {
  const result = await query('SELECT * FROM events WHERE user_id = $1 ORDER BY date ASC', [userId]);
  return result.rows.map((row: any) => ({
    id: String(row.id),
    userId: row.user_id,
    name: row.name,
    type: row.type,
    date: row.date,
    calendarType: row.calendar_type,
    lunarDate: row.lunar_date ? JSON.parse(row.lunar_date) : undefined,
    reminderConfig: JSON.parse(row.reminder_config),
    createdAt: row.created_at,
  }));
}

export async function updateEvent(id: string, userId: string, data: Partial<CreateEventRequest>): Promise<boolean> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name) { updates.push(`name = $${paramIndex++}`); values.push(data.name); }
  if (data.type) { updates.push(`type = $${paramIndex++}`); values.push(data.type); }
  if (data.date) { updates.push(`date = $${paramIndex++}`); values.push(data.date); }
  if (data.calendarType) { updates.push(`calendar_type = $${paramIndex++}`); values.push(data.calendarType); }
  if (data.lunarDate) { updates.push(`lunar_date = $${paramIndex++}`); values.push(JSON.stringify(data.lunarDate)); }
  if (data.reminderConfig) { updates.push(`reminder_config = $${paramIndex++}`); values.push(JSON.stringify(data.reminderConfig)); }

  if (updates.length === 0) return false;

  values.push(id, userId);
  const result = await query(`UPDATE events SET ${updates.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`, values);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteEvent(id: string, userId: string): Promise<boolean> {
  const result = await query('DELETE FROM events WHERE id = $1 AND user_id = $2', [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

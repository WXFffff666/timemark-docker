import { query } from '../db/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('trigger-log');

export async function recordEventTrigger(
  eventId: number,
  userId: number,
  triggerType: string,
  triggerDate: string,
  status: string = 'success',
  errorMessage?: string,
  channelResults?: string,
  errorDetails?: { channel_type?: string; account_id?: number; details?: unknown },
): Promise<void> {
  try {
    await query(
      `INSERT INTO event_trigger_logs
       (event_id, user_id, trigger_type, trigger_date, status, error_message, channel_results, error_details, channel_type, account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        eventId,
        userId,
        triggerType,
        triggerDate,
        status,
        errorMessage || null,
        channelResults || null,
        errorDetails?.details ? JSON.stringify(errorDetails.details) : null,
        errorDetails?.channel_type || null,
        errorDetails?.account_id || null,
      ],
    );
  } catch (error) {
    log.error({ err: error }, 'Failed to record event trigger log');
  }
}

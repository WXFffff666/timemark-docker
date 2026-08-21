import { query } from '../db/index.js';
import { sendNotifications } from './notifications/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('notification-retry');

/** Exponential backoff: 5m → 30m → 2h → 6h */
const RETRY_DELAYS_MS = [5, 30, 120, 360].map((m) => m * 60 * 1000);
const MAX_RETRIES = RETRY_DELAYS_MS.length;

export async function enqueueNotificationRetry(params: {
  eventId: number;
  userId: number;
  channel: string;
  accountId?: number;
  errorMessage: string;
}): Promise<void> {
  const nextRetryAt = new Date(Date.now() + RETRY_DELAYS_MS[0]).toISOString();
  await query(
    `INSERT INTO notification_queue (event_id, user_id, channel, status, retry_count, max_retries, next_retry_at, error_message, account_id)
     VALUES ($1, $2, $3, 'pending', 0, $4, $5, $6, $7)`,
    [
      params.eventId,
      params.userId,
      params.channel,
      MAX_RETRIES,
      nextRetryAt,
      params.errorMessage.slice(0, 500),
      params.accountId ?? null,
    ],
  );
}

export async function processNotificationRetries(): Promise<{ processed: number; succeeded: number }> {
  const due = await query(
    `SELECT nq.*, e.*
     FROM notification_queue nq
     JOIN events e ON e.id = nq.event_id
     WHERE nq.status = 'pending'
       AND nq.next_retry_at IS NOT NULL
       AND nq.next_retry_at <= NOW()
       AND nq.retry_count < nq.max_retries
     ORDER BY nq.next_retry_at ASC
     LIMIT 20`,
  );

  let processed = 0;
  let succeeded = 0;

  for (const row of due.rows as Array<Record<string, unknown>>) {
    processed++;
    const queueId = row.id as number;
    const retryCount = (row.retry_count as number) ?? 0;
    const channel = row.channel as string;
    const userId = row.user_id as number;
    const accountId = row.account_id as number | undefined;

    if (accountId) {
      const acct = await query(
        `SELECT connection_status FROM notification_accounts WHERE id = $1`,
        [accountId],
      );
      if (acct.rows[0]?.connection_status === 'unhealthy') {
        await query(
          `UPDATE notification_queue SET status = 'dead', error_message = 'channel unhealthy', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [queueId],
        );
        continue;
      }
    }

    try {
      const results = await sendNotifications(row, userId, [channel], { skipQuietHours: true });
      const ok = results[channel]?.success;

      if (ok) {
        await query(
          `UPDATE notification_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [queueId],
        );
        succeeded++;
        continue;
      }

      const errMsg = results[channel]?.error || 'retry failed';
      await scheduleNextRetry(queueId, retryCount, errMsg);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await scheduleNextRetry(queueId, retryCount, errMsg);
    }
  }

  if (processed > 0) {
    log.info({ processed, succeeded }, 'Notification retry batch complete');
  }
  return { processed, succeeded };
}

async function scheduleNextRetry(queueId: number, currentRetry: number, errorMessage: string): Promise<void> {
  const nextIndex = currentRetry + 1;
  if (nextIndex >= MAX_RETRIES) {
    await query(
      `UPDATE notification_queue SET status = 'dead', retry_count = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [nextIndex, errorMessage.slice(0, 500), queueId],
    );
    return;
  }

  const delayMs = RETRY_DELAYS_MS[nextIndex] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
  await query(
    `UPDATE notification_queue SET retry_count = $1, next_retry_at = $2, error_message = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
    [nextIndex, nextRetryAt, errorMessage.slice(0, 500), queueId],
  );
}

export async function purgeOldQueueEntries(): Promise<number> {
  const result = await query(
    `DELETE FROM notification_queue
     WHERE status IN ('completed', 'dead')
       AND updated_at < NOW() - INTERVAL '30 days'`,
  );
  return result.rowCount ?? 0;
}

/** Slim notification exports for Vercel serverless cold start */

export async function sendNotifications(): Promise<{ sent: number; failed: number; results?: unknown[] }> {
  return { sent: 0, failed: 0, results: [] };
}

/**
 * Optional dead-man's switch ping after successful cron jobs.
 * Set HEALTHCHECK_URL (e.g. Healthchecks.io ping URL) in Vercel env.
 */

/** CRONSECRET (Vercel) or CRON_SECRET — prefer CRONSECRET when both are set. */
export function getCronSecret(): string | undefined {
  const secret = process.env.CRONSECRET?.trim() || process.env.CRON_SECRET?.trim();
  return secret || undefined;
}

export async function pingHeartbeat(jobName: string): Promise<void> {
  const base = process.env.HEALTHCHECK_URL?.trim();
  if (!base) return;

  const url = base.includes('/ping/') || base.endsWith('/')
    ? `${base.replace(/\/$/, '')}/${jobName}`
    : `${base}/${jobName}`;

  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[Heartbeat] ${jobName} ping failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Heartbeat] ${jobName} ping error:`, err);
  }
}

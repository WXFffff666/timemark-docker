/** 根据 HTTP 状态码判断是否值得重试 */
export function isRetryableHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (status >= 400 && status < 500) return false;
  return true;
}

export function classifyErrorForRetry(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const statusMatch = msg.match(/\b([45]\d{2})\b/);
  if (statusMatch) {
    return isRetryableHttpStatus(parseInt(statusMatch[1], 10));
  }
  if (/timeout|ECONNRESET|ENOTFOUND|network/i.test(msg)) return true;
  return true;
}

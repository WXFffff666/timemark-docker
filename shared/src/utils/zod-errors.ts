import type { ZodError } from 'zod';

/** Format Zod validation errors for API responses (Chinese-friendly). */
export function formatZodError(error: ZodError): string {
  const flat = error.flatten();
  const parts: string[] = [];
  for (const [field, messages] of Object.entries(flat.fieldErrors)) {
    if (messages?.length) parts.push(`${field}: ${messages.join(', ')}`);
  }
  if (flat.formErrors.length) parts.push(...flat.formErrors);
  return parts.join('；') || '请求参数无效';
}

import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  deviceFingerprint: z.string().optional(),
  rememberMe: z.boolean().optional().default(false),
  turnstileToken: z.string().optional(),
  totpCode: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

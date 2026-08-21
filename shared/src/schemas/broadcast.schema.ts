import { z } from 'zod';

const broadcastBaseSchema = z.object({
  subject: z.string().min(1, '主题不能为空').max(200),
  html: z.string().min(1, '内容不能为空').max(50000),
  recipientEmails: z.array(z.string().email()).min(1).max(500).optional(),
  contactIds: z.array(z.number().int().positive()).max(500).optional(),
  useAllContacts: z.boolean().optional(),
  totpCode: z.string().length(6).optional(),
  /** 指定邮件通知渠道账号（resend / smtp） */
  accountId: z.number().int().positive().optional(),
});

export const broadcastEmailSchema = broadcastBaseSchema.refine(
  (d) => (d.recipientEmails?.length ?? 0) > 0 || (d.contactIds?.length ?? 0) > 0 || d.useAllContacts,
  { message: '请选择至少一个收件人' },
);

export const broadcastPreviewSchema = broadcastBaseSchema.pick({
  subject: true,
  html: true,
});

export type BroadcastEmailInput = z.infer<typeof broadcastBaseSchema>;

# Learnings

## 2026-08-22 - 粗略移植 v23 Inbox/Webhook/Calendar/Contacts (Tasks 17-21)

- 从 `timemark-vercel` 复制到 `timemark-docker` 对应路径，仅适配 import，不做本地验证：
  - `backend/src/services/inbox.service.ts` + `routes/inbox.ts` + `routes/inbox-public.ts` + `frontend/src/pages/Inbox.tsx` + `lib/format-time.ts`
  - `backend/src/routes/webhook-inbound.ts` (HMAC sha256, timingSafeEqual, idempotency, rateLimit)
  - `backend/src/routes/calendar-public.ts` + `calendar-import.ts` + `services/calendar-sync.service.ts` + `utils/ics-parser.ts` + `frontend/src/pages/Calendar.tsx` + `lib/calendar-utils.ts`
  - `shared/src/contact-methods.ts` / `contact-channels.ts` / `contact-relationship.ts` / `schemas/contact.schema.ts` / `schemas/broadcast.schema.ts` / `event-schedule.ts` / `lunar-calendar.ts` / `smtp-providers.ts` / `notification-presets.ts` + `backend/src/routes/contacts.ts` + `services/contact.service.ts` + `frontend/src/pages/Contacts.tsx` + `components/contacts/LabeledFieldsEditor.tsx` + `lib/contact-utils.ts` + `lib/contact-event-bridge.ts`
- 额外同步缺失的 shared 依赖：`shared/src/index.ts` 导出补全、`utils/zod-errors.ts`、`schema.pg.sql`、`hooks/useSmartBack.ts`。
- 附带同步了 vercel 新增的 `backend/src/services/*.service.ts`（audit/broadcast/caldav/conflict/todo 等）以满足 inbox/calendar/contacts 的隐式依赖，粗略移植不校验编译。
- 前端 `App.tsx` 追加 `/inbox` `/contacts` `/calendar` 路由（ProtectedRoute），组件按 lazy/直接引入均可，当前直接引入简化。
- 后端 `db/index.ts` 已有 `convertPgParamsToSqlite`，故 vercel 的 `$1` 占位符 SQL 无需改写。
- 策略：粗略移植直接提交，依赖 workflow 验证，有问题后续再调；Do NOT 本地 build/测试。

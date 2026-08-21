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


## 2026-08-22 粗略移植 Todos 22-29 (vercel -> docker)

- 批量复制同路径：backend todo.service(365d purge)/routes todos/time/webauthn/auth + utils ntp/turnstile/webauthn-config/retry-classifier/lunar-converter + jobs/tasks(croner+retry指数) + shared lunar-calendar/event-schedule + frontend Todos/Calendar + lib calendar-utils/lunar/time-sync/timezone-utils/webauthn + hooks useTodoCompletions + stores timezone + docs TURNSTILE_SETUP
- 补齐：App.tsx 新增 /todos 路由、backend/index.ts 挂载 todos/time/webauthn、shared/index.ts 补 lunar-calendar 导出、backend/frontend package.json 追加 @simplewebauthn/server/browser
- 策略：粗略移植直接提交，不跑本地 build，由 workflow 验证

## 2026-08-22 粗略 bump 2.6.0 -> 2.16.0 + CHANGELOG 合并 v2.7–v2.16 (Task 30)

- `timemark-docker/package.json` `2.6.0 -> 2.16.0`，`backend/package.json` / `frontend/package.json` `1.0.0 -> 2.16.0` 统一版本
- `README.md` 徽标 `Version-2.6.0 -> 2.16.0`，对比表 `v2.6.0 -> v2.16.0`，架构图 `v2.5.0 -> v2.16.0`，更新日志表新增 `v2.16.0` 合并行（vercel v2.7–v2.16 概要）
- `CHANGELOG.md` 在 `# Changelog` 后插入 `v2.16.0/v2.15.0/v2.14.3/v2.14.2/v2.14.1/v2.14.0/v2.13.0/v2.12.0/v2.11.0/v2.7.0` 段落，直接复制 `timemark-vercel/CHANGELOG.md` 对应章节，`v2.12.0/v2.11.0` 按 vercel README 概要补简要行
- 未跑本地 build/验证，按要求粗略直接提交，由 workflow 验证

## 2026-08-22 — 清理构建产物与临时环境

- 遍历 `timemark-docker` / `timemark-vercel` / `timemark-landing`，检查 `frontend/dist` / `backend/dist` / `shared/dist` / `.pnpm-store` / `.turbo` / `data` / `.vercel` / `.next`
  - `timemark-docker/shared/dist`（60 文件 tsc 产物）已删除；其余路径及 `timemark-vercel`/`timemark-landing` 均不存在
- 扫描 `data/*.bak` / `.env.local` / `.env.tmp`（排除 node_modules）均无残留；保留 `node_modules` / `package.json` / `Dockerfile` / `.github` / `.omo` / 锁文件
- `git status --ignored --short` 清理前含 `!! shared/dist/`，清理后仅 `node_modules` 被忽略，无 `dist/.turbo` 泄露，工作区干净
## 2026-08-22 fix(ci): pnpm/action-setup Multiple versions (32502948645, 32502067662)

- Root cause: `pnpm/action-setup@v4` `src/install-pnpm/run.ts` does strict `packageManagerVersion !== inputVersion`; `9 !== 9.12.0` always throws when both `with: version: 9` and `packageManager: pnpm@9.12.0` present.
- Decision A: remove `with: version: 9` (2 lines per workflow), keep `uses: pnpm/action-setup@v4` bare, let it read `packageManager` single source; Node 22 + cache pnpm retained; do NOT bump pnpm 10 or lockfileVersion.
- Changed: `.github/workflows/ci.yml` and `docker.yml` delete `with:` + `version: 9`; created `.omo/plans/timemark-pnpm-fix-decision.md` (Options A-D) and `scripts/verify-pnpm-workflow.mjs` (checks no with:version, packageManager exists).
- Verified: script RED before, GREEN after; `yamllint` warnings only pre-existing (document-start/truthy/line-length), no new syntax errors.
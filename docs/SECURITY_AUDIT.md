# 安全评估报告

**目标**：`https://timemark docker \(SQLite\) / timemark\.the37777777\.top \(vercel\)`  
**最新版�?*：v2.16.0�?026-07-31�?

## v2.16.0 安全加固�?026-07-31�?

### 零信任与认证

| 问题 | 修复 |
|------|------|
| 任意 `X-API-Key` 可绕过零信任 | `zero-trust-guard.ts` 移除未验�?bypass |
| Passkey 登录绕过人机验证 | `webauthn.ts` 与密码登录一致，强制 Turnstile |
| API Key 明文回退 | `api-key.ts` 仅接�?`api_key_hash`，移除明文列回退 |

### 外部集成

| 问题 | 修复 |
|------|------|
| 外部 ICS URL SSRF | `calendar-sync.service.ts` 拉取�?`isSafePublicUrl()` |
| Resend Webhook 生产可无签名 | `resend-webhook.ts` 生产一律验�?|
| Google OAuth Host 注入 | `google-calendar.ts` 使用 `resolveSafeAppOrigin()` 限制回调域名 |

### 信息泄露

| 问题 | 修复 |
|------|------|
| `/api/health` 公开 Cron 详情 | �?`?detailed=1` + `X-Health-Token` 返回 Cron/NTP 详情 |

### 线上复测�?026-07-31�?

| 端点 | 无认证结�?|
|------|------------|
| `/api/events` | 401 |
| `/api/contacts` | 401 |
| `/api/cron/*` | 401 |
| `/api/security/deploy-info` | 401 |
| `/api/health` | 200（基础状态，无密钥字段） |

## v2.14.0 安全加固�?026-07-31�?

### 认证与会�?

| 问题 | 修复 |
|------|------|
| `cachedUser` 网络失败时伪登录 | 移除缓存伪登录；登出清除 `cachedUser` |
| logout session IDOR | 删除会话时校�?`user_id` |
| refresh 不校�?DB session | refresh �?`getSessionByToken` |
| Cookie 模式响应泄露 JWT | login/refresh 不再�?JSON 中返�?token |
| refresh 不轮�?refresh cookie | refresh 时同步签发新 refresh token（HttpOnly Cookie�?|

### Cron / 初始�?/ XSS

| 问题 | 修复 |
|------|------|
| Cron 仅凭 `x-vercel-cron-auth-token` 可绕�?| 始终要求 `CRON_SECRET` Bearer |
| 生产硬编码默认管理员密码 | 生产�?`DEFAULT_ADMIN_PASSWORD` 时跳过自动创�?|
| Broadcast 预览 XSS | `sanitizeHtmlPreview()` 过滤 script/iframe/on* |
| 多用�?| 已移�?�?系统固定为个人单账户，禁止创建第二用�?|

### 令牌说明（用户无需手动轮换�?

| 类型 | 是否需�?Vercel 环境变量 |
|------|--------------------------|
| 登录 access / refresh 令牌 | **�?* �?后台自动续期（约 15 分钟 / 30 天） |
| `JWT_SECRET` / `MASTER_KEY` / `CRON_SECRET` | **�?* �?首次部署配置一次即可，除非泄露 |
| MASTER_KEY 手动轮换 UI | 已移�?�?避免误导用户去改环境变量 |

| Broadcast 手动收件人开放中�?| `recipientEmails` 限制为联系人邮箱白名�?|
| 预览 HTML XSS | `sanitizeHtmlPreview` 增强并前后端共用 |
| Legacy refresh �?session 绑定 | 拒绝�?`sessionToken` �?refresh |
| zero-trust 全局 Cron token 绕过 | 移除�?`/api/cron/` 路径�?bypass |
| Cookie 模式当前会话识别 | 安全中心�?Cookie 读取 access token |
| 「不记住我」仍 24h refresh | 未勾选时 refresh 为会�?cookie |

## 已通过�?

| 项目 | 结果 |
|------|------|
| 未授权访�?`/api/auth/session`、`/api/events`、`/api/contacts`、`/api/data/export` | 401 |
| 未授�?POST `/api/contacts/:id/send-email` | `Missing origin or authorization` / 401 |
| Cron `/api/cron/*` �?错误 Bearer | 401 |
| SQL 注入登录 payload | 400 校验拒绝 |
| 路径穿越 `/api/auth/../../../etc/passwd` | 返回 SPA，无文件泄露 |
| 速率限制 `/api/auth/login` | 429 |
| 安全响应�?| CSP、X-Frame-Options DENY、nosniff、HSTS |
| Turnstile | `enabled: true`，未�?token 无法完成登录 |
| Cookie | HttpOnly + SameSite=Lax + Secure（Vercel 生产�?|
| 首次登录改密 | `mustChangePassword` �?`password_changed_at` 为空时触�?|
| 传输加密 | 生产全站 HTTPS；SMTP 587 强制 STARTTLS |

## v2.15.0 加固（本次）

### 联系人快捷发�?

| 问题 | 修复 |
|------|------|
| `recipientEmails` 可填任意邮箱，构成开放中�?| 服务端校验收件人 �?联系人邮箱列�?|
| 发信日志�?`user_id` | 改用 `logEmail({ userId, ... })` |

### 密钥�?API 响应

| 改动 | 说明 |
|------|------|
| `GET /api/config/accounts` 脱敏 | 不返回明�?`token`/`secret`/`session_data` |
| 创建/更新账号响应脱敏 | 同上，编辑时留空表示不修改（`tokenConfigured` 标志�?|
| 前端渠道�?| 已配置密钥显示「已配置，留空则不修改�?|

### 传输与头�?

| 改动 | 说明 |
|------|------|
| HSTS | `security-headers.ts` + `vercel.json` |
| SMTP `requireTLS` | `email-send.service.ts`、`smtp.service.ts`�?87 端口�?|
| CORS `*` 禁用 | `allowed-origins.ts` 不再�?credentials 模式下返�?`*` |

### 待办数据

| 行为 | 说明 |
|------|------|
| 完成记录 | `todo_completions` 按用户隔离，写操作校�?`events.user_id` |
| 历史保留 | 默认 365 天后 `daily-maintenance` 清理 |

## v2.11.0 已修�?

1. **`/api/health` 信息泄露**：公开接口不再返回 `jwtSecret`/`masterKey`/`cronSecret`/`commit`；仅 `?detailed=1` + `X-Health-Token` 可查看详情�?
2. **Cookie `Secure` 标志**：Vercel 生产环境强制 `secure: true`�?
3. **前后端密码长�?*：统一最�?8 位�?
4. **冗余文档**：删�?Docker �?`DEPLOYMENT.md`、`PROJECT_DOC.md`�?

## v2.12.0 最终加�?

### CSP

- 移除 `script-src 'unsafe-inline'`（Vite 生产构建无内联脚本依赖）�?
- 新增 `script-src-attr 'none'`、`form-action 'self'`�?
- `style-src` 保留 `'unsafe-inline'`（React/Tailwind 运行时样式注入）�?

### 密钥与日�?

| 改动 | 文件 |
|------|------|
| 生产环境禁止 JWT 弱默认回退 | `backend/src/utils/jwt.ts` |
| 生产环境禁止 MASTER_KEY 弱默认回退 | `secrets.ts` |
| 移除默认密码明文日志 | `index.ts`、`migrate-db.ts` |
| `/api/data/export` 脱敏 | `backend/src/routes/data.ts` |

### 环境变量策略

- 文档明确：`JWT_SECRET`、`MASTER_KEY`、`TURNSTILE_SECRET_KEY`、`CRON_SECRET`、`DEFAULT_ADMIN_PASSWORD` �?*仅勾�?Vercel Production**，勿勾�?Preview/Development�?

## 复测命令

### 健康检查（浏览器控制台�?

```javascript
fetch('/api/health').then(r => r.json()).then(console.log)
// 应无 jwtSecret / masterKey / cronSecret 字段
```

### 响应头（命令行）

```bash
curl.exe -sI https://timemark docker \(SQLite\) / timemark\.the37777777\.top \(vercel\)/
# 应含 Strict-Transport-Security、Content-Security-Policy、X-Frame-Options: DENY
```

### 未授�?API

```bash
curl.exe -s https://timemark docker \(SQLite\) / timemark\.the37777777\.top \(vercel\)/api/contacts
# {"success":false,"error":"Unauthorized"}
```

## 建议持续关注

| 风险 | 建议 |
|------|------|
| CSP `style-src unsafe-inline` | React 迁移�?nonce/hash 后可进一步收�?|
| Turnstile Site Key 公开 | 正常；Secret 仅服务端 Production |
| 默认管理员密�?| 使用�?`DEFAULT_ADMIN_PASSWORD` 并首次登录改�?|
| Preview 域名 | 保持 Vercel Standard Protection；Secret 不注�?Preview |
| XSS + 已登录会�?| 密钥已脱敏；仍应避免在不可信页面执行脚本 |
| 批量邮件手动收件�?| 认证用户可向自选邮箱群发，建议开�?2FA �?TOTP 大批量限�?|

## 相关代码

| 模块 | 路径 |
|------|------|
| 认证中间�?| `backend/src/middleware/auth.middleware.ts` |
| CSRF | `backend/src/middleware/csrf.ts` |
| 安全响应�?| `backend/src/middleware/security-headers.ts` |
| 密钥脱敏 | `backend/src/utils/secret-mask.ts` |
| 联系人发�?| `backend/src/services/contact-send.service.ts` |
| 密码哈希 | `backend/src/utils/password.ts` |

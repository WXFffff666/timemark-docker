# 可选功能与渠道（按需绑定）

TimeMark 采用 **「核心必配 + 扩展可选」** 设计：平台环境变量与通知渠道、日历集成均可按实际需要启用，**不配置不影响** 登录、事件管理、定时提醒等核心能力。

---

## 1. 设计原则

| 类型 | 行为 |
|------|------|
| **必配（平台）** | 未配置则无法启动或部署自检不通过 |
| **可选（平台 env）** | 未配置时相关功能入口显示「未启用」，其余功能正常 |
| **可选（应用内绑定）** | 用户在界面中主动添加/连接；不添加则不参与提醒发送 |

---

## 2. 必配环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL |
| `JWT_SECRET` | 登录令牌 |
| `MASTER_KEY` | 加密渠道凭证 |
| `CRON_SECRET` | 外部 Cron 认证 |
| `NODEJS_HELPERS` | Vercel Hobby 设为 `0` |

详见 [VERCEL_DEPLOYMENT.md](../VERCEL_DEPLOYMENT.md)、[FREE_TIER_DEPLOY.md](../FREE_TIER_DEPLOY.md)。

---

## 3. 可选平台环境变量

| 功能 | 变量 | 未配置时 |
|------|------|----------|
| Google 日历 OAuth | `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` | 设置 → 集成显示「未启用」；可用 ICS URL 代替 |
| 浏览器 Web Push | `VAPID_PUBLIC_KEY` / `PRIVATE_KEY` | 推送使用临时密钥或不可用；邮件/Webhook 等不受影响 |
| 登录人机验证 | `TURNSTILE_*` / `SecretKey` | 登录无 Turnstile，仍可用密码/Passkey |
| Passkey 域名 | `WEBAUTHN_RP_ID` / `ORIGIN` | Passkey 可能受限；密码登录正常 |

Google OAuth 完整步骤：[GOOGLE_CALENDAR_OAUTH.md](./GOOGLE_CALENDAR_OAUTH.md)

---

## 4. 可选通知渠道（应用内绑定）

所有通知渠道均在 **通知渠道** 页按需添加，**零渠道也可创建事件**（仅无自动外发）。

| 方式 | 说明 |
|------|------|
| 添加渠道 | 点击「添加渠道」→ 选择类型 → 填写 Webhook / Token |
| 测试 | 建议添加后点击「测试」验证 |
| 启用/禁用 | 开关控制是否参与发送，不必删除配置 |
| 事件选用 | 创建事件时勾选需要的渠道；未选则不向该渠道发送 |

常用渠道（均为可选）：

- **邮件 Resend** — API Key 在渠道内配置，非 Vercel env
- **Telegram / 飞书 / 钉钉 / Discord / Slack** — Webhook 或 Bot Token
- **ntfy / Bark / Pushover / Gotify** — 按文档填写 Topic 或 Token
- **Twilio 短信** — 在渠道账户内填 Account SID / Auth Token / 发信号码

详见 [NOTIFICATIONS.md](./NOTIFICATIONS.md)、[CHANNEL_COMPATIBILITY.md](./CHANNEL_COMPATIBILITY.md)。

---

## 5. 可选日历与集成

| 功能 | 配置方式 | 未配置时 |
|------|----------|----------|
| 入站 Webhook | 自动生成 token，复制即用 | 仍可用 UI 创建事件 |
| ICS 导出 Feed | 自动生成 | 不影响本地事件 |
| 外部 ICS 导入 | 设置 → 集成填写 URL | 不同步外部日历 |
| CalDAV 订阅 | 设置 → 集成填写 URL/账号 | 不同步 |
| Google OAuth | 平台 env + 用户授权 | 见上文 |
| iOS 快捷指令 / ntfy 教程 | 仅文档，无强制配置 | — |

详见 [INTEGRATIONS.md](./INTEGRATIONS.md)。

---

## 6. 可选 Cron 任务

| 端点 | 必须？ | 说明 |
|------|--------|------|
| `reminder-check` | **是** | 每分钟提醒扫描 |
| `retry-notifications` | 建议 | 失败重试 |
| `calendar-sync` | 可选 | 仅在使用外部 ICS / Google OAuth 时需要 |
| `caldav-sync` | 可选 | 仅配置 CalDAV 时需要 |
| `daily-maintenance` | 建议 | 日志清理、统计聚合、待办历史清理（365 天） |

---

## 7. 固定联系人与近期待办（应用内）

| 功能 | 路径 | 说明 |
|------|------|------|
| 固定联系人 | `/contacts` | 多邮箱/手机/IM；绑定通知渠道；快捷发信 |
| 批量邮件 | `/broadcast` | 从联系人选收件人（展开全部邮箱） |
| 近期待办 | `/todos` | 提醒窗口内事件打勾完成 |
| 完成历史 | `/todos` → 完成历史 | 过期后自动归档的可查记录 |

数据库迁移：**v29** `todo_completions`、**v30** `contact_methods`。

---

## 8. 用户操作速查

```
只想本地记事件、邮件提醒？
  → 必配 env + reminder-check Cron +（可选）添加 Resend 渠道

想用 Telegram？
  → 通知渠道 → 添加 Telegram → 测试 → 创建事件时勾选

想同步 Google 日历？
  → 方案 A：ICS 秘密地址（无需 OAuth）
  → 方案 B：配置 GOOGLE_OAUTH_* → 设置里连接 Google

什么都不想配渠道？
  → 可以。事件与收件箱、仪表盘均可用；仅无自动外发通知。
```

---

## 相关文档

- [NOTIFICATIONS.md](./NOTIFICATIONS.md) — 通知流程
- [INTEGRATIONS.md](./INTEGRATIONS.md) — Webhook / 日历
- [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) — 安全评估与复测

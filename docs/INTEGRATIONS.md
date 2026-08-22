# 集成功能（Webhook / 日历�?

v22��Docker SQLite ͬ���� 起支持入�?Webhook、公开 ICS 订阅与外部日历同步；**v27** 起可�?Google OAuth 只读同步。迁移在 API 冷启动时自动执行�?

可在 **设置 �?部署向导 �?系统自检** 确认数据库结构版本（当前期望 **v30**）�?

可选功能总览�?**[OPTIONAL_FEATURES.md](./OPTIONAL_FEATURES.md)**（渠道、集成、Cron 均可按需启用）�?

---

## 1. 配置入口

**设置 �?集成**（或 **日历 �?集成 API**�?

首次部署后，系统为每位用户自动生成：

- `webhook_inbound_token` �?入站 Webhook 路径令牌
- `calendar_feed_token` �?公开 ICS 订阅令牌
- `webhook_inbound_secret` �?可�?HMAC 签名校验密钥

---

## 2. 入站 Webhook（创建事件）

**URL**（在设置 �?集成中复制）�?

```
POST https://你的域名/api/webhook/receive/<webhook_inbound_token>
Content-Type: application/json
```

**请求体示�?*�?

```json
{
  "name": "会议提醒",
  "date": "2026-07-20",
  "type": "other",
  "daysBefore": [1, 3],
  "channels": ["resend"],
  "remind": true
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` / `title` / `summary` | �?| 事件名称 |
| `date` / `start` | �?| `YYYY-MM-DD` |
| `type` | 可�?| `birthday` / `exam` / `anniversary` / `holiday` / `other` |
| `daysBefore` | 可�?| 提前提醒天数数组，默�?`[1,3,7]` |
| `channels` | 可�?| 通知渠道 ID 列表 |

**可选签名校�?*：请求头 `X-Timemark-Signature: sha256=<hmac_hex>`，使�?`webhook_inbound_secret` 对原�?body �?HMAC-SHA256�?

> 入站 Webhook 路由已豁�?CSRF，无需登录 Cookie�?

---

## 3. 日历 ICS 订阅（导出）

**Feed URL**（在设置 �?集成中复制）�?

```
GET https://你的域名/api/calendar/feed/<calendar_feed_token>.ics
```

可添加到 Google Calendar、Outlook、Apple Calendar 作为「通过网络订阅」源。Feed �?5 分钟缓存，包含该用户全部事件的公历日期�?

---

## 4. 外部 ICS 同步（导入）

�?**设置 �?集成** 中填写最�?5 个外�?ICS URL（如 Google 日历的「秘密地址」），点�?**立即同步**，或依赖 Cron�?

```
GET /api/cron/calendar-sync
Authorization: Bearer <CRON_SECRET>
```

建议�?15 分钟调用一次。同步逻辑�?`backend/src/services/calendar-sync.service.ts`�?

### SSRF 防护（v2.16.0�?

拉取外部 ICS 前，服务端会校验 URL�?

- 仅允�?`http` / `https`
- 禁止内网、回环、链路本地、元数据地址（如 `127.0.0.1`、`169.254.169.254`�?
- 禁止非标准端口上的私有目�?

不合�?URL 会被拒绝并记录日志，不会由服务器代为请求�?

---

## 5. 智能冲突提示

发送通知时，若同一天还有其他日程，会在消息末尾追加 **同日冲突提示**（`conflict-hint.service.ts`）�?

---

## 6. 事件提醒缓存

Cron 扫描使用 PostgreSQL �?`event_reminder_cache`�? 天窗口），减少全表查询；**�?Redis**，无需额外依赖�?

---

## 6. Google 日历 OAuth 同步（可�?· C5�?

**默认不启�?*。不�?`GOOGLE_OAUTH_*` 环境变量时，其他集成功能不受影响�?

需要时�?

1. 管理员在 Vercel 配置 `GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`（可�?`GOOGLE_OAUTH_REDIRECT_URI`）并 redeploy
2. 用户�?**设置 �?集成** 点击「连�?Google 日历�?
3. Cron `/api/cron/calendar-sync` 自动同步已连接账户的 primary 日历（只读）

完整步骤�?**[GOOGLE_CALENDAR_OAUTH.md](./GOOGLE_CALENDAR_OAUTH.md)**�?

不想�?OAuth 时，可用 **外部 ICS 秘密地址**（上一节）达到类似效果�?

---

## 7. 未实现（刻意不做�?

| 功能 | 说明 |
|------|------|
| Microsoft OAuth 双向同步 | 当前�?ICS URL �?Google OAuth 只读代替 |
| Redis / Upstash | 使用 PostgreSQL 缓存�?|
| 入站邮件解析 | 仅支�?HTTP Webhook JSON |

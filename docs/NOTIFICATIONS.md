# ֪ͨϵͳʹ��ָ�ϣ�v2\.16\.0 �� Docker ͬ�� vercel��

# 通知系统使用指南

本文说明 TimeMark Vercel 版从「配置渠道」到「定时提醒」的完整流程，以及常见问题排查�?

> **所有通知渠道均为可�?*：不添加任何渠道也可创建与管理事件；仅在需要外发提醒时绑定渠道。参�?[OPTIONAL_FEATURES.md](./OPTIONAL_FEATURES.md)�?

---

## 1. 端到端流�?

```
设置默认邮箱 �?配置通知渠道 �?测试渠道 �?创建事件（选渠�?提前天数）→ 测试发�?�?等待 Cron 定时提醒
```

| 步骤 | 位置 | 说明 |
|------|------|------|
| 1 | **设置 �?通知默认邮箱** | 全局兜底收件人，渠道测试与事件发送在未单独指定收件人时使�?|
| 2 | **通知渠道** | 按渠道填�?API Key / Webhook / Token 等；Resend 需填写 **收件人邮�?*（可留空，回退到默认邮箱） |
| 3 | **通知渠道 �?测试** | 必须返回明确成功/失败；失败会显示原因（如未配置收件人、API Key 无效�?|
| 4 | **创建事件** | 选择通知渠道、提前天数、提醒时�?|
| 5 | **仪表�?�?测试发�?* | 立即发送一次，结果写入「提醒日志�?|
| 6 | **外部 Cron** | `reminder-check` 每分钟扫描到期事件并发�?|

---

## 2. 收件人解析优先级（邮�?/ Resend�?

发送邮件时，系统按以下顺序解析收件人：

1. 事件 `reminder_config` 中的 `emailRecipients`
2. 通知渠道账户�?**收件人邮�?*（`chat_id` 字段，须为合法邮箱）
3. **设置 �?通知默认邮箱**（`default_test_email`�?
4. 用户配置中的 `reminder_emails` 列表

若以上皆无有效邮箱，发送失败并提示�?*未配置收件邮�?*�?

### Resend 渠道必填�?

| 字段 | 必填 | 说明 |
|------|------|------|
| Resend API Key | �?| �?[resend.com](https://resend.com) 获取�?*不是** Vercel 环境变量 |
| 发件人邮�?| 可�?| 已验证域名地址；留空使�?`onboarding@resend.dev`（仅测试，通常只能发给自己�?|
| 收件人邮�?| 可�? | 本渠道默认收件人；留空使用「通知默认邮箱�?|

\* 渠道与设置中至少有一处有效收件人，否则无法测试或发送�?

---

## 3. 环境变量 vs 渠道配置

| 类型 | 配置位置 | 示例 |
|------|----------|------|
| **平台环境变量** | Vercel Dashboard | `DATABASE_URL`、`JWT_SECRET`、`MASTER_KEY`、`CRON_SECRET`、`SecretKey`/`SiteKey`（Turnstile�?|
| **通知渠道凭证** | 应用内「通知渠道�?*（按需添加，可不配�?* | Resend API Key、Telegram Bot Token、飞�?Webhook |
| **默认收件�?* | 应用内「设置�?| 通知默认邮箱 |

**部署向导（设�?�?部署向导�?* 仅检查平台环境变量与数据库结构版本，**�?*检�?Resend 等渠�?API Key�?

---

## 4. 外部 Cron（Hobby 免费必配�?

Vercel Hobby 内置 Cron �?**每天 1 �?*（`daily-maintenance`）。以下任务需通过 [cron-job.org](https://cron-job.org) 等外部服务调用，Header：`Authorization: Bearer <CRON_SECRET>`�?

| 端点 | 建议频率 | 说明 |
|------|----------|------|
| `/api/cron/warmup` | 每分钟（可选） | 预热 DB 连接 |
| `/api/cron/reminder-check` | **每分钟（必须�?* | 扫描并发送到期提�?|
| `/api/cron/retry-notifications` | �?5�?5 分钟 | 重试失败的通知队列 |
| `/api/cron/calendar-sync` | �?15 分钟 | 同步外部 ICS 日历 |
| `/api/cron/daily-maintenance` | 每天 1 �?| 可由 Vercel 内置 Cron 触发 |

---

## 5. 失败重试

发送失败会进入 `notification_queue`，按 **5 分钟 �?30 分钟 �?2 小时 �?6 小时** 退避重试（需配置 `retry-notifications` Cron）�?

可在 **提醒日志** 页面查看每次触发结果�?*设置 �?邮件记录** 查看�?30 天邮件发送记录�?

---

## 6. 固定联系人与快捷发信

### 联系方式

�?**固定联系�?* 页可为每人配置多条邮箱、手机及 IM 账号，每条可�?*标签**（如「工作」「妈妈」）。保存后写入 `contact_methods`（JSONB，迁�?v30），并与事件提醒、批量邮件联动�?

### 快捷发信流程

```
联系人页 �?邮件图标 →（多邮箱时）勾选收件人 �?编辑主题/正文 �?发�?
```

| 场景 | 行为 |
|------|------|
| �?1 个邮�?| 直接进入编辑界面，自动选中该邮�?|
| 多个邮箱 | 先进入「选择收件邮箱」二级界面，**默认不全�?*，需手动勾�?|
| 发送渠�?| 优先使用联系人绑定的邮件类渠道，否则使用第一个可用邮件账�?|

### 安全说明

- 所�?API �?**HTTPS** 传输；SMTP 外发使用 TLS�?87 强制 STARTTLS）�?
- 服务端校�?`recipientEmails` **必须属于该联系人**，无法通过 API 向任意第三方邮箱中继�?
- 通知渠道 **token/secret** 在列�?API 中已脱敏，编辑时留空表示不修改原密钥�?
- 邮件正文**不写�?*日志；日志仅记录收件人、主题、状态�?

详见 [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)�?

---

## 7. 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 渠道测试显示成功但收不到邮件 | 未配置收件人且默认邮箱为�?| 填写渠道收件人或设置默认邮箱 |
| 测试按钮报「未配置收件邮箱�?| 同上 | 设置 �?通知默认邮箱，或 Resend 渠道填收件人 |
| 事件测试发送失�?| 渠道未激活、测试未通过、收件人为空 | 通知渠道页重新测试并确认绿色状�?|
| 定时提醒从不触发 | 未配置外�?`reminder-check` Cron | 部署向导中复�?URL �?cron-job.org |
| 提醒时间偏差 | 服务器时钟漂�?| 查看 `/api/time/status` �?`timeDriftMs`；Cron 已用 NTP 校正 |
| 农历/双历提醒不准 | 事件未保�?`lunarDate` | 重新编辑保存；v2.16.0 起表单自动同�?|
| 渠道凭证解密失败 | 更换�?`MASTER_KEY` | 重新保存各通知渠道配置 |
| 自检某行红色 | 见部署向导中文说�?| Turnstile 为可选项；Resend 不在自检范围�?|

---

## 8. SMTP 大厂邮箱（QQ / 163 / Gmail 等）

�?Resend 外，可在 **通知渠道 �?SMTP 邮件** 使用大厂邮箱发信。邮件从你的真实邮箱发出，对 Gmail/QQ 收件箱通常更友好�?

### 配置步骤

1. 选择 **邮箱服务�?*（自动填�?SMTP 服务器与端口�?
2. 填写 **发件人邮�?*（完整地址，兼作登录用户名�?
3. 填写 **授权�?/ 应用专用密码**（不是网页登录密码）
4. 点击 **测试 SMTP 连接** 确认通过后再保存
5. �?**批量邮件** 或事件提醒中选择�?SMTP 账号发�?

### 各服务商授权码获�?

| 服务�?| SMTP | 端口 | 密码说明 |
|--------|------|------|----------|
| QQ 邮箱 | smtp.qq.com | 465 | 邮箱设置 �?账户 �?开�?SMTP �?生成**授权�?* |
| 163 邮箱 | smtp.163.com | 465 | 设置 �?开�?SMTP �?**客户端授权码** |
| Gmail | smtp.gmail.com | 587 | Google 账号开启两步验�?�?**应用专用密码** |
| Outlook | smtp.office365.com | 587 | 登录密码；若开�?MFA 需应用密码 |
| 腾讯企业�?| smtp.exmail.qq.com | 465 | 完整企业邮箱 + 邮箱密码/客户端密�?|
| 阿里企业�?| smtp.mxhichina.com | 465 | 完整企业邮箱 + 邮箱密码 |

### Resend 域名�?DMARC

- 发信域验证通过后，发件人应使用 `@email.yourdomain.com`，勿�?`onboarding@resend.dev`
- DMARC 记录可仅写：`v=DMARC1; p=none`�?*不必**填写个人邮箱�?`rua=`�?
- 若需监控报告，可使用 `rua=mailto:dmarc@email.yourdomain.com` 等企业邮箱地址

### 全链路入�?

| 场景 | 使用�?SMTP 账号 |
|------|------------------|
| 事件定时提醒 | 事件所选通知渠道 |
| 批量邮件 `/broadcast` | 页面下拉选择 SMTP 账号 |
| 联系人快捷发�?| 选择已配置的 SMTP 渠道 |
| 告警邮件 | 设置 �?告警渠道 |

---

## 9. 相关代码

| 模块 | 路径 |
|------|------|
| 发送调�?| `backend/src/services/notifications/index.ts` |
| 渠道定义 | `backend/src/services/notifications/channels.config.ts` |
| 连接测试 | `backend/src/services/notifications/test-connection.ts` |
| 定时任务 | `backend/src/jobs/tasks.ts` |
| 重试队列 | `backend/src/services/notification-retry.service.ts` |
| 邮件日志 | `backend/src/services/email-log.service.ts` |
| 联系人发�?| `backend/src/services/contact-send.service.ts` |
| SMTP 预设 | `shared/src/smtp-providers.ts` |
| SMTP 传输 | `shared/src/smtp-transport.ts` |
| 联系方式模型 | `shared/src/contact-methods.ts` |

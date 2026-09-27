# TimeMark Docker 技术文档

<div align="center">

[![Version](https://img.shields.io/badge/Version-2.6.0-blue?style=flat&color=2563eb)](https://github.com/WXFffff666/timemark-docker)
[![Docker Pulls](https://img.shields.io/docker/pulls/xfffff666/timemark?style=flat&color=0ea5e9)](https://hub.docker.com/r/xfffff666/timemark)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat&color=22c55e)](LICENSE)

**智能事件提醒系统** · **38+ 通知渠道** · **农历转换** · **关系映射** · **通知模板** · **重复事件**

---

[部署文档](DEPLOYMENT.md) · [问题反馈](https://github.com/WXFffff666/timemark-docker/issues) · [在线演示](https://email.the37777777.top/)

</div>

---

## 📋 目录

- [项目简介](#-项目简介)
- [系统架构](#-系统架构)
- [技术栈](#-技术栈)
- [数据库设计](#-数据库设计)
- [API 接口](#-api-接口)
- [通知渠道架构](#-通知渠道架构)
- [安全模型](#-安全模型)
- [核心功能](#-核心功能)
- [项目结构](#-项目结构)
- [开发指南](#-开发指南)
- [部署配置](#-部署配置)

---

## 📖 项目简介

TimeMark Docker 是一款功能强大的智能事件提醒系统，专为管理生日、纪念日等重要事件而设计。v2.0 版本进行了彻底的架构重构，从三容器方案（PostgreSQL + Redis + App）精简为单容器部署（SQLite 内置），大幅降低了部署复杂度和资源占用。v2.4.x 版本增加了通知模板、重复事件、多邮箱支持等功能。v2.5.0 版本新增 Ntfy/Pushover/Apprise 渠道、用户时区配置、模板接入发送流程，并强化了安全机制（JWT 密钥自动生成、API Key 哈希存储、CSRF 保护升级）。

### 核心特性

| 特性 | 说明 |
|------|------|
| 🗓️ 农历支持 | 支持公历/农历双重日历，智能闰月转换 |
| 📢 38+ 通知渠道 | 覆盖国内外主流通讯平台，同渠道多账户 |
| 👨‍👩‍👧‍👦 关系映射 | 40+ 称呼智能转换（如「我爸」→「父亲」） |
| 🔒 企业级安全 | AES-256 加密 + JWT 会话 + CSRF 保护 + 登录锁定 |
| 🌍 全球时区 | NTP 自动时间同步，支持用户自定义时区（默认 Asia/Shanghai） |
| 📊 触发日志 | 完整的事件触发记录，方便排查问题 |
| 💾 数据导出 | 支持用户数据完整导出/导入，ICS 日历导出 |
| 📝 通知模板 | 6 种预设模板按事件类型分组，支持自定义模板，已接入发送流程 |
| 🔄 重复事件 | 支持每天/每周/每月/每年重复，自动创建下次事件 |
| 📧 多邮箱支持 | 事件支持添加多个收件人邮箱 |
| 🎯 11 种事件类型 | 生日/纪念日/节日/考试/会议/截止日期/旅行/毕业/婚礼/医疗/自定义 |
| 🕐 用户时区 | 支持自定义时区，默认 Asia/Shanghai |

### v2.0 vs v1.x

| 对比项 | v1.x | v2.0 |
|:------:|:----:|:----:|
| 数据库 | PostgreSQL 15 + Redis 7 | SQLite 3 (sql.js) |
| 容器数量 | 3 个 | 1 个 |
| 内存占用 | ~800MB | ~256MB |
| 部署复杂度 | 需配置数据库连接 | 开箱即用 |
| 凭证存储 | 明文 | AES-256 加密 |
| 定时任务 | Redis + Bull | Croner (内置) |

---

## 🏗️ 系统架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      TimeMark v2.0                          │
│                  单容器 · 零依赖 · 开箱即用                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────────┐         ┌──────────────────────┐      │
│   │    :3000         │         │     SQLite DB         │      │
│   │    Web UI        │         │  sql.js (内存数据库    │      │
│   │  (React 18 SPA)  │         │  + 文件持久化)         │      │
│   └────────┬────────┘         └──────────┬───────────┘      │
│            │                              │                  │
│            │      ┌────────────────┐      │                  │
│            └─────>│    Hono API    │<─────┘                  │
│                   │  (TypeScript)   │                         │
│                   └───────┬────────┘                         │
│                           │                                  │
│          ┌────────────────┼────────────────┐                 │
│          │                │                │                 │
│   ┌──────┴──────┐  ┌─────┴──────┐  ┌──────┴───────┐        │
│   │   Croner    │  │   Static   │  │    Alert     │        │
│   │  Scheduler  │  │   Server   │  │   Service    │        │
│   │  (定时任务)  │  │  (前端资源)  │  │  (通知分发)   │        │
│   └─────────────┘  └────────────┘  └──────────────┘        │
│                                           │                  │
│                    ┌──────────────────────┤                  │
│                    │                      │                  │
│              ┌─────┴──────┐        ┌──────┴──────┐          │
│              │  Webhook   │        │   Plugin    │          │
│              │  Channels  │        │  Channels   │          │
│              │ (直连推送)  │        │ (扫码授权)   │          │
│              └────────────┘        └─────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 请求处理流程

```
客户端请求 → Hono 中间件链 → 路由匹配 → 业务逻辑 → 数据库操作 → 响应

中间件链：
  1. Logger (请求日志)
  2. CORS (跨域处理)
  3. Auth Middleware (JWT 验证，保护 /api/* 路由)
  4. Rate Limiter (限流保护)
```

### 定时任务流程

```
Croner Scheduler (每分钟检查)
  → 查询当天需要提醒的事件
  → 农历/公历日期匹配
  → 获取事件关联的通知渠道和账户
  → 解密通知凭证 (AES-256)
  → 分发到各通知渠道
  → 记录触发日志
```

---

## 🔧 技术栈

| 层级 | 技术 | 版本 | 说明 |
|:----:|------|:----:|------|
| 前端 | React | 18 | 现代化 SPA 应用 |
| 前端 | TypeScript | 5.x | 类型安全 |
| 前端 | TailwindCSS | 3.x | 原子化 CSS |
| 前端 | Radix UI | - | 无障碍组件库 |
| 后端 | Hono | 4.x | 轻量高性能 Web 框架 |
| 后端 | TypeScript | 5.x | 类型安全 |
| 后端 | lunar-javascript | - | 农历转换库 |
| 数据库 | sql.js | - | SQLite 的纯 JS/WASM 实现 |
| 定时任务 | Croner | - | 轻量级 Cron 调度器 |
| 认证 | jose | - | JWT (HS256) 实现 |
| 通知 | nostr-tools | - | Nostr 协议客户端库 |
| 加密 | Node.js crypto | - | AES-256 + bcrypt |
| 构建 | esbuild | - | 高速 TypeScript 编译 |
| 容器 | Docker | - | 单容器部署 |

### 关于 sql.js

sql.js 是 SQLite 的纯 JavaScript/WebAssembly 实现，具有以下特点：

- **内存运行**：数据库完全在内存中运行，读写速度极快
- **文件持久化**：通过定期自动保存（auto-save）将内存数据写入磁盘文件
- **零依赖**：不需要安装原生 SQLite 库，跨平台兼容性极佳
- **WASM 加速**：使用 WebAssembly 编译的 SQLite 引擎，性能接近原生

> ⚠️ 注意：sql.js 不支持 WAL (Write-Ahead Logging) 模式，因为数据库运行在内存中。持久化通过 `db.export()` 导出二进制数据并写入文件实现。

---

## 💾 数据库设计

### Schema 概览

TimeMark 使用 SQLite 数据库，包含以下核心表：

```
┌──────────────────┐     ┌──────────────────┐
│      users       │     │     sessions     │
│──────────────────│     │──────────────────│
│ id (PK)          │────>│ user_id (FK)     │
│ username         │     │ token            │
│ password_hash    │     │ device_fingerprint│
│ totp_secret      │     │ is_trusted       │
│ avatar_url       │     │ expires_at       │
│ created_at       │     │ created_at       │
└──────────────────┘     └──────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────┐     ┌──────────────────────┐
│     events       │     │ notification_accounts │
│──────────────────│     │──────────────────────│
│ id (PK)          │     │ id (PK)              │
│ user_id (FK)     │     │ user_id (FK)         │
│ name             │     │ type                 │
│ type             │     │ name                 │
│ date             │     │ webhook (加密)        │
│ calendar_type    │     │ token (加密)          │
│ lunar_date       │     │ secret (加密)         │
│ reminder_config  │     │ chat_id              │
│ reminder_time    │     │ is_active            │
│ notification_    │     │ config_method        │
│   channels       │     │ session_data (加密)   │
│ notification_    │     │ plugin_package       │
│   account_ids    │     │ created_at           │
│ person_name      │     └──────────────────────┘
│ created_at       │
└──────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────────┐
│  event_trigger_logs  │
│──────────────────────│
│ id (PK)              │
│ event_id (FK)        │
│ user_id (FK)         │
│ trigger_type         │
│ trigger_date         │
│ scheduled_date       │
│ status               │
│ channels             │
│ error_message        │
│ created_at           │
└──────────────────────┘
```

### 完整表结构

| 表名 | 说明 | 主要字段 |
|------|------|----------|
| `users` | 用户表 | id, username, password_hash, totp_secret |
| `sessions` | 会话表 | token, device_fingerprint, expires_at |
| `events` | 事件表 | name, type, date, calendar_type, lunar_date, reminder_config |
| `notification_accounts` | 通知账户表 | type, name, webhook(加密), token(加密), secret(加密) |
| `event_trigger_logs` | 触发日志表 | event_id, trigger_type, status, channels |
| `relationship_mappings` | 关系映射表 | from_relation, to_relation, recipient_type |
| `user_configs` | 用户配置表 | 各渠道加密凭证, reminder_emails, alert_channels |
| `email_logs` | 邮件日志表 | event_id, recipient, status, message_id |
| `login_logs` | 登录日志表 | ip_address, user_agent, success, failure_reason |
| `login_attempts` | 登录尝试表 | identifier, failed_count, locked_until |
| `event_templates` | 事件模板表 | event_type, template_content |
| `schema_version` | Schema 版本表 | version, applied_at |

### 数据库初始化流程

```
应用启动
  → initSqlJs() 加载 WASM 引擎
  → 检查磁盘文件是否存在
    → 存在：读取文件到内存
    → 不存在：创建空数据库
  → 启动自动保存定时器
  → 执行 schema.sql 迁移（CREATE TABLE IF NOT EXISTS）
  → 检查 schema_version 表，执行增量迁移
  → 数据库就绪
```

---

## 🌐 API 接口

所有 API 路由挂载在 `/api` 前缀下，受 JWT 认证保护（除登录接口外）。

### 认证接口 (`/api/auth`)

| 方法 | 路径 | 说明 | 认证 |
|:----:|------|------|:----:|
| POST | `/api/auth/login` | 用户登录 | 否 |
| POST | `/api/auth/verify-2fa` | 验证 TOTP 码 | 否 |
| POST | `/api/auth/setup-2fa` | 获取 TOTP 密钥和二维码 | 是 |
| POST | `/api/auth/logout` | 登出（销毁会话） | 是 |
| POST | `/api/auth/change-password` | 修改密码 | 是 |
| POST | `/api/auth/refresh` | 刷新 Access Token | 是 |

### 事件接口 (`/api/events`)

| 方法 | 路径 | 说明 | 认证 |
|:----:|------|------|:----:|
| GET | `/api/events` | 获取所有事件列表 | 是 |
| POST | `/api/events` | 创建新事件 | 是 |
| PUT | `/api/events/:id` | 更新事件 | 是 |
| DELETE | `/api/events/:id` | 删除事件 | 是 |

### 配置接口 (`/api/config`)

| 方法 | 路径 | 说明 | 认证 |
|:----:|------|------|:----:|
| GET | `/api/config` | 获取用户配置 | 是 |
| POST | `/api/config` | 保存用户配置 | 是 |

### 通知渠道接口 (`/api/channels`)

| 方法 | 路径 | 说明 | 认证 |
|:----:|------|------|:----:|
| GET | `/api/channels/templates` | 获取所有渠道模板 | 是 |
| GET | `/api/channels/templates/:id` | 获取单个渠道模板 | 是 |
| GET | `/api/channels/accounts` | 获取用户通知账户列表 | 是 |
| POST | `/api/channels/accounts` | 创建通知账户 | 是 |
| PUT | `/api/channels/accounts/:id` | 更新通知账户 | 是 |
| DELETE | `/api/channels/accounts/:id` | 删除通知账户 | 是 |
| POST | `/api/channels/test` | 测试通知连接 | 是 |
| POST | `/api/channels/plugin/:type/start` | 启动插件授权 | 是 |
| GET | `/api/channels/plugin/:type/status` | 查询插件授权状态 | 是 |
| POST | `/api/channels/plugin/:type/logout` | 登出插件 | 是 |

### 触发日志接口 (`/api/trigger-logs`)

| 方法 | 路径 | 说明 | 认证 |
|:----:|------|------|:----:|
| GET | `/api/trigger-logs` | 获取触发日志列表 | 是 |
| GET | `/api/trigger-logs/stats` | 获取触发统计 | 是 |

### 数据接口 (`/api/data`)

| 方法 | 路径 | 说明 | 认证 |
|:----:|------|------|:----:|
| GET | `/api/data/export` | 导出用户所有数据 | 是 |
| POST | `/api/data/import` | 导入用户数据 | 是 |

### 健康检查

| 方法 | 路径 | 说明 | 认证 |
|:----:|------|------|:----:|
| GET | `/health` | 健康检查 | 否 |

---

## 📢 通知渠道架构

### 渠道分类

TimeMark 将 38+ 通知渠道分为三种配置方式：

| 配置方式 | 说明 | 渠道数量 |
|:--------:|------|:--------:|
| **webhook** | 只需填写 Webhook URL | 大部分渠道 |
| **token** | 需要 Bot Token + 其他参数 | 部分渠道 |
| **plugin** | 需要扫码授权（如微信个人号） | 6 个 |

### 渠道实现列表

| 渠道 | 服务文件 | 配置方式 | 内置 |
|------|----------|:--------:|:----:|
| 邮件 (Resend) | `email.service.ts` | token | ✅ |
| Discord | `discord.service.ts` | webhook | ✅ |
| Slack | `slack.service.ts` | webhook | ✅ |
| 飞书 | `feishu.service.ts` | webhook | ✅ |
| 企业微信 | `wecom.service.ts` | webhook | ✅ |
| 钉钉 | `dingtalk.service.ts` | webhook | ✅ |
| Telegram | `telegram.service.ts` | token | ✅ |
| WxPusher | `wxpusher.service.ts` | token | ✅ |
| Qmsg | `qmsg.service.ts` | token | ✅ |
| Google Chat | `googlechat.service.ts` | webhook | ✅ |
| IRC | `irc.service.ts` | webhook | ✅ |
| Synology Chat | `synologychat.service.ts` | webhook | ✅ |
| Twitch | `twitch.service.ts` | webhook | ✅ |
| Mattermost | `mattermost.service.ts` | webhook | ✅ |
| Nextcloud Talk | `nextcloudtalk.service.ts` | webhook | ✅ |
| 通用 Webhook | `generic-webhook.service.ts` | webhook | ✅ |
| 微信龙虾 (ClawBot) | `clawbot.service.ts` | token | ✅ |
| Server酱 | `serverchan.service.ts` | token | ✅ |
| PushPlus | `pushplus.service.ts` | token | ✅ |
| Bark | `bark.service.ts` | token | ✅ |
| Gotify | `gotify.service.ts` | token | ✅ |
| 喵推送 (Meow) | `meow.service.ts` | token | ✅ |
| PushMe | `pushme.service.ts` | token | ✅ |
| 企业微信应用 (WeComApp) | `wecomapp.service.ts` | token | ✅ |
| Matrix | `matrix.service.ts` | token | ✅ |
| LINE | `line.service.ts` | token | ✅ |
| Microsoft Teams | `msteams.service.ts` | webhook | ✅ |
| Nostr | `nostr.service.ts` | token | ✅ |
| Ntfy | `ntfy.service.ts` | token | ✅ |
| Pushover | `pushover.service.ts` | token | ✅ |
| Apprise | `apprise.service.ts` | token | ✅ |
| WhatsApp | `whatsapp.service.ts` | plugin | ❌ |
| 微信 (OpenClaw) | `wechat-openclaw.service.ts` | plugin | ❌ |
| 微信 (Wechaty) | `wechaty.service.ts` | plugin | ❌ |
| QQ Bot | `qqbot.service.ts` | plugin | ❌ |
| Signal | `signal.service.ts` | plugin | ❌ |
| iMessage | `bluebubbles.service.ts` | plugin | ❌ |
| Zalo | `zalo.service.ts` | plugin | ❌ |

### 通知发送流程

```
事件触发
  → 获取事件关联的通知渠道 IDs
  → 查询 notification_accounts 表
  → 解密凭证 (AES-256, MASTER_KEY)
  → 应用通知模板（用户自定义模板优先，无则使用默认格式）
  → 根据渠道类型调用对应 service
    → webhook: HTTP POST 到 Webhook URL
    → token: 使用 Bot Token 调用 API
    → plugin: 通过已授权的会话发送
  → 逐渠道记录发送结果（成功/失败/错误信息）到 event_trigger_logs
```

### 多账户支持

v2.0 支持同一渠道配置多个账户。例如可以配置多个 Telegram Bot，不同事件发送到不同的 Bot/群组。

```
notification_accounts 表:
  ┌────┬──────────┬──────────────┬────────────┐
  │ id │ type     │ name         │ is_active  │
  ├────┼──────────┼──────────────┼────────────┤
  │ 1  │ telegram │ 家庭群 Bot    │ 1          │
  │ 2  │ telegram │ 工作群 Bot    │ 1          │
  │ 3  │ discord  │ 个人频道      │ 1          │
  └────┴──────────┴──────────────┴────────────┘
```

---

## 🛡️ 安全模型

### 安全架构概览

```
┌─────────────────────────────────────────────┐
│              安全防护层                       │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ 启动校验  │  │ 请求限流  │  │ XSS 防护 │  │
│  │MASTER_KEY│  │Rate Limit│  │ 输出转义  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ JWT 认证 │  │ TOTP 2FA │  │ 登录锁定 │  │
│  │ HS256    │  │ 双因素   │  │ 5次/15分  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│  ┌──────────┐  ┌──────────┐                 │
│  │ 密码哈希 │  │ 凭证加密 │                 │
│  │ bcrypt   │  │ AES-256  │                 │
│  └──────────┘  └──────────┘                 │
│                                              │
└─────────────────────────────────────────────┘
```

### MASTER_KEY 机制

MASTER_KEY 是 v2.0 的核心安全组件：

- **内置默认值**：系统内置默认 MASTER_KEY，开箱即用。公网部署建议自定义以增强安全性
- **凭证加密**：所有通知渠道的敏感凭证（Webhook URL、Bot Token、Secret 等）使用 AES-256 加密后存储
- **加密/解密函数**：`encrypt(value, MASTER_KEY)` / `decrypt(value, MASTER_KEY)`
- **不可更换**：更换 MASTER_KEY 后，已加密的凭证将无法解密

### JWT 会话管理

| 令牌类型 | 有效期 | 用途 |
|:--------:|:------:|------|
| Access Token | 15 分钟 | API 请求认证 |
| Refresh Token | 7 天 | 刷新 Access Token |

- 签名算法：HS256
- JWT_SECRET 在运行时动态读取，首次启动自动生成
- 支持设备指纹和信任设备机制

### 登录安全

| 机制 | 说明 |
|------|------|
| 密码哈希 | bcrypt (cost=10)，不可逆 |
| 登录锁定 | 连续 5 次失败，锁定时间线性叠加（5/10/15/20... 分钟） |
| 登录日志 | 记录 IP、User-Agent、设备指纹 |
| 2FA | TOTP 双因素认证，支持 Google/Microsoft Authenticator |

### 数据加密

| 数据类型 | 加密方式 |
|----------|----------|
| 用户密码 | bcrypt (cost=10) 哈希 |
| API Key | SHA-256 哈希存储 |
| TOTP 密钥 | 数据库明文（仅管理员可见） |
| 通知 Webhook URL | AES-256 加密 (MASTER_KEY) |
| 通知 Bot Token | AES-256 加密 (MASTER_KEY) |
| 通知 Secret | AES-256 加密 (MASTER_KEY) |
| 插件会话数据 | AES-256 加密 (MASTER_KEY) |

### 请求保护

| 机制 | 说明 |
|------|------|
| CSRF 保护 | 验证 Origin/Referer 或 JWT Bearer token |
| API Key | SHA-256 哈希存储，支持外部系统集成 |

---

## 📋 核心功能

### 事件类型

| 类型标识 | 名称 | 说明 |
|:--------:|------|------|
| `birthday` | 生日 | 家人、朋友、同事的生日 |
| `anniversary` | 纪念日 | 结婚/恋爱/创业纪念日 |
| `holiday` | 节日 | 春节/中秋节/情人节等 |
| `custom` | 自定义 | 任意重要日期 |

### 日历类型

```typescript
type CalendarType = 'gregorian' | 'lunar' | 'both';
// gregorian: 仅公历
// lunar: 仅农历（使用 lunar-javascript 库转换）
// both: 公历 + 农历同时显示
```

### 提醒配置

```json
{
  "reminderTime": "09:00",
  "reminderDaysBefore": [1, 3, 7],
  "notificationChannels": ["telegram", "email"],
  "notificationAccountIds": [1, 3]
}
```

### 关系映射

| 原始称呼 | 转换后 | 场景 |
|:--------:|:------:|------|
| 我爸 | 父亲 | 发送给其他家庭成员时 |
| 我妈 | 母亲 | 发送给其他家庭成员时 |
| 老婆 | 妻子 | 统一正式称呼 |
| 爷爷 | 外公 | 家庭成员关系映射 |

### 通知模板集成

自定义模板自动应用到通知发送，支持变量替换。事件触发时根据事件类型匹配对应模板，渲染后发送到各通知渠道。

### 用户时区

每个用户可设置独立时区，影响提醒时间计算。默认 `Asia/Shanghai`，支持全球所有 IANA 时区。

### 渠道连接状态

实时显示每个通知渠道的连接状态。配置渠道后可一键测试连通性，UI 直观展示在线/离线状态。

### 发送结果追踪

触发日志显示每个渠道的发送成功/失败状态。事件触发后按渠道逐一记录结果，方便定位通知失败原因。

---

## 📁 项目结构

```
timemark-docker/
├── backend/
│   └── src/
│       ├── index.ts              # 应用入口（启动校验、路由注册）
│       ├── db/
│       │   ├── index.ts          # sql.js 数据库初始化、连接管理
│       │   └── migrate.ts        # Schema 迁移
│       ├── routes/
│       │   ├── auth.ts           # 认证路由（登录/登出/2FA/改密）
│       │   ├── events.ts         # 事件 CRUD
│       │   ├── config.ts         # 用户配置
│       │   ├── channels.ts       # 通知渠道管理
│       │   ├── trigger-logs.ts   # 触发日志查询
│       │   └── data.ts           # 数据导出/导入
│       ├── services/
│       │   ├── auth.service.ts   # 认证业务逻辑
│       │   ├── session.service.ts # 会话管理
│       │   ├── alert.service.ts  # 提醒分发服务
│       │   ├── config.service.ts # 配置服务（含加密/解密）
│       │   └── notifications/    # 通知渠道实现
│       │       ├── index.ts              # 统一入口
│       │       ├── channels.config.ts    # 渠道定义和配置
│       │       ├── test-connection.ts    # 连接测试
│       │       ├── email.service.ts      # 邮件 (Resend)
│       │       ├── telegram.service.ts   # Telegram
│       │       ├── discord.service.ts    # Discord
│       │       ├── slack.service.ts      # Slack
│       │       ├── feishu.service.ts     # 飞书
│       │       ├── wecom.service.ts      # 企业微信
│       │       ├── dingtalk.service.ts   # 钉钉
│       │       ├── wxpusher.service.ts   # WxPusher
│       │       ├── qmsg.service.ts       # Qmsg
│       │       ├── ... (更多渠道)
│       │       └── zalo.service.ts       # Zalo
│       ├── middleware/
│       │   └── auth.middleware.ts # JWT 认证中间件
│       ├── queue/
│       │   └── scheduler.ts      # Croner 定时任务调度
│       └── utils/
│           ├── jwt.ts            # JWT 工具
│           └── password.ts       # 密码哈希工具
│
├── frontend/
│   └── src/
│       ├── pages/                # 页面组件
│       └── components/           # UI 组件
│
├── shared/                       # 前后端共享类型定义
│
├── docker/
│   ├── Dockerfile                # Docker 构建文件
│   └── schema.sql                # 数据库 Schema
│
├── docker-compose.dockerhub.yml  # Docker Hub 部署配置（推荐）
├── docker-compose.ghcr.yml       # GHCR 部署配置
├── docker-compose.simple.yml     # 飞牛OS 轻量配置
├── docker-compose.nas.yml        # NAS 专用配置
├── docker-compose.full.yml       # 公网服务器完整配置
├── docker-compose.public.yml     # 快速测试配置
├── docker-compose.yml            # 本地开发配置
│
├── README.md                     # 项目说明
├── DEPLOYMENT.md                 # 部署指南
└── PROJECT_DOC.md                # 技术文档（本文件）
```

---

## 🛠️ 开发指南

### 前置要求

- Node.js 18+
- pnpm 8+
- Docker 20.10+（可选，用于容器化测试）

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动前端开发服务器（:5173）
pnpm dev:frontend

# 启动后端开发服务器（:3000）
pnpm dev:backend

# 构建生产版本
pnpm build
```

### 环境变量（开发环境）

开发环境需要设置以下环境变量：

```bash
export DB_PATH=./data/timemark.db
export TZ=Asia/Shanghai
export NODE_ENV=development
export JWT_SECRET=$(openssl rand -hex 32)
export MASTER_KEY=$(openssl rand -hex 32)
export DEFAULT_ADMIN_USERNAME=admin
export DEFAULT_ADMIN_PASSWORD="$(openssl rand -hex 32)"
```

---

## 📦 部署配置

### 配置文件说明

| 文件 | 适用场景 | 镜像源 |
|------|----------|:------:|
| `docker-compose.dockerhub.yml` | 通用部署 **(推荐)** | Docker Hub |
| `docker-compose.ghcr.yml` | 通用部署 | GHCR |
| `docker-compose.simple.yml` | 飞牛OS | GHCR |
| `docker-compose.nas.yml` | 群晖/威联通/铁威马 | GHCR |
| `docker-compose.full.yml` | 公网服务器 | GHCR |
| `docker-compose.yml` | 本地开发 | 本地构建 |

### 环境变量

> 空数据库首次创建管理员必须设置 `DEFAULT_ADMIN_PASSWORD`；生产环境默认要求 HTTPS。局域网 HTTP 需显式启用。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JWT_SECRET` | 内置默认值 | JWT 签名密钥，公网部署建议自定义 |
| `MASTER_KEY` | 内置默认值 | 主密钥（通知凭证 AES 加密），公网部署建议自定义 |
| `DEFAULT_ADMIN_PASSWORD` | 无；首次创建管理员必填 | 初始管理员密码，不存在硬编码回退 |
| `ALLOW_INSECURE_HTTP` | `false` | 仅可信局域网显式设为 `true` 才允许明文 HTTP |
| `TRUSTED_PROXIES` | 无 | 可信代理 IP/CIDR 列表；其余请求头中的客户端 IP/协议不可信 |

详细部署步骤请参考 [DEPLOYMENT.md](DEPLOYMENT.md)。

---

## 📝 开源协议

MIT License

---

## 💬 支持

<div align="center">

**如果对你有帮助，请点个 ⭐ Star 支持一下！**

---

🐛 问题反馈：[GitHub Issues](https://github.com/WXFffff666/timemark-docker/issues)

---

Made with ❤️ by TimeMark

</div>

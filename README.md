# TimeMark Docker

<div align="center">

<h1>🎂 TimeMark</h1>

<h3>智能事件提醒系统 | 43+ 通知渠道 | 农历转换 | 关系映射</h3>

<p>一个为生日、纪念日等重要日期打造的全功能提醒系统。<br/>单容器部署，开箱即用，支持飞牛OS / 群晖 / 威联通 / 铁威马等 NAS 平台。</p>

---

[![Version](https://img.shields.io/badge/Version-2.16.0-blue?style=flat&color=2563eb)](https://github.com/WXFffff666/timemark-docker)
[![Docker Pulls](https://img.shields.io/docker/pulls/xfffff666/timemark?style=flat&color=0ea5e9)](https://hub.docker.com/r/xfffff666/timemark)
[![Docker Image Size](https://img.shields.io/docker/image-size/xfffff666/timemark/latest?style=flat&color=6366f1)](https://hub.docker.com/r/xfffff666/timemark)
[![GitHub Stars](https://img.shields.io/github/stars/WXFffff666/timemark-docker?style=flat&color=f59e0b)](https://github.com/WXFffff666/timemark-docker/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/WXFffff666/timemark-docker?style=flat&color=10b981)](https://github.com/WXFffff666/timemark-docker/commits/master)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat&color=22c55e)](LICENSE)

---

[📖 部署文档](DEPLOYMENT.md) · 
[🐛 问题反馈](https://github.com/WXFffff666/timemark-docker/issues) · 
[⭐ Star 支持](https://github.com/WXFffff666/timemark-docker/stargazers) · 
[🌐 在线演示](https://email.the37777777.top/)

</div>

---

## 🚀 v2.x 重大更新

v2.0 是一次彻底的架构重构，从三容器方案精简为单容器部署，同时大幅强化了安全性和性能。v2.4.x 在此基础上增加了通知模板、重复事件等重要功能。

| 对比项 | v1.x | v2.16.0 |
|:------:|:----:|:------:|
| 数据库 | PostgreSQL + Redis | **SQLite (内置，零配置)** |
| 容器数量 | 3 个 | **1 个** |
| 内存占用 | ~800MB | **~256MB** |
| 部署复杂度 | 需配置数据库连接 | **开箱即用** |
| 安全加固 | 基础认证 | **登录锁定 + JWT + 限流 + CSRF + XSS 防护** |
| 通知账户 | 明文存储 | **AES-256 加密存储** |
| 多账户支持 | 单渠道单账户 | **同渠道多账户 + 多邮箱** |
| 定时任务 | Redis + Bull | **Croner (每分钟检查)** |
| 事件类型 | 4 种 | **11 种 (含会议/旅行/婚礼等)** |
| 通知渠道 | 有限 | **43+ 通知渠道** |
| 通知模板 | 无 | **13 种预设 + 自定义模板** |
| 重复事件 | 不支持 | **每天/每周/每月/每年** |
| 安全告警 | 无 | **登录锁定告警 + 渠道选择 + 独立模板** |
| 网络检测 | 无 | **渠道可达性检测（中国大陆友好）** |

### v2.x 核心改进

- **架构精简**：去掉 PostgreSQL 和 Redis 依赖，SQLite 内置数据库，单容器即可运行
- **即开即用**：零配置启动，所有环境变量均有内置默认值，`docker compose up -d` 即可运行
- **安全加固**：登录失败锁定 + 安全告警 + 登录日志 + 通知凭证 AES-256 加密 + CSRF 保护
- **性能优化**：内存占用降低 70%，启动速度提升，适合 J4125 等低功耗 NAS 处理器
- **多账户通知**：所有通知渠道（含邮箱）统一通过账户管理，支持同渠道多账户多选
- **触发日志**：完整记录每次提醒的触发时间、渠道、结果，方便排查问题
- **通知模板预览**：13 种预设模板按事件类型分组，支持自定义模板，创建事件时实时预览
- **重复事件**：支持每天/每周/每月/每年重复，自动创建下次事件
- **多邮箱支持**：事件支持添加多个收件人邮箱，调度器每分钟检查
- **ICS 日历导出**：Dashboard 一键导出 ICS 文件，支持 Google Calendar、Apple Calendar
- **更多事件类型**：新增会议、截止日期、旅行、毕业、婚礼、医疗等类型
- **称呼映射扩展**：扩展到 40+ 常用称呼映射
- **安全告警**：登录失败自动锁定 + 通过已配置渠道发送安全告警邮件（独立模板）
- **网络检测**：自动检测通知渠道 API 可达性，中国大陆用户友好
- **通知降级**：主渠道失败自动尝试备用渠道，支持静默时段配置
- **渠道绑定**：创建事件时只能选择已配置且测试通过的渠道
- **Docker 优化**：多阶段构建，镜像大小减少 30%+

---

## ✨ 特性一览

| 🗓️ 精准农历 | 📢 多渠道通知 | 👨‍👩‍👧‍👦 智能关系映射 | 🔒 安全防护 | 🌍 全球时区 |
|:----------:|:----------:|:---------------:|:----------:|:--------:|
| 闰月自动转换 | 43+ 通知渠道 | 40+ 称呼映射 | 登录锁定 + 告警 | NTP 自动同步 |
| 公历/农历双历 | 同渠道多账户 | 家庭关系映射 | AES-256 凭证加密 | 自定义时区 |

| 📝 通知模板 | 🔄 重复事件 | 📧 多邮箱支持 | 📅 日历三视图 | 🎯 11 种事件类型 |
|:----------:|:----------:|:------------:|:----------:|:---------------:|
| 13 种预设模板 | 每天/每周/每月/每年 | 联系人多邮箱/手机 | 年/月/日视图 | 生日/纪念日/节日等 |
| 按事件类型分组 | 自动创建下次事件 | 快捷发信可选收件人 | 公历/农历/双历 | 会议/旅行/婚礼等 |

| 📥 Inbox 收件箱 | 🔌 Integrations | 👥 固定联系人 | ✅ 待办历史 | ⏰ NTP 校准 |
|:-------------:|:-------------:|:----------:|:---------:|:---------:|
| 通知全链路收件箱 | 入站 Webhook | 多邮箱/手机带标签 | 打勾完成 + 历史 | WorldTimeAPI/timeapi.io |
| 指数退避重试 | ICS 订阅/同步 | 批量邮件一键合并 | 365 天自动清理 | 按用户 IANA 时区 |

---

## ⚡ 快速部署

> 只需 3 步，60 秒完成部署。

### 镜像拉取方式

| 镜像源 | 拉取地址 | 需要登录 | 推荐场景 |
|:------:|----------|:--------:|:--------:|
| **Docker Hub** (推荐) | `xfffff666/timemark:latest` | 否 | 个人 / 家庭 / NAS |
| **GHCR** | `ghcr.io/wfffff666/timemark:latest` | 是 (GitHub) | 开发者 / 企业 |

> 💡 **推荐 Docker Hub**，无需任何认证即可拉取。

### 一键部署

```bash
# 1. 创建目录
mkdir timemark && cd timemark

# 2. 下载配置
curl -sSL https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.dockerhub.yml -o docker-compose.yml

# 3. 启动（就这么简单，不需要改任何配置）
docker compose up -d
```

部署完成！访问 `http://服务器IP:3000`

| 项目 | 值 |
|:----:|:--:|
| 默认用户名 | `admin` |
| 默认密码 | `TimeMark@2026` |

> ⚠️ **首次登录后请立即修改密码！** 进入设置页面即可修改。

### 配置文件说明

| 文件名 | 适用平台 | 镜像源 | 特点 |
|--------|:-------:|:------:|------|
| `docker-compose.dockerhub.yml` | 通用 | Docker Hub | 即拉即用，无需认证，**推荐** |
| `docker-compose.simple.yml` | 飞牛OS / NAS | Docker Hub | 最简配置 |
| `docker-compose.nas.yml` | 群晖/威联通/铁威马 | Docker Hub | NAS 专用，自定义存储路径 |
| `docker-compose.full.yml` | 公网服务器 | Docker Hub | 生产配置，含资源限制 |
| `docker-compose.ghcr.yml` | 通用 | GHCR | 需要 GitHub 登录，备用 |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────┐
│                TimeMark v2.16.0                  │
│            单容器 · 零依赖 · 开箱即用             │
├─────────────────────────────────────────────────┤
│                                                  │
│   ┌───────────┐       ┌────────────────────┐    │
│   │  :3000    │       │    SQLite DB        │    │
│   │  Web UI   │       │  sql.js (内存数据库  │    │
│   │  (React)  │       │  + 文件持久化)       │    │
│   └─────┬─────┘       └─────────┬──────────┘    │
│         │                       │                │
│         │    ┌──────────────┐   │                │
│         └───>│   Hono API   │<──┘                │
│              │  (TypeScript) │                    │
│              └──────┬───────┘                    │
│                     │                            │
│      ┌──────────────┼──────────────┐             │
│      │              │              │             │
│  ┌───┴────┐   ┌─────┴─────┐  ┌────┴─────┐      │
│  │ Croner │   │  Static   │  │  Alert   │      │
│  │  Cron  │   │  Files    │  │ Service  │      │
│  │ (定时)  │   │ (前端资源) │  │ (通知分发) │      │
│  └────────┘   └───────────┘  └──────────┘      │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 说明 |
|:----:|------|------|
| 前端 | React 18 + TypeScript + TailwindCSS + Radix UI | 现代化响应式界面 |
| 后端 | Hono + TypeScript + lunar-javascript | 轻量高性能 API 框架 |
| 数据库 | SQLite 3 (sql.js / 内存数据库 + 文件持久化) | 纯 JS 实现，零外部依赖 |
| 定时任务 | Croner | 内置调度器，替代 Redis + Bull |
| 认证 | JWT (HS256) | 会话认证 + 登录锁定 |
| 加密 | AES-256 + bcrypt | 凭证加密 + 密码哈希 |

> 💡 **关于 sql.js**：sql.js 是 SQLite 的纯 JavaScript/WASM 实现，数据库完全在内存中运行，通过定期写入文件实现持久化。无需安装原生 SQLite，跨平台兼容性极佳。

---

## 📋 核心功能

### 事件管理

| 类型 | 说明 | 示例 |
|:----:|------|------|
| 🎂 生日 | 家人、朋友、同事的生日 | 妈妈的生日 (农历八月十五) |
| 💍 纪念日 | 结婚/恋爱/创业纪念日 | 结婚五周年 |
| 🎊 节日 | 传统节日和特殊日期 | 春节、中秋节、情人节 |
| 📝 考试 | 考试、面试等重要日期 | 英语六级考试 |
| 💼 会议 | 工作会议、商务会议 | 季度总结会 |
| ⏰ 截止日期 | 项目截止、任务到期 | 项目交付日期 |
| ✈️ 旅行 | 出行计划、航班提醒 | 日本旅行 |
| 🎓 毕业 | 毕业典礼、学位授予 | 大学毕业典礼 |
| 💒 婚礼 | 婚礼、订婚仪式 | 结婚纪念日 |
| 🏥 医疗 | 体检、复诊、用药提醒 | 年度体检 |
| 📌 自定义 | 任意重要日期 | 驾照到期、保险续费 |

### 日历支持（v2.16.0 三视图 + 双历修复）

| 模式 | 说明 |
|:----:|------|
| **公历** | 标准公历日期 |
| **农历** | 农历文本输入，精准转换，含闰月自动处理 |
| **双历** | 公历与农历双向同步；保存时写入 `lunarDate` 供 Cron 农历提醒 |

> v2.16.0 修复：事件表单双历模式正确同步 `lunarDate`，`resolveNextOccurrenceDate` 农历/双历对齐 Cron；日历页标签显示「公历/农历/双历」；`runLunarCalendarSelfTest` 往返校验。视图支持年/月/日三视图切换。

### 时区与 NTP（v2.16.0）

| 功能 | 说明 |
|:----:|------|
| **默认时区** | `Asia/Shanghai`（北京时间），首页快捷切换与设置页全局联动 |
| **NTP 校准** | 后台从 WorldTimeAPI / timeapi.io 获取权威时间，校正服务器时钟漂移 |
| **按用户时区** | 切换时区后 NTP 与「今天」计算跟随该 IANA 时区；`GET /api/time/status?timezone=Asia/Shanghai` |
| **首页时钟** | 接入 NTP 偏移后的校正时间 |

Cron 每分钟提醒使用校正后的时间，在配置的提醒时刻 ±2 分钟内触发。

### 固定联系人与批量邮件（v2.15.0 v30）

| 功能 | 说明 |
|:----:|------|
| 多联系方式 | 每个联系人可配多个邮箱/手机/Telegram/QQ/WxPusher，带标签（如「工作」「妈妈」） |
| 快捷发信 | 仅 1 邮箱直接编辑；多邮箱先二级界面手动勾选收件人 |
| 批量邮件 | 选中联系人自动合并其全部邮箱；支持模板变量 `{{contact_name}}` |
| 数据存储 | `fixed_contacts.contact_methods` JSONB（v30），旧单字段自动迁入 |

### 近期待办（v2.15.0 v29）

| 功能 | 说明 |
|:----:|------|
| 待办窗口 | 事件进入「提前 N 天」窗口后出现在 `/todos` 与首页待办数字 |
| 打勾完成 | 点击圆圈标记完成，同步服务端 `todo_completions`（v29） |
| 完成历史 | 「完成历史」标签页查看已归档记录；数据库保留 ~365 天后清理 |

### 集成（Webhook / 日历）

| 功能 | 说明 |
|:----:|------|
| 入站 Webhook | 外部系统 POST JSON 自动创建事件 |
| ICS 订阅 Feed | Google/Outlook 订阅本应用事件 |
| 外部 ICS 同步 | 从 URL 拉取事件（`isSafePublicUrl()` SSRF 校验） |
| 冲突提示 | 通知中提示同日其他日程 |

详见 `docs/INTEGRATIONS.md`（Docker 版同步 vercel 同名文档）。

### Inbox 全链路

通知成功写入收件箱，未读角标提醒；服务端已内置 `notification_queue` 指数退避（5m→30m→2h→6h）重试与 30 天清理任务。注意：当前版本发送端尚未在失败时自动入队（与 vercel 版一致），队列机制为后续版本启用预留。详见 `docs/NOTIFICATIONS.md`。

### 提醒配置

| 配置项 | 可选值 |
|--------|--------|
| 提醒时间 | 06:00 - 22:00 + 自定义任意时间 (可多选) |
| 提前天数 | 1天 / 3天 / 7天 / 14天 / 30天 (可多选) |
| 通知渠道 | 43+ 渠道任意组合 (可多选) |
| 重复事件 | 每天 / 每周 / 每月 / 每年 |
| 通知模板 | 6 种预设模板 + 自定义模板 |
| 收件人邮箱 | 支持多个收件人邮箱 |

### 通知模板

创建事件时，点击"预览通知"按钮，系统会根据事件类型自动显示对应的模板列表：

| 事件类型 | 可用模板 |
|:--------:|----------|
| 生日 | 生日提醒、生日简洁版、生日详细版、通用提醒、详细提醒 |
| 考试 | 考试提醒、考试紧急提醒、通用提醒、详细提醒 |
| 纪念日 | 纪念日提醒、纪念日简洁版、通用提醒、详细提醒 |
| 节日 | 节日提醒、节日家庭版、通用提醒、详细提醒 |
| 其他 | 通用提醒、详细提醒 |

支持自定义模板，可在设置页面创建和管理。

### 关系映射

智能转换称呼，让通知内容更自然：

| 原始称呼 | 智能转换 | 场景 |
|:--------:|:--------:|------|
| 我爸 | 父亲 | 发送给其他家庭成员时 |
| 我妈 | 母亲 | 发送给其他家庭成员时 |
| 老公 | 丈夫 | 统一正式称呼 |
| 爷爷 | 外公 | 家庭关系自动映射 |

---

## 📢 通知渠道 (43+)

TimeMark 支持 43+ 通知渠道，覆盖国内外主流通讯平台。所有渠道（含邮箱）统一通过「通知账户」管理，支持同渠道多账户配置，创建事件时可选择发送给哪些账户。

### 💬 即时通讯 (11 个)

| 渠道 | 说明 |
|------|------|
| 📧 邮件 (Resend) | 正式邮件通知，支持多账号选择 |
| 🔵 飞书 | 飞书群聊机器人 |
| 🟢 企业微信 | 企业微信群聊机器人 |
| 🔷 钉钉 | 钉钉群聊机器人 |
| ✈️ Telegram | Telegram Bot 推送 |
| 💜 Slack | Slack 频道通知 |
| 🟣 Discord | Discord Webhook |
| 📱 WxPusher | 微信公众号推送 |
| 💬 Qmsg | QQ 消息推送 |
| 🦞 微信龙虾 (ClawBot) | 直接推送到个人微信（ilink API） |
| 📡 Server酱 | 微信推送服务（Turbo/V3） |

### 🔗 Webhook 集成 (10 个)

| 渠道 | 说明 |
|------|------|
| Google Chat | Google 工作区通知 |
| IRC | IRC 频道消息 |
| Synology Chat | 群晖 Chat 通知 |
| Twitch | Twitch 频道通知 |
| Mattermost | Mattermost 频道 |
| Nextcloud Talk | Nextcloud 聊天 |
| 通用 Webhook | 自定义 HTTP 回调 |
| PushPlus | 多渠道推送服务 |
| PushMe | 多平台统一推送 |

### 📱 移动推送 (4 个)

| 渠道 | 说明 |
|------|------|
| Bark | iOS 自定义推送通知 |
| Gotify | 自托管推送服务 |
| 喵推送 (Meow) | 鸿蒙系统推送 |
| 企业微信应用 | 企微应用消息推送 |

### 🌐 协议集成 (5 个)

| 渠道 | 说明 |
|------|------|
| Matrix | 去中心化通讯协议 |
| LINE | LINE 消息推送 |
| Microsoft Teams | Teams 频道通知 |
| Nostr | 去中心化社交协议 |
| WhatsApp | WhatsApp 消息 |

### 🔌 插件渠道 (5 个)

| 渠道 | 说明 |
|------|------|
| 微信个人号 (OpenClaw) | 微信个人消息 |
| 微信个人号 (Wechaty) | 微信个人消息 (Wechaty 方案) |
| QQ Bot | QQ 机器人 |
| Signal | Signal 加密消息 |
| iMessage (BlueBubbles) | Apple iMessage |
| Zalo | 越南 Zalo 消息 |

---

## 🔐 首次登录

| 项目 | 说明 |
|:----:|------|
| 访问地址 | `http://服务器IP:3000` |
| 用户名 | `admin`（默认） |
| 密码 | `TimeMark@2026`（默认） |

> ⚠️ **首次登录后请立即修改密码！** 进入设置页面即可修改。

---

## ⚙️ 环境变量

> ✅ **所有环境变量均为可选，不设置也能正常使用。** 系统内置默认值，`docker compose up -d` 即可启动。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TZ` | `Asia/Shanghai` | 时区设置（常用自定义项） |
| `DB_PATH` | `/app/data/timemark.db` | SQLite 数据库文件路径 |
| `NODE_ENV` | `production` | 运行环境 |
| `JWT_SECRET` | 首次启动自动生成 | JWT 签名密钥，自动保存到 `data/.env` |
| `MASTER_KEY` | 首次启动自动生成 | 主密钥（通知凭证 AES 加密），自动保存到 `data/.env` |
| `CORS_ORIGIN` | 无（默认同 Host 放行） | 允许的前端源；**生产公网必填**自定义域名，逗号分隔 |
| `TURNSTILE_SITE_KEY` | 无 | Cloudflare Turnstile 站点密钥（可选，可公开） |
| `TURNSTILE_SECRET_KEY` | 无 | Turnstile 服务端密钥，**仅 Production 需要** |
| `DEFAULT_ADMIN_USERNAME` | `admin` | 初始管理员用户名 |
| `DEFAULT_ADMIN_PASSWORD` | `TimeMark@2026` | 初始管理员密码 |
| `LOG_QUERIES` | `false` | 是否打印 SQL 查询日志（调试用） |

> 🔐 **生产提示**：`CORS_ORIGIN` / `TURNSTILE_SECRET_KEY` 等敏感变量**仅 Production 需要配置**（Docker 单环境部署按生产原则即可；参考 vercel 仅 Production 勾选，避免泄露到预览）。FNOS 权限问题：v2.16 修复后容器入口会在 root 运行时自动修复挂载目录属主并降权到 app 用户；如仍遇权限问题，可取消 `docker-compose.yml` 中 `user: "0:0"` 注释以 root 运行（见 DEPLOYMENT.md FNOS 排查）。

> 🔐 **密钥管理说明**：
> - 首次启动时，系统会自动生成随机的 `JWT_SECRET` 和 `MASTER_KEY`
> - 生成的密钥会保存到 `data/.env` 文件中，后续启动会自动读取
> - 如需自定义密钥，可直接设置环境变量或修改 `data/.env` 文件
> - ⚠️ 更换 `MASTER_KEY` 后，已加密的通知渠道凭证需要重新配置

---

## 🛡️ 安全特性（v2.16.0 零信任加固）

TimeMark v2.16.0 内置多层安全防护：

| 特性 | 说明 |
|------|------|
| **自动生成密钥** | 首次启动自动生成随机 JWT_SECRET 和 MASTER_KEY，无需手动配置 |
| **登录失败锁定** | 连续 5 次失败触发锁定，锁定时间线性叠加（5/10/15/20... 分钟） |
| **安全告警** | 触发锁定时，自动通过已配置的通知渠道发送告警通知 |
| **登录日志** | 记录所有登录尝试（成功/失败），含 IP、时间、结果 |
| **JWT 会话管理** | Access Token (15 分钟) + Refresh Token (7 天)，自动续期 |
| **API 限流** | 请求频率限制，防止暴力破解和滥用 |
| **XSS 防护** | 输出转义 + 内容过滤，防止跨站脚本攻击 |
| **密码加密** | bcrypt (cost=10) 哈希存储，不可逆 |
| **凭证加密** | 通知渠道 API Key/Token 使用 AES-256 加密存储 |
| **零信任网关** | 移除未验证 `X-API-Key` bypass，拦截扫描路径与恶意 UA |
| **Passkey + Turnstile** | 密码与 Passkey 登录均强制人机验证；Turnstile 与 IP 封禁/锁定并行检查 |
| **SSRF 防护** | 外部日历 URL 拉取前 `isSafePublicUrl()` 校验公网安全地址 |
| **HSTS** | 响应头 `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| **SMTP TLS** | 587 端口 `requireTLS: true`，465 使用 `secure: true` |
| **CORS 收紧** | 禁止 `CORS_ORIGIN=*` 与 credentials 组合；生产建议填自定义域名 |
| **密钥脱敏** | `GET /api/config/accounts` 不返回明文 token/secret，仅 `tokenConfigured` 标志 |
| **发信白名单** | 快捷发信 `recipientEmails` 必须属于联系人邮箱列表，禁止任意中继 |
| **单用户模式** | 固定个人单账户，禁止创建第二用户；会话令牌后台自动续期 |

安全评估详见 `docs/SECURITY_AUDIT.md`（同步 vercel v2.16.0）。

---

## 💾 数据备份

SQLite 单文件数据库，备份非常简单。

```bash
# 方式一：在线备份（无需停止容器）
# sql.js 内存数据库定期写入文件，直接复制即可
cp ./data/timemark.db ./data/timemark.db.bak.$(date +%Y%m%d)

# 方式二：完整目录备份
tar -czf timemark-backup-$(date +%Y%m%d).tar.gz ./data

# 方式三：自动定时备份 (crontab)
# 每天凌晨 3 点自动备份
0 3 * * * cd /opt/timemark && tar -czf /backup/timemark-$(date +\%Y\%m\%d).tar.gz ./data
```

### 恢复数据

```bash
# 停止服务
docker compose down

# 恢复备份文件
cp ./data/timemark.db.bak ./data/timemark.db

# 重新启动
docker compose up -d
```

---

## 💻 系统要求

| 项目 | 最低配置 | 推荐配置 |
|:----:|:--------:|:--------:|
| CPU | 1 核 | 2 核 |
| 内存 | 256MB | 512MB |
| 磁盘 | 1GB | 5GB |
| Docker | 20.10+ | 24.0+ |

### 低功耗设备说明

TimeMark v2.0 专门针对低功耗 NAS 处理器做了优化。Intel J4125、N5105 等赛扬/奔腾处理器完全够用。单容器架构相比 v1.x 的三容器方案，内存占用降低约 70%，非常适合家用 NAS 环境。

---

## 🔧 常见问题

### 端口被占用

修改 docker-compose.yml 中的端口映射：

```yaml
ports:
  - "8080:3000"  # 将 3000 改为其他可用端口
```

### 镜像拉取失败

如果使用 GHCR 源，需要先登录：

```bash
docker login ghcr.io -u 你的GitHub用户名 -p 你的GitHubToken
```

推荐切换到 Docker Hub 源，无需登录：`xfffff666/timemark:latest`

### 忘记管理员密码

```bash
# 1. 停止服务
docker compose down

# 2. 删除数据目录（⚠️ 会清除所有数据！请先备份）
rm -rf ./data

# 3. 重新启动（自动创建新数据库）
docker compose up -d
```

### 通知渠道凭证解密失败

如果自定义了 MASTER_KEY 后又更换，之前加密存储的通知渠道凭证将无法解密。需要重新配置所有通知渠道。

### 数据库文件损坏

```bash
# 1. 备份损坏的文件
cp ./data/timemark.db ./data/timemark.db.corrupted

# 2. 如果有备份，恢复备份
cp ./data/timemark.db.bak ./data/timemark.db

# 3. 如果没有备份，删除后重建
rm ./data/timemark.db
docker compose restart
```

---

## 📝 更新日志

| 版本 | 日期 | 内容 |
|:----:|:----:|------|
| **v2.16.0** | 2026-07 | 合并同步 vercel v2.7–v2.16：双历/农历修复、NTP 按时区校准、登录加速、单用户模式、联系人多邮箱/手机、待办完成历史、日历视图、安全加固（零信任/SSRF/Passkey）等（详见 CHANGELOG） |
| **v2.4.2** | 2026-05 | 通知预览按事件类型分组显示模板；Resend 发件人邮箱字段改为可选；调度器优化（每分钟检查）；事件创建/更新后立即触发提醒 |
| **v2.4.1** | 2026-05 | 修复 Resend 发件人邮箱强制必填；修复 Zod 验证规则；调度器时间匹配优化；事件创建后立即触发提醒 |
| **v2.4.0** | 2026-05 | 通知模板预览（6 种预设模板）；自定义事件模板；浏览器推送 UI；日历导出按钮；重复事件选项；更多事件类型（会议/截止日期/旅行/毕业/婚礼/医疗）；CSRF 保护；API 分页；单元测试 |
| **v2.3.0** | 2026-05 | 自动生成密钥；更多示例事件；渠道测试按钮修复；事件测试发送修复；Resend 发件人修复；时区偏移修复 |
| **v2.2.0** | 2026-05 | 性能优化 + 安全加固 + 功能增强：sql.js 防抖保存（性能提升 10x）；bcrypt 异步化；通知重试机制（3次指数退避）；农历时区修复 + 提醒去重；COALESCE 修复 + chat_id 加密；硬编码密钥检测警告；非 root 容器运行；请求 ID 追踪；统计 API / 备份 API / CSV 导入；API Token 认证；农历智能节日提醒 |
| **v2.1.0** | 2026-04 | 新增 8 个通知渠道（ClawBot/ServerChan/PushPlus/Bark/Gotify/Meow/PushMe/WeComApp）；邮箱多账号选择；登录锁定线性叠加；Docker 依赖修复；零配置即开即用 |
| **v2.0.0** | 2026-04 | 架构重构：PostgreSQL + Redis → SQLite 单容器；零配置即开即用；登录锁定 + 安全告警 + 登录日志；通知凭证 AES 加密；邮箱多账号选择；触发日志 |
| v1.1.1 | 2026-04 | 登录锁定、UI 优化 |
| v1.1.0 | 2025-04 | 提醒多选、农历修复 |
| v1.0.0 | 2025-01 | 初始版本 |

---

## 💬 支持

<div align="center">

**如果对你有帮助，点个 ⭐ Star 支持一下！**

---

🐛 问题反馈：[GitHub Issues](https://github.com/WXFffff666/timemark-docker/issues)

📖 部署文档：[DEPLOYMENT.md](DEPLOYMENT.md)

---

Made with ❤️ by TimeMark

</div>

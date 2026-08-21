# Changelog

## v2.16.0 (2026-07-31)

### 双历与农历

- **事件表单**：公历/农历/双历模式正确同步 `lunarDate`；纯农历使用农历文本输入；保存时往返校验
- **倒计时与待办**：前端 `resolveNextOccurrenceDate` 支持农历/双历，与 Cron 提醒逻辑对齐
- **日历页**：事件标签显示「公历 / 农历 / 双历」
- **自检**：`runLunarCalendarSelfTest` 公历→农历→公历往返校验（`shared/lunar-calendar`）

### 时区与 NTP 时间校准

- **默认时区**：`Asia/Shanghai`（北京时间）；首页快捷切换与设置页全局联动
- **NTP 校准**：Cron 提醒、`/api/time/status` 使用 WorldTimeAPI / timeapi.io 校正时钟漂移
- **按用户时区**：切换时区后 NTP 与「今天」计算跟随该 IANA 时区
- **首页时钟**：接入 NTP 偏移后的校正时间
- **健康检查**：`/api/health` 不再阻塞等待 NTP；Cron 详情仅 `detailed=1` + token 可见

### 登录性能

- Turnstile、IP 封禁、账户锁定 **并行检查**
- 登录查询 **合并为一次**（密码 + TOTP + IP 白名单 + 改密状态）
- 无失败记录时跳过 `countPasswordFailuresSinceLastSuccess`
- 成功路径：先返回 Session，审计日志 **后台异步**
- `/api/auth/login` 不再重复走全局 `apiRateLimit`
- Turnstile **preconnect** 预连接 Cloudflare

### 安全加固

- **零信任**：移除未验证的 `X-API-Key` bypass
- **Passkey 登录**：与密码登录一致，强制 Turnstile 人机验证
- **外部日历 SSRF**：拉取 ICS 前 `isSafePublicUrl()` 校验
- **Resend Webhook**：生产环境一律要求有效签名
- **Google OAuth**：回调重定向限制在白名单域名（`CORS_ORIGIN` / canonical）
- **API Key**：移除 `api_key` 明文回退，仅 `api_key_hash`

### 单用户模式

- 固定个人单账户，禁止创建第二用户
- 会话令牌后台自动续期；安全中心移除需手动改 Vercel env 的 MASTER_KEY 轮换 UI

### 提醒修复

- Cron 纳入无 `user_configs` 但有事件的用户；登录/bootstrap 自动补配置
- 修复 `nextOccurrence.slice is not a function`（pg DATE 兼容）
- 提醒时刻 ±2 分钟窗口抽取为 `matchesReminderTimeWindow` 共享函数

### 文档

- 更新 README、CHANGELOG、SECURITY_AUDIT、OPTIMIZATION_PLAN、TURNSTILE_SETUP、INTEGRATIONS、NOTIFICATIONS

## v2.15.0 (2026-07-17)

### 固定联系人

- **多联系方式**：每个联系人支持多个邮箱、手机、Telegram / QQ / WxPusher，带标签（如「工作」「妈妈」）
- 数据模型：`fixed_contacts.contact_methods` JSONB（迁移 **v30**），旧单字段自动迁入
- **快捷发信**：仅 1 个邮箱直接进入编辑；多个邮箱先进入二级界面手动勾选（默认不全选）
- **批量邮件 / 事件提醒**：选中联系人时自动合并其全部邮箱
- API：`POST/PUT /api/contacts` 支持 `emails`/`phones` 等数组；`recipientEmails` 可指定子集

### 近期待办

- **打勾完成**：`/todos` 与首页待办同步服务端 `todo_completions`（迁移 **v29**）
- **自动移出**：事件过期或离开提醒窗口后从当前列表隐藏
- **完成历史**：「完成历史」标签页查看已归档记录
- **定期清理**：`daily-maintenance` 删除 `occurrence_date` 超过 365 天的完成记录

### 日历

- 年 / 月 / 日视图切换；日期格子可点击；默认展示本月事件列表

### 安全加固

- **发信白名单**：`POST /api/contacts/:id/send-email` 的 `recipientEmails` 必须属于该联系人，修复开放邮件中继风险
- **API 密钥脱敏**：`GET/PUT/POST /api/config/accounts` 响应不返回明文 `token`/`secret`，以 `tokenConfigured` 等标志代替
- **HSTS**：应用层与 `vercel.json` 增加 `Strict-Transport-Security`
- **SMTP TLS**：587 端口 `requireTLS: true`
- **CORS**：禁止 `CORS_ORIGIN=*` 与 credentials 组合
- 快捷发信写入 `email_logs` 时附带 `user_id`

### 文档

- 更新 README、SECURITY_AUDIT、NOTIFICATIONS、OPTIONAL_FEATURES、OPTIMIZATION_PLAN
- 部署自检期望 schema 版本 **v30**

## v2.14.3 (2026-07-15)

### 修复
- **登录 Turnstile**：修复 `execute` 模式下验证回调使用陈旧闭包，导致用空用户名/密码提交并显示 `Invalid input`
- 改为页面加载时显示可见 Turnstile 组件；验证完成后可自动登录
- **Turnstile 显示**：去除卡片 `overflow-hidden` 与 motion 透明动画包裹；增加 `.turnstile-host` 底色边框；`appearance: always`；回调 ref 可靠挂载

## v2.14.2 (2026-07-15)

### 体验与文档
- **深浅色切换**：View Transitions API 圆形扩散动画（从点击位置向外过渡；尊重 `prefers-reduced-motion`）
- **深色模式对比度**：调高 muted 文字、边框与玻璃面板可读性
- 新增 [docs/OPTIONAL_FEATURES.md](docs/OPTIONAL_FEATURES.md)：平台 env、通知渠道、集成、Cron 均可选说明
- 通知渠道页与文档强调「按需绑定，不配置不影响核心功能」

## v2.14.1 (2026-07-15)

### 文档与可选集成
- 新增 [docs/GOOGLE_CALENDAR_OAUTH.md](docs/GOOGLE_CALENDAR_OAUTH.md)：Google OAuth 可选配置、Vercel 环境变量、Google Cloud 重定向 URI、schema v27
- 更新 VERCEL_DEPLOYMENT、FREE_TIER_DEPLOY、INTEGRATIONS、README：schema 期望版本 v27；Google OAuth 标明为可选
- 设置页：未配置 OAuth 时显示中性提示（不影响其他功能），链至集成文档
- 部署自检 `EXPECTED_SCHEMA_VERSION` 更新为 27

## v2.14.0 (2026-07-15)

### Phase 0 — 收件箱
- 完成 inbox 全链路：迁移 v23、路由、CSRF 豁免、通知成功写入收件箱、30 天清理、前端 Inbox 页与未读角标

### Phase 1 — 优化项 B1–B40
- 数据库连接池、pooler 检测、防重提醒、事件缓存增量刷新、prefetch、ICS ETag、批量 LIMIT 50、邮件合并、Turnstile、Webhook 幂等/限流、MASTER_KEY 轮换 API、CSP report-uri、Cron 监控、健康检查队列深度、stats_daily 聚合、测试与 i18n/PWA 等

### Phase 2 — 功能 C1–C40（排除 AI/多租户/分享/热力图/市场）
- CalDAV 同步、VALARM、多 feed token、条件规则、联系人分组、集成文档、出站 webhook、年报渠道成功率、Passkey 登录、加密备份、Cron 前端页、嵌入倒计时等

### Phase 3 — Serverless 适用性
- `serverless-suitability.ts` + `/api/features/serverless-check` 文档化需外部 cron 的功能

### 安全
- 安全审查修复：Webhook 载荷限制、HMAC 验证、审计日志、幂等键

## v2.13.0 (2026-07-15)

### 通知系统修复与完善

- **渠道测试 Validation failed**：`testConnectionSchema` 支持仅传 `accountId`；统一收件人回退逻辑
- **渠道状态显示**：不再对所有启用渠道假显示「已连接」；按已验证/未测试/失败/禁用分组
- **Resend 渠道**：恢复「收件人邮箱」字段；编辑表单通用回填；测试失败返回 HTTP 400 与明确错误信息
- **设置页**：「通知默认邮箱」可保存与清空；近 30 天「邮件记录」
- **测试发送**：`test-send` 写入 `event_trigger_logs`；渠道测试传递 `accountId` 并持久化 `last_test_result`
- **失败重试**：`notification_queue` 指数退避（5m→30m→2h→6h）；Cron `/api/cron/retry-notifications`

### 集成功能（Migration v22）

- **入站 Webhook**：`POST /api/webhook/receive/:token` 创建事件，可选 HMAC 签名
- **日历 ICS Feed**：`GET /api/calendar/feed/:token.ics` 供 Google/Outlook 订阅
- **外部 ICS 同步**：设置页配置 URL + Cron `/api/cron/calendar-sync`
- **冲突提示**：通知正文追加同日其他日程提示
- **事件缓存**：`event_reminder_cache` 表（PostgreSQL，非 Redis）
- **年度报告**：月度热力图与 `year` 查询参数

### 部署与自检

- **部署向导**：中文系统自检、数据库结构版本（v22）、区分平台 env 与渠道 API Key
- **Turnstile**：兼容 Vercel 中 `SecretKey` / `SiteKey` 命名
- **登录限流**：仅 `POST /login` 限流，避免全 `/api/auth/*` 误触 429

### 文档

- 新增 [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md)、[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)
- 更新 README、VERCEL_DEPLOYMENT、FREE_TIER_DEPLOY 中的 Cron 与 Resend 说明

## v2.12.0 (2026-07-15)

- **安全加固**：CSP 收紧、日志脱敏、导出脱敏、生产禁弱密钥回退、删除 Docker 遗留、环境变量仅 Production 文档（合并自 vercel v2.12.0）

## v2.11.0 (2026-07-15)

- **登录与部署保护**：密码登录默认、Turnstile、health 端点加固、Vercel 部署保护（合并自 vercel v2.11.0）

## v2.7.0 (2026-07-15)

### 云端通知渠道精简

- **移除不可用渠道**：微信个人号、WhatsApp、QQ Bot、Signal、iMessage、Zalo、Clawbot、Nostr 从前端 UI、API 路由和发送逻辑中完全移除
- **仅保留 HTTP 渠道**：Webhook / Token 类（飞书、钉钉、Telegram、邮件、Bark 等 30+ 渠道）
- **服务端校验**：创建/测试通知账户时拒绝不支持的渠道类型（`supported-channels.ts`）
- **前端清理**：移除「插件」Tab、扫码授权弹窗、浏览器 Web Push 设置项
- **Vercel 构建**：恢复真实 HTTP 通知发送，仅 stub 已移除的 IM 服务模块

### 安全

- 登录失败锁定与限流机制保持不变，**不提供运维解锁脚本或后门**
- 锁定按用户名跨 IP 生效，防止换 IP 暴力破解
- 登录 429 响应显示剩余锁定时间
- 移除 `scripts/clear-login-lock.ts`；认证接口限流收紧为 10 次/分钟

### 文档

- 更新 README、VERCEL_DEPLOYMENT、CHANNEL_COMPATIBILITY 等文档以反映云端可用渠道列表

## v2.6.0 (2026-05-31)

### 安全加固
- 移除硬编码默认密码和 MASTER_KEY，首次启动自动生成随机密码
- 密钥迁移机制（向后兼容旧密钥加密数据）
- CSRF 中间件加固 + 分层 Rate Limiting + 安全响应头
- 所有 API 端点添加 Zod 输入验证
- 删除 14 个开发测试脚本

### 稳定性
- ClawBot/OpenClaw 扫码登录修复
- 插件 Session 持久化到 SQLite
- 断连检测 + 自动重连 + 通知失败反馈和重试

### 通知渠道
- 43 个渠道依赖审计 + 兼容性矩阵
- 渠道绑定逻辑（只有已配置渠道可选）
- 重量级插件移至 optionalDependencies
- 通知降级策略 + ServerChan3 新 key 兼容

### 性能优化
- Docker 多阶段构建（镜像减小 30%+）
- pino 结构化日志

### 功能增强
- 新增 7 个事件类型专属通知模板和祝福语
- 渠道状态 API + 调度器状态 API

## v2.4.2 (2026-05-04)

### 新增功能

- **通知预览按事件类型分组**: 创建事件时，通知预览会根据选择的事件类型显示对应的模板，而不是显示所有模板
- **事件类型模板映射**: 每种事件类型（生日、考试、纪念日等）都有专属的模板列表

### 验证

- **定时邮件发送功能**: 已验证自动触发功能正常工作，邮件成功发送到用户邮箱
- **测试按钮功能**: 已验证测试按钮可以正常发送邮件

## v2.4.1 (2026-05-04)

### Bug 修复

- **[严重] Resend 发件人邮箱字段强制必填**: 将发件人邮箱字段改为可选，支持使用已验证域名的任意邮箱地址
- **[严重] Zod 验证失败**: 修复 webhook 字段验证规则，允许 URL 或邮箱地址格式
- **[一般] 调度器时间匹配**: 将调度器频率从每15分钟改为每分钟，更精准的提醒时间匹配
- **[一般] 事件创建后立即触发**: 事件创建和更新后立即检查是否需要发送提醒

### 优化

- **Resend 发件人邮箱**: 支持使用已验证域名的任意邮箱地址（如 noreply@email.the37777777.top）
- **默认值更新**: 留空时使用 Resend 测试地址 onboarding@resend.dev（仅能发送到自己的邮箱）
- **调度器触发机制**: 事件创建/更新后立即触发提醒检查，确保不会错过即将到来的提醒时间

## v2.4.0 (2026-05-04)

### 新增功能

- **通知模板预览**: 创建事件时可预览通知内容，支持 6 种预设模板
- **自定义事件模板**: 支持创建自定义模板（如驾照到期、保险续费），可在"其他"类型下选择
- **浏览器推送 UI**: 设置页面添加浏览器推送通知开关
- **日历导出按钮**: Dashboard 头部添加 ICS 导出按钮
- **重复事件选项**: EventForm 添加重复事件开关（每天/每周/每月/每年）
- **更多事件类型**: 新增会议、截止日期、旅行、毕业、婚礼、医疗等类型
- **关联人员优化**: 添加说明文字和提示信息
- **称呼转换规则**: 扩展到 40+ 常用称呼映射
- **CSRF 保护**: 添加 Origin/Referer 头部验证中间件
- **API 分页**: 事件列表支持 page 和 limit 查询参数
- **单元测试**: 添加核心功能测试（关系映射、模板、祝福语）

### Bug 修复

- **[严重] 设置页面白屏**: 添加 CalendarClock 导入修复
- **[严重] 提醒时间不生效**: 调度器支持 reminderTimes 数组（15分钟窗口匹配）
- **[严重] 自定义时间不生效**: 修复前端自定义时间保存逻辑
- **[严重] 倒计时显示错误**: 修复基于事件日期而非提醒时间计算倒计时
- **[严重] iMessage 渠道**: 改为 BlueBubbles 服务器配置
- **[一般] IRC 占位符**: 修正为正确的 IRC 桥接 URL 示例

### 优化

- **TypeScript 类型**: 添加 EventRow、UpdateEventData 接口替代 any 类型
- **Zod 验证**: 添加 config.schema.ts 验证通知账户配置
- **通知渠道字段**: 保持向后兼容，优化标签说明

## v2.3.0 (2026-05-04)

### 新增功能

- **自动生成密钥**: 首次启动自动生成随机 JWT_SECRET 和 MASTER_KEY，保存到 `data/.env`
- **更多示例事件**: 新增妈妈生日、结婚纪念日、女儿生日、驾照到期、中秋节等示例

### Bug 修复

- **[严重] 渠道测试按钮**: 修复 configMethod 字段名不匹配导致测试失败
- **[严重] 事件测试发送**: 修复 notification_channels JSON 解析问题
- **[严重] Resend 发件人**: 使用账户配置的发件人邮箱代替硬编码值
- **[严重] 时区偏移**: 修复 new Date() 解析 YYYY-MM-DD 为 UTC 导致的 8 小时偏移
- **[一般] IRC 占位符**: 修正为正确的 IRC 桥接 URL 示例

### 文档更新

- **README.md**: 更新环境变量说明，添加密钥管理说明
- **DEPLOYMENT.md**: 更新部署指南，说明自动生成密钥功能

## v2.2.0 (2026-05-02)

### Bug 修复

- **[致命] sql.js 防抖保存**: 写操作后不再立即全量导出数据库，改为 2 秒防抖，性能提升 10-50x
- **[致命] SIGTERM 信号处理**: 统一信号处理，避免双重 exit 导致数据丢失
- **[致命] 农历时区错误**: 使用 UTC 构造 Date 对象，避免跨时区日期偏移
- **[严重] 通知重试机制**: 发送失败自动重试 3 次（1s/2s/4s 指数退避）
- **[严重] COALESCE 修复**: 用户配置现在可以正确清空字段为 null
- **[严重] chat_id 加密**: 通知账户的 chat_id 字段现在也经过 AES 加密存储
- **[严重] bcrypt 异步化**: 密码哈希改用异步 API，不再阻塞事件循环
- **[严重] 通知超时**: 所有通知渠道 HTTP 调用添加 10 秒超时
- **[严重] 硬编码密钥检测**: 启动时检测默认 JWT_SECRET/MASTER_KEY 并输出警告
- **[一般] 提醒去重**: 同一事件同一天不会重复发送通知
- **[一般] reminder_time 检查**: 只在事件设定的提醒时间（小时）发送通知
- **[一般] 限流器内存泄漏**: 添加 store 大小上限 + timer.unref()
- **[一般] 登录锁定增强**: 添加基于用户名的全局锁定（防止不同 IP 绕过）
- **[一般] 密码强度统一**: 登录和修改密码统一要求最少 8 字符
- **[一般] 类型修复**: login_logs 删除使用 parseInt 转换 user.id

### 安全加固

- **非 root 容器运行**: Dockerfile 添加 `USER app`，容器以非 root 用户运行
- **密钥启动检测**: 启动时检测并警告默认密钥
- **CORS 可配置**: 支持 `CORS_ORIGIN` 环境变量

### 性能优化

- **sql.js 防抖保存**: 写操作后 2 秒防抖，避免频繁全量导出
- **bcrypt 异步**: 密码哈希不再阻塞事件循环
- **镜像优化**: pnpm 改用 corepack 安装，镜像体积减小

### 新增功能

- **请求 ID 追踪**: 每个请求自动生成唯一 ID（X-Request-ID）
- **结构化错误码**: 定义统一错误码体系
- **统计 API**: `GET /api/stats` 返回事件统计、通知成功率、渠道使用情况
- **备份 API**: `GET /api/backup/export` + `POST /api/backup/import`
- **CSV 导入**: `POST /api/events/import-csv` 批量导入事件
- **API Token 认证**: 支持 `X-API-Key` 头进行 API 认证
- **农历智能节日提醒**: 自动为用户创建春节、中秋等农历节日事件
- **数据库迁移版本控制**: 支持增量迁移，跟踪 schema 版本
- **通知队列表**: 新增 `notification_queue` 表，为未来持久化重试做准备

## v2.1.0 (2026-04)

- 新增 8 个通知渠道（ClawBot/Server酱/PushPlus/Bark/Gotify/喵推送/PushMe/企微应用）
- 邮箱多账号选择
- 登录锁定线性叠加
- Docker 依赖修复
- 零配置即开即用

## v2.0.0 (2026-04)

- 架构重构：PostgreSQL + Redis → SQLite 单容器
- 零配置即开即用
- 登录锁定 + 安全告警 + 登录日志
- 通知凭证 AES 加密
- 触发日志

## v1.1.1 (2026-04)

- 登录锁定、UI 优化

## v1.1.0 (2025-04)

- 提醒多选、农历修复

## v1.0.0 (2025-01)

- 初始版本

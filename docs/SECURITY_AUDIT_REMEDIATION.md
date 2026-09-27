# 安全修复复测补充说明

- 复测日期：2026-09-27
- 范围：修复获批的六项问题及独立复核确认的直接相关缺陷；该历史文件含无效 UTF-8 字节，本补充文件以可读编码记录处置结果，不覆盖原文件。

## 修复结果

1. **首次管理员初始化**：空用户表首次启动必须设置 `DEFAULT_ADMIN_PASSWORD`；用户名/密码还须符合登录 schema，不再使用内置回退，也不在日志中输出密码。Compose 模板与部署文档同步为必填项。
2. **SQLite 登录失败计数与本机回环地址**：改用 SQLite 可执行的 `COUNT(*)`，保留原筛选条件；IP 封禁计数同时豁免 IPv4、IPv6 与 IPv4-mapped IPv6 回环地址。
3. **Cookie 认证契约**：前端认证请求依赖 HttpOnly Cookie，不再读写 access/refresh token 的 Web Storage，也不发送 Bearer token；刷新响应不再把 access token 放进 JSON。
4. **日历 URL SSRF**：DNS 错误/空结果 fail-closed；拒绝 loopback、私有/共享地址空间、未指定、链路本地、文档/基准测试/组播/保留地址；IPv6 仅允许当前 IANA 分配表中的全局单播前缀，未分配的 `2000::/3` 地址也会拒绝，并只放行 special-purpose registry 明确标记为 globally reachable 的例外；并拦截标准/本地 NAT64 与 6to4 转换前缀。`safeAxiosGet` 将已校验地址固定到实际 HTTP(S) 连接，禁用自动代理和重定向，避免代理或二次 DNS 解析绕过校验。
5. **日历下载资源与替换逻辑**：日历 HTTP(S) 响应体限制为 10 MiB；`replace` 策略最多接受五个 feed、每个最多 100 个事件，超过上限时 fail-closed；先成功获取并完整解析全部源，再以数据库事务原子替换，DNS/HTTP/解析失败或写入错误不会先删掉旧导入数据；有效的空日历仍可清除导入项。CalDAV 只解析 2xx 响应，不把 3xx 响应体作为日历导入；配置 HTTP CalDAV 时拒绝发送 URL/Basic Auth 凭据，异常日志不序列化 Axios 请求配置或嵌套凭据。
6. **代理来源信任**：只有 `TRUSTED_PROXIES` 配置中的 peer 才能提供转发客户端 IP；否则采用 socket peer。客户端 IP 与限流共用同一解析器；全网段 `/0` 不会被接受为可信范围。
7. **HTTPS 默认策略**：生产环境默认拒绝全站明文 HTTP（健康检查 `/health` 除外）；只有 `ALLOW_INSECURE_HTTP=true` 才允许。仅可信代理的单值 `X-Forwarded-Proto` 可声明外部协议；逗号分隔的歧义值拒绝通过，Cookie `Secure` 属性据此设置。安全响应头、WebAuthn fallback、CORS/CSRF origin 比较及生成的日历/收件箱链接共用可信代理来源判定；显式 `WEBAUTHN_ORIGIN` 优先于请求中的 Origin/Referer。`CORS_ORIGIN` 拒绝所有含 `*` 的配置项，不再接受子域通配来源；LAN 仅在 scheme/host/port 完全一致时自动放行。
8. **独立复核补充**：拒绝带 URL userinfo 的明文 HTTP 外部日历请求并隐藏错误输出中的 URL 凭据；replace 模式要求日历根级 `VERSION`/`PRODID`、校验组件结构和时区 DTSTART/偏移格式与范围并拒绝未支持组件；VEVENT 必须包含唯一、可解析的 `SUMMARY` 和带单一 `VALUE=DATE` 的有效 date-only DTSTART，坏内容不会删除旧导入；CalDAV 复用相同 DTSTART parser；bulk sync 同时兼容 SQLite JSON 文本与 PostgreSQL 数组形状。可信代理 origin 的转发头消费点一致性与 IPv6 edge cases 均有回归测试。
16. **退役 PostgreSQL 启动路径**：停用旧版 `docker/start-local.sh` / `.bat` 并移除旧 PostgreSQL 初始管理员 SQL，避免 SQLite 版产品误走遗留初始化流程。独立人工运行的 `docker/seed-db.sql` 仍是未引用的旧文件，本轮未检查或修改其内容。
17. **刷新会话状态**：JWT 明确区分 access/refresh；refresh 带唯一 ID，只能通过 sessions 表中的 compare-and-swap 更新一次，复用的旧 refresh token 会被拒绝；新增迁移持久化当前 refresh ID。SQLite ISO 时间戳改用 `julianday()` 比较，避免同日过期时间因 `T`/空格字典序差异被当作有效。

## 验证

- 后端套件：23 个测试文件、148 个测试通过；另有 SQLite 实测覆盖同日已过期 session 的读取拒绝与 refresh rotation 拒绝。
- 前端认证回归：2 个测试文件、4 个测试通过。
- 全量前端套件：27 个通过、6 个既有失败；错误涉及 EventCard、LoginForm、Dashboard/UI 基线，本次未修改这些范围外失败。
- shared 套件：9 个通过、1 个既有失败，本次未修改。
- `pnpm run build`：退出码 0。Vite 报告 Browserslist 数据较旧和 bundle 超过 500 kB 的既有警告。
- 7 个 Docker Compose 模板均在显式提供临时测试值时解析成功，并在隔离空 env 文件且未设置密码时全部拒绝配置。
- 真实应用装配回归确认 production HTTP 的 `/` 在静态文件处理前被拒绝，`/health` 仍可用于容器健康检查。
- 独立复核新增的 DNS rebinding、NAT64/IPv6 分配前缀与 special-purpose reachability exceptions、响应大小、replace 事务/源及事件上限、CalDAV 状态/凭据/日志/日期解析、外部日历 URL userinfo、ICS envelope/组件/时区值/重复 DTSTART/date-only DTSTART、WEBAUTHN_ORIGIN 优先级、转发头一致性、CORS wildcard、初始管理员 schema 和 refresh token 类型/轮换均有针对性测试；本轮按用户最新指示不再安排独立复核。

安全 HTTP 请求有意不使用 `HTTP_PROXY`/`HTTPS_PROXY` 环境代理，因为代理端的二次解析会绕过 DNS 固定；需要强制出站代理的部署需另行设计可验证目标地址的代理方案。

当前阻断标准 well-known 与 local-use NAT64 前缀及 6to4 前缀；若部署网络使用运营商/组织自定义的 DNS64/NAT64 前缀，还需以出站防火墙限制可达网段或增加明确的前缀策略。

通用通知 webhook 与渠道连接测试仍是单独的用户配置出站路径，没有复用日历 GET 的地址 pinning 策略；本次范围不改变这些集成对自托管/内网服务的兼容性，不能据此声称所有出站 URL 均已获得统一 SSRF 防护。应另行定义通知集成的 egress 策略。配置反向代理时，应覆盖（而非追加）`X-Forwarded-Proto`、`X-Forwarded-Host`，且仅配置实际代理 peer 为可信代理。

## 暂缓项

ClawBot 会话跨账户绑定按当前单账户产品边界暂缓；若产品恢复多账户，需单独复审会话归属与对象级授权。

- 外部日历订阅 URL 仍以 JSON 文本保存在数据库中；若 URL 本身携带凭据/访问 token，数据库或备份泄露会暴露它们。静态加密和密钥迁移另开任务，本轮不声称已解决。
- ICS 导入及 CalDAV 对 `parseIcsEvents` 的使用仍未统一执行根级 `VCALENDAR` envelope 与组件嵌套校验。共享解析器统一另开任务，本轮不声称已解决。

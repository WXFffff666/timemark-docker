# TimeMark 安全审查修复计划

- 计划时间：2026-09-26 21:50（本地时间）
- 工作区：`C:/Users/bingo/项目/Coding/Project/WXF/timemark-docker`
- 状态：实施已完成；上一轮独立复核后按用户确认做最小修复（安全请求日志、精确 CORS、日历配置读写/上限）；本轮独立只读复核待执行。外部日历 URL 静态加密与 ICS 根 envelope/组件 nesting 校验明确另开任务。

## Goal
用测试先行修复审查确认的六项可利用问题，同时保留项目现有的单账户产品边界，并把部署配置改成默认 fail-closed。

## 当前上下文 / 假设

- 项目是 pnpm workspace，Node.js >=22；后端使用 Hono、`@hono/node-server` 与 sql.js，前端使用 React/Vitest。根构建命令是 `pnpm run build`，后端测试命令是 `pnpm --filter backend test`。
- 已确认的修复范围：首次管理员密码回退、登录 IP 封禁 SQL、前后端 Cookie/token 契约、日历 URL 的 IPv6 loopback SSRF、客户端 IP 转发头伪造、生产 HTTP/HTTPS 判定。ClawBot 会话跨账户问题暂不改：`docs/SECURITY_AUDIT.md` 将产品边界写为单账户，跨账户授权边界目前不存在；如恢复多用户，必须另开任务做会话归属和迁移。
- 用户已确认的决策：空数据库首次创建管理员时，所有运行模式都必须设置 `DEFAULT_ADMIN_PASSWORD`，不保留任何内置回退；HTTPS 是默认要求，局域网明文 HTTP 只能显式设置 `ALLOW_INSECURE_HTTP=true`；只有来自 `TRUSTED_PROXIES` 配置范围的代理才可信；认证沿用后端 HttpOnly Cookie，不把 token 暴露给前端存储或作为 Bearer token 使用。
- 上轮已有基线：`pnpm run build` 和 `pnpm --filter backend test` 通过；shared 有 1 项、frontend 有 6 项既有失败。用户确认不把这些无关失败纳入本修复范围。开始实施时需重跑并记录基线，避免把旧失败当作本次回归。
- 提交点仅为实施建议；当前工作区未提交，遵守未明确要求时不提交的约束。

## 架构 / 建议方案
把认证状态统一为后端 HttpOnly Cookie；用共享的请求安全解析器统一决定客户端 IP 与代理 HTTPS 元数据，只接受显式信任网段内代理提供的头。初始化管理员、SQL 兼容性和 IPv6 URL 判定各用最小可测的回归测试锁定行为；部署模板和文档同步 fail-closed 默认值，不新增第三方依赖。

## 分步任务

### 0. 建立实施基线（只读，约 2 分钟）

在仓库根目录运行：

```bash
git status --short --branch
pnpm --filter backend test
pnpm run build
pnpm --filter shared test
pnpm --filter frontend run test --run
```

预期：工作区初始干净；后端测试和 build 通过。shared/frontend 可能重现已知的 1/6 个失败；记录完整失败名称和退出码，不为本次修复顺手改无关 UI 测试。若基线与上述不同，先更新计划或测试预期，再开始改代码。

### 1. 管理员初始化先加回归测试（约 3 分钟，TDD RED）

新增 `backend/src/test/bootstrap-admin.test.ts`，测试一个纯函数 `resolveInitialAdminCredentials(env)`：

- 没有 `DEFAULT_ADMIN_PASSWORD` 时抛出包含变量名的错误。
- 有密码时返回配置的用户名（缺省仍为 `admin`）和原密码；测试值只能用 `unit-test-only-password` 这类假值。
- 命令：

```bash
pnpm --filter backend test -- src/test/bootstrap-admin.test.ts
```

预期 RED：新断言因缺少密码校验而失败；若首先是导入/类型错误，只修测试接缝并重跑，直到失败原因是缺少该行为，而不是语法或导入错误。

### 2. 管理员首次启动 fail-closed（约 4 分钟，TDD GREEN）

新增 `backend/src/utils/initial-admin.ts` 实现上述纯函数，并在 `backend/src/index.ts:60-73` 仅于用户表为空时调用它；没有密码就让 `bootstrap()` 失败退出，不插入用户。删除硬编码回退及包含明文密码的 `console.log`，日志最多报告用户名或初始化成功，不输出密码。

运行：

```bash
pnpm --filter backend test -- src/test/bootstrap-admin.test.ts
pnpm --filter backend test
```

预期 GREEN：新测试通过；后端既有测试不新增失败。提交建议：`fix(auth): require an explicit initial admin password`。

### 3. Compose 和部署文档同步必填密码与 HTTP 默认值（约 4 分钟）

逐一更新以下部署模板，移除公开默认账号密码注释，并在 `app` / `timemark-app` 服务的 `environment` 中要求密码：

- `docker-compose.yml`
- `docker-compose.public.yml`
- `docker-compose.nas.yml`
- `docker-compose.full.yml`
- `docker-compose.ghcr.yml`
- `docker-compose.simple.yml`
- `docker-compose.dockerhub.yml`

使用 Compose 必填插值；可复制到每个服务的完整 YAML 项：

```yaml
      DEFAULT_ADMIN_PASSWORD: ${DEFAULT_ADMIN_PASSWORD:?Set a unique DEFAULT_ADMIN_PASSWORD in your .env file}
      ALLOW_INSECURE_HTTP: ${ALLOW_INSECURE_HTTP:-false}
```

同时更新 `README.md`、`DEPLOYMENT.md`、`PROJECT_DOC.md` 与安全审计文档：说明首次空库必须配置唯一强密码、不要把密码写入版本库；生产默认 HTTPS；仅受信任的局域网部署显式设 `ALLOW_INSECURE_HTTP=true`，绝不可用于公网；反向代理部署必须填写 `TRUSTED_PROXIES` 网段并由代理覆盖转发头。将 `DEFAULT_ADMIN_PASSWORD` 的旧默认值、快速体验文件中的默认口令和“可选设置”描述全部删改。若历史安全审计文件编码异常，保留原文并新增可读的修复补充说明，不要重写损坏内容。

验证命令（`docker compose config` 不启动服务；把示例值换成本机一次性测试值。带密码的有效配置可用 `--quiet`；验证缺失必填变量时使用非 quiet 的 `config`）：

```bash
DEFAULT_ADMIN_PASSWORD='unit-test-only-password' docker compose -f docker-compose.public.yml config --quiet
```

预期：退出码 0。再取消该环境变量运行 `docker compose -f docker-compose.public.yml config`，预期 Compose 明确报必填变量缺失、退出码非 0。完成后提交建议：`docs(deploy): require explicit admin bootstrap password`。

### 4. 修复 SQLite 登录 IP 封禁查询（约 3 分钟，TDD）

新增 `backend/src/test/auth-ip-block.test.ts`：通过 `evaluateIpBlock()` 的 mock `query` 把实际收到的 SQL 执行到新建的 sql.js SQLite 数据库；准备 `login_logs` 表，断言 0 条失败记录时函数正常返回且不封禁。不要只断言 SQL 字符串不含某个 token。

RED 命令：

```bash
pnpm --filter backend test -- src/test/auth-ip-block.test.ts
```

预期 RED：SQLite 报 `unrecognized token: ":"`，对应现有 `backend/src/services/auth.service.ts:285-291` 的 `COUNT(*)::int`。

将查询改为 SQLite 可执行的 `COUNT(*) AS count`（保持现有时间筛选和参数化条件），重跑同一命令及 `pnpm --filter backend test`。

预期 GREEN：针对性测试和后端套件通过，错误登录不再因计数查询变成 500。提交：`fix(auth): use SQLite-compatible IP failure count`。

### 5. 把认证前端改为 Cookie-only（约 4 分钟，TDD）

先新增两组行为测试：

- `frontend/src/stores/auth.store.test.ts`：mock 后端现有登录响应（`user`、`sessionId`、`authMode: 'cookie'`，不含 JSON token），断言 store 成功设置用户/认证状态，且不把 `undefined` 或 token 写入 `localStorage` / `sessionStorage`。
- `frontend/src/lib/api.test.ts`：mock `fetch`，断言认证请求带 `credentials: 'same-origin'`，refresh 请求不提交 `refreshToken: "undefined"` 或读取客户端 token。

RED 命令：

```bash
pnpm --filter frontend run test --run src/stores/auth.store.test.ts src/lib/api.test.ts
```

预期 RED：当前 store/API 在缺 token 响应下未建立一致认证状态，或构造了 token/Bearer 依赖；失败必须对应上述断言。

最小实现：修改 `frontend/src/stores/auth.store.ts` 和 `frontend/src/lib/api.ts`，删除 access/refresh token 的本地持久化与 Bearer 注入，使用同源 Cookie 请求；在 `backend/src/routes/auth.ts:340` 不再把 access token 放入 refresh JSON，只由 `setAccessCookie` / `setRefreshCookie` 更新 HttpOnly Cookie。保留 `/auth/refresh` 的 Cookie 读取回退，不改变 session 校验。

GREEN 与回归：

```bash
pnpm --filter frontend run test --run src/stores/auth.store.test.ts src/lib/api.test.ts
pnpm --filter backend test
pnpm run build
```

预期：新增认证测试通过；build 和后端测试通过。提交：`fix(auth): keep session tokens in HttpOnly cookies`。

### 6. 修复外部日历 IPv6 SSRF（约 3 分钟，TDD）

新增 `backend/src/test/url-safety.test.ts`，覆盖 `http://[::1]:3000/`、IPv4-mapped loopback、IPv6 unspecified、ULA、link-local 均拒绝；普通公网域名的既有行为不回归。测试只调用 URL 校验函数，不访问真实内网。

RED：

```bash
pnpm --filter backend test -- src/test/url-safety.test.ts
```

预期 RED：`http://[::1]:3000/` 当前被判为安全。

在 `backend/src/utils/url-safety.ts` 用 `node:net` 的 IP 类型识别和明确的 IPv4/IPv6 特殊网段判定处理 URL 字面量及 DNS 返回的每个地址；先规范化 URL hostname 的方括号，拒绝 loopback、未指定、私有/ULA、链路本地及映射到非公网 IPv4 的地址。保留现有协议限制及日历抓取的手动重定向拒绝逻辑。

GREEN：

```bash
pnpm --filter backend test -- src/test/url-safety.test.ts
pnpm --filter backend test
```

预期：新增地址分类用例通过，后端套件无新增失败。提交：`fix(security): reject IPv6 private calendar URLs`。

### 7. 统一并信任边界化客户端 IP（约 4 分钟，TDD）

新增 `backend/src/test/client-ip.test.ts`，先把解析逻辑设计成可单测的纯函数，输入 peer 地址、请求头和可信 CIDR 配置，至少覆盖：

1. peer 不可信时伪造 `X-Forwarded-For`、`X-Real-IP`、`CF-Connecting-IP` 均被忽略，结果是 socket peer；
2. peer 落在 `TRUSTED_PROXIES` 时才解析转发链，并从右侧跳过可信代理，选出第一个非可信客户端地址；
3. 无效 IP / CIDR 不会被当成可信代理。

RED 命令：

```bash
pnpm --filter backend test -- src/test/client-ip.test.ts
```

预期 RED：当前代码会采信任意请求头。

修改 `backend/src/utils/client-ip.ts`，从 Hono Node adapter 的 `incoming.socket.remoteAddress` 取得对端 IP（adapter 的 conninfo 实现使用 `c.env.server` 或 `c.env` 下的 `incoming.socket`）；新增逗号分隔 `TRUSTED_PROXIES` CIDR 配置，使用 Node `node:net` 的 `BlockList` 做地址/网段匹配。只在 peer 命中可信网段时接受代理头。修改 `backend/src/middleware/rate-limit.ts`，改为复用同一解析结果，不再另行按头取 IP；登录日志、IP 白名单和 rate limit 必须看到同一个解析 IP。Compose 默认不声明可信网段，文档说明需显式配置。

GREEN 与验证：

```bash
pnpm --filter backend test -- src/test/client-ip.test.ts
pnpm --filter backend test
pnpm run build
```

预期：信任边界测试、后端套件和 build 通过。提交：`fix(security): trust forwarded IPs only from configured proxies`。

### 8. HTTPS 检查与 Cookie Secure 属性使用同一可信来源（约 4 分钟，TDD）

新增 `backend/src/test/https-enforcement.test.ts`，通过 Hono `app.request()` 覆盖：

- production 直连 HTTP、缺少 `X-Forwarded-Proto` → 403；
- 不可信 peer 伪造 `X-Forwarded-Proto: https` → 仍按 HTTP 拒绝；
- 可信代理 peer 且 `X-Forwarded-Proto: https` → 放行；
- `ALLOW_INSECURE_HTTP=true` → HTTP 放行（仅显式 opt-in）；
- auth cookie 在可信 HTTPS 路径带 `Secure`，明文 HTTP 不带该属性。

RED 命令：

```bash
pnpm --filter backend test -- src/test/https-enforcement.test.ts
```

预期 RED：当前生产中缺少转发头的直连 HTTP 被放行，且 HTTPS header 的来源不受信任边界保护。

修改 `backend/src/middleware/https-enforcement.ts` 与 `backend/src/utils/auth-cookies.ts`，共用任务 7 的可信 peer/代理协议解析；只有可信代理提供的 `X-Forwarded-Proto` 可证明外部 TLS，直连按实际请求协议判定。生产默认拒绝 HTTP；只在环境变量精确为字符串 `true` 时启用明文例外。Cookie `Secure` 与中间件采用同一个协议判定，不能各自解析头。

GREEN 与验证：

```bash
pnpm --filter backend test -- src/test/https-enforcement.test.ts
pnpm --filter backend test
pnpm run build
```

预期：协议测试、后端测试及 build 通过。提交：`fix(security): enforce HTTPS unless insecure HTTP is explicit`。

### 9. 最终验收（约 3 分钟）

从干净的实施工作区运行：

```bash
pnpm --filter backend test
pnpm --filter frontend run test --run src/stores/auth.store.test.ts src/lib/api.test.ts
pnpm run build
DEFAULT_ADMIN_PASSWORD='unit-test-only-password' docker compose -f docker-compose.public.yml config --quiet
```

预期：全部针对性安全回归测试通过；后端套件、构建、Compose 配置通过。shared/frontend 的既有无关失败按任务 0 的基线报告，不在本次中修复。用 `git status --short` 和 `git -c core.whitespace=cr-at-eol diff --check` 检查 Windows CRLF 工作区；实施阶段 review diff，禁止把真实密码写入文档、Compose 默认值、测试日志或提交。

## 测试 / 验证汇总

| 范围 | 命令 | 通过标准 |
|---|---|---|
| 后端单测 | `pnpm --filter backend test` | 全部既有后端测试和新增回归测试通过 |
| 前端认证用例 | `pnpm --filter frontend run test --run src/stores/auth.store.test.ts src/lib/api.test.ts` | Cookie-only 登录和 refresh 测试通过 |
| TypeScript/前端/后端构建 | `pnpm run build` | 退出码 0 |
| 部署模板 | 提供临时密码时运行 `docker compose -f docker-compose.public.yml config --quiet`；unset 密码时运行非 quiet `config` | 有密码时配置有效；无密码时必填变量错误 |
| SSRF | `pnpm --filter backend test -- src/test/url-safety.test.ts src/test/safe-http.test.ts` | DNS 错误/空结果、非全局与特殊用途 IP 拒绝；实际请求固定至已验证地址且响应体不超过 10 MiB |
| 日历替换/CalDAV | `pnpm --filter backend test -- src/test/calendar-sync.test.ts src/test/caldav-sync.test.ts` | replace 在源全部成功后事务性替换；失败保留旧数据；只解析 2xx |
| 代理/HTTPS | `pnpm --filter backend test -- src/test/client-ip.test.ts src/test/https-enforcement.test.ts` | 不可信头被忽略，可信 TLS 代理可访问 |

## 执行记录（2026-09-27）

- 已完成六项获批修复及独立复核发现的直接相关问题，包括 DNS rebinding、NAT64/特殊用途 IP、日历替换 fail-closed、可信代理 origin 一致性、外部日历 HTTP userinfo 凭据防护、ICS 结构/日期校验、HTTPS 全站 enforcement、拒绝 CORS wildcard、CalDAV 异常日志脱敏、初始管理员 schema 校验、refresh token 类型区分与单次轮换。ClawBot 跨账户会话绑定仍按单账户边界暂缓。
- `pnpm --filter backend test`：22 个测试文件、137 个测试通过。
- `pnpm --filter frontend exec vitest run src/lib/api.test.ts src/stores/auth.store.test.ts`：2 个测试文件、4 个测试通过。
- `pnpm run build`：通过。Vite 仍报告 Browserslist 数据较旧和单个 bundle 超过 500 kB 的既有警告。
- 全量前端测试：27 通过、6 失败，与实施前确认的 6 项既有失败数量一致；shared 测试：9 通过、1 项既有失败。均未在本次范围内修改。另有全站 HTTP 实际 app 装配回归、refresh token rotation 与同日过期 SQLite 时间比较回归。
- 七个 Compose 模板在提供临时测试值时均可解析；使用隔离空 env 文件且未设置密码时，七个模板全部按预期因必填变量缺失而退出。
- Windows CRLF 工作区检查：`git -c core.whitespace=cr-at-eol diff --check` 通过。`docs/SECURITY_AUDIT.md` 因无效 UTF-8 未覆盖；新增 `docs/SECURITY_AUDIT_REMEDIATION.md` 并从 README 链接。
- 独立代码复核发现的 DNS rebinding、IPv6 地址分类、响应上限、replace 原子性、CalDAV 状态码/凭据/日志/日期解析、外部日历 URL userinfo、ICS 结构/时区/DTSTART、WEBAUTHN_ORIGIN 优先级、转发协议歧义、bulk-sync 兼容、HTTPS 静态页面、CORS wildcard、初始管理员 schema、feed 上限及 JWT 类型/refresh replay 问题，均已按适用范围修复并加回归测试。IPv6 SSRF 检查只允许 IANA 分配的全局单播前缀及 registry 标明 globally reachable 的例外。旧 PostgreSQL 启动脚本已退役，`docker/init-db.sql` 已删除；独立手动 seed 文件仍作为未引用旧文件待后续处置。最终独立复核待完成，未创建提交。

- 2026-09-27 第二轮独立复核发现安全请求日志含 token path、CORS 子域通配和日历配置读写/来源上限问题。按用户确认仅做最小必要修复：改为只记录 method/status/duration，CORS allowlist 拒绝 wildcard，SQLite JSON 文本按数组解析、损坏 token 列表拒绝覆盖，来源超过五个返回 400。后端全套 23 个测试文件/143 个测试通过，`pnpm run build`、backend TypeScript 检查与 CRLF-aware `git diff --check` 均通过；本轮独立只读复核待执行，未提交。

## 风险、取舍与未决事项

- fail-closed 密码要求会改变无 `.env` 的首次 Docker 启动步骤；应在 README、NAS 和快速体验说明中明确生成/输入密码的方法，不可用固定示例密码代替。
- `ALLOW_INSECURE_HTTP=true` 会有意关闭传输加密，只用于隔离局域网；生产 Compose 默认必须保持 `false`。不能仅凭 `NODE_ENV` 把 HTTP 自动放行。
- `TRUSTED_PROXIES` 是运维配置边界；错配可能使代理用户全部显示为代理 IP，或导致反代 TLS 请求被拒。默认空列表必须安全，文档需指导配置实际容器/网关 peer CIDR，禁止信任 `0.0.0.0/0` 或 `::/0`。
- IPv6 SSRF allowlist 镜像当前 IANA global-unicast allocation table，并只在 IANA special-purpose registry 明确标记为 globally reachable 时放行特殊用途例外；`2001::/23` 其余 IETF protocol assignment 地址保守拒绝。后续新分配/登记的 IPv6 前缀须同步更新列表，否则会按 fail-closed 规则被拒绝。IP 特殊地址分类仍受运营商自定义 NAT64 网络专用前缀影响；使用自定义 DNS64/NAT64 的部署还应通过出站防火墙限制可达网段，或另行配置自定义 NAT64 前缀策略。
- 通用通知 webhook 与渠道连接测试是单独的用户配置出站路径，未复用日历 GET 的 DNS pinning；本次不改变其自托管/内网集成兼容性，不能将本修复描述为全站统一 egress/SSRF 防护。
- Cookie-only 修复要求前后端同源/正确反向代理 Cookie 设置；若实际部署存在跨站前端域名，需要另行确认 `SameSite`、`Secure` 和 CORS 配置，不能为修复 token 缺失而退回 localStorage token。
- ClawBot 会话归属迁移和既有 shared/frontend 失败明确不在本次范围。任何恢复多用户的变更都必须先重新打开对象级授权审查。
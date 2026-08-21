# Cloudflare Turnstile 登录人机验证

为 TimeMark 登录页启用 Turnstile，减轻暴力破解与机器人登录。

## 一、在 Cloudflare 创建 Widget（约 3 分钟）

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) 并登录（免费账号即可，**不必**把域名接入 Cloudflare CDN）。
2. 左侧进入 **Turnstile**（找不到可在顶栏搜索 “Turnstile”）。
3. 点击 **Add widget** / **添加小组件**。
4. 填写：
   - **Widget name**：`TimeMark Login`
   - **Hostname**：添加 `timemark.the37777777.top`（建议再加 `the37777777.top` 以防跳转）
   - **Widget mode**：选 **Managed**（推荐，多数用户无感通过）
5. 点击 **Create**。
6. 复制页面上两个值（只显示一次 Secret，务必保存）：
   - **Site Key** → 对应 `TURNSTILE_SITE_KEY`
   - **Secret Key** → 对应 `TURNSTILE_SECRET_KEY`

> Secret Key 仅用于服务端，不要写进前端代码或提交到 Git。

## 二、写入 Vercel 并部署

在项目根目录执行（按提示粘贴两个 Key）：

```powershell
cd D:\Works_Cursor\timemark-vercel
.\scripts\setup-turnstile.ps1
```

或手动在 **Vercel → timemark-vercel → Settings → Environment Variables → Production** 添加（**仅勾选 Production，勿勾选 Preview**）：

| 变量名 | 值 |
|--------|-----|
| `TURNSTILE_SITE_KEY` | Cloudflare 的 Site Key（勿写成 `SiteKey`） |
| `TURNSTILE_SECRET_KEY` | Cloudflare 的 Secret Key（勿写成 `SecretKey`） |

> `TURNSTILE_SECRET_KEY` 与 `JWT_SECRET` / `MASTER_KEY` / `CRON_SECRET` 一样，**仅 Production**。Preview 部署受 Vercel Standard Protection 保护，不应携带生产密钥。

保存后 **Redeploy** 一次生产部署。

## 三、验证是否生效

1. 打开 `https://timemark.the37777777.top/api/health`，`checks.turnstile` 应为 `true`。
2. 打开登录页，密码框下方应出现 **可见的** Turnstile 验证框（Managed 模式下多数为勾选即过）。
3. 须先完成人机验证，再点击「登录」；验证通过后会自动尝试登录（若您已先点过登录）。

## 登录流程说明

### 密码登录

1. 输入用户名、密码
2. 在下方 Turnstile 组件完成验证（出现绿色勾）
3. 点击「登录」

### Passkey 登录

1. 点击「使用 Passkey 登录」
2. 须先完成 Turnstile 人机验证（与密码登录相同）
3. 浏览器弹出生物识别 / 安全密钥确认

若提示「请先完成下方人机验证」，说明尚未勾选 Turnstile；完成后再点登录即可。

## 本地开发（可选）

Turnstile 提供测试密钥（任意域名可用，**不要用于生产**）：

```
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

写入本地 `.env` 或 `vercel env pull` 后的 `.env.local` 即可。

## 故障排查

| 现象 | 处理 |
|------|------|
| 登录页无 Turnstile 组件 | 检查 `TURNSTILE_SITE_KEY` 是否已设且已 Redeploy |
| 提示「请求参数无效」 | 多为旧版前端缓存；强制刷新（Ctrl+F5）或清除站点缓存后重试 |
| 验证成功仍无法登录 | 确认用户名密码正确；Turnstile token 一次性，失败后需重新勾选 |
| health 里 turnstile 仍为 false | 仅设置了 Site Key 未设 Secret Key；Secret 决定 `enabled` |

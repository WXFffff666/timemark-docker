# TimeMark Docker 部署指南

<div align="center">

<h3>🎂 智能事件提醒系统 | 35+ 通知渠道 | 农历转换 | 关系映射</h3>

<p>本文档提供 TimeMark v2.4.2 的完整部署指南，涵盖各类 NAS 平台、公网服务器及本地环境。</p>

</div>

---

## 📋 目录

- [v2.4.2 新版特性](#-v242-新版特性)
- [部署前准备](#-部署前准备)
- [镜像拉取方式](#-镜像拉取方式)
- [快速部署](#-快速部署)
- [平台部署指南](#-平台部署指南)
  - [飞牛OS](#飞牛os-部署)
  - [群晖NAS](#群晖nas-部署)
  - [威联通NAS](#威联通nas-部署)
  - [铁威马NAS](#铁威马nas-部署)
  - [Docker Desktop (Windows/Mac)](#docker-desktop-windowsmac-部署)
  - [公网服务器](#公网服务器部署)
- [环境变量说明](#️-环境变量说明)
- [常用配置](#-常用配置)
- [首次登录](#-首次登录)
- [数据备份与恢复](#-数据备份与恢复)
- [从 v1.x 升级](#-从-v1x-升级)
- [资源优化](#-资源优化低功耗设备)
- [常见问题](#-常见问题)
- [支持](#-支持)

---

## 🚀 v2.4.2 新版特性

| 特性 | 说明 |
|------|------|
| **单容器部署** | 只需一个镜像，无需 PostgreSQL + Redis |
| **内置数据库** | SQLite (sql.js) 自动初始化，开箱即用 |
| **更轻量** | 内存占用从 ~800MB 降至 ~256MB |
| **安全加固** | 登录锁定 + 安全告警 + 登录日志 + JWT + 限流 + CSRF + XSS 防护 |
| **凭证加密** | 通知渠道 API Key/Token 使用 AES-256 加密存储 |
| **多账户通知** | 同一渠道可配置多个账户，支持多邮箱 |
| **零配置部署** | 所有环境变量内置默认值，`docker compose up -d` 即开即用 |
| **35+ 通知渠道** | 新增 ClawBot/Server酱/PushPlus/Bark/Gotify/喵推送/PushMe/企微应用 共 8 个渠道 |
| **通知模板预览** | 6 种预设模板按事件类型分组，支持自定义模板 |
| **重复事件** | 支持每天/每周/每月/每年重复，自动创建下次事件 |
| **ICS 日历导出** | Dashboard 一键导出 ICS 文件，支持 Google/Apple 日历 |
| **更多事件类型** | 新增会议、截止日期、旅行、毕业、婚礼、医疗等 11 种类型 |
| **调度器优化** | 每分钟检查提醒，更精准的时间匹配 |
| **CSRF 保护** | 添加 Origin/Referer 头部验证中间件 |

---

## 📦 部署前准备

### 系统要求

| 项目 | 最低配置 | 推荐配置 |
|:----:|:--------:|:--------:|
| CPU | 1 核 | 2 核 |
| 内存 | 256MB | 512MB |
| 磁盘 | 1GB | 5GB |
| Docker | 20.10+ | 24.0+ |

### 密钥管理：自动生成（开箱即用）

系统首次启动时会**自动生成随机密钥**并保存到 `data/.env` 文件，无需手动配置：

| 项目 | 说明 |
|------|------|
| 默认管理员 | `admin` / `TimeMark@2026`，首次登录后请修改密码 |
| JWT_SECRET | 首次启动自动生成，保存在 `data/.env` |
| MASTER_KEY | 首次启动自动生成，保存在 `data/.env` |

> 🔐 **密钥管理说明**：
> - 首次启动时，系统会自动生成随机的 `JWT_SECRET` 和 `MASTER_KEY`
> - 生成的密钥会保存到 `data/.env` 文件中，后续启动会自动读取
> - 如需自定义密钥，可直接设置环境变量或修改 `data/.env` 文件
> - ⚠️ 更换 `MASTER_KEY` 后，已加密的通知渠道凭证需要重新配置

### 配置文件总览

| 配置文件 | 适用场景 | 镜像源 | 特点 |
|----------|:--------:|:------:|------|
| `docker-compose.dockerhub.yml` | 通用部署 | Docker Hub | 即拉即用，无需认证，**推荐** |
| `docker-compose.simple.yml` | 飞牛OS / NAS | Docker Hub | 最简配置 |
| `docker-compose.nas.yml` | 群晖/威联通/铁威马 | Docker Hub | NAS 专用，自定义存储路径 |
| `docker-compose.full.yml` | 公网服务器 | Docker Hub | 生产配置，含资源限制 |
| `docker-compose.ghcr.yml` | 通用部署 | GHCR | 需要 GitHub 登录，备用 |
| `docker-compose.public.yml` | 快速测试 | Docker Hub | 测试用途 |

---

## 🐳 镜像拉取方式

TimeMark 镜像托管在 **两个** 平台：

### Docker Hub（推荐）

```bash
# 无需登录，直接拉取
docker pull xfffff666/timemark:latest
```

对应配置文件：`docker-compose.dockerhub.yml`

### GitHub Container Registry (GHCR)

```bash
# 需要 GitHub 账号登录
docker login ghcr.io -u 你的GitHub用户名 -p 你的GitHubToken

# 拉取镜像
docker pull ghcr.io/wfffff666/timemark:latest
```

对应配置文件：`docker-compose.ghcr.yml`

> 💡 GHCR 拉取可能受网络限制，**推荐使用 Docker Hub**。

---

## ⚡ 快速部署

### 方式一：命令行一键部署

```bash
# 1. 创建部署目录
mkdir timemark && cd timemark

# 2. 下载配置文件（Docker Hub 源，推荐）
curl -sSL https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.dockerhub.yml -o docker-compose.yml

# 3. 可选：自定义密钥（公网部署建议配置）
# echo "JWT_SECRET: $(openssl rand -hex 32)"
# echo "MASTER_KEY: $(openssl rand -hex 32)"
# vim docker-compose.yml

# 4. 启动服务（无需修改任何配置，即开即用！）
docker compose up -d

# 5. 查看日志确认启动成功
docker compose logs -f
```

> ✅ **即开即用**：无需配置密钥，默认账号 `admin` / `TimeMark@2026`

### 方式二：复制粘贴部署

将以下内容保存为 `docker-compose.yml`：

```yaml
services:
  app:
    image: xfffff666/timemark:latest
    container_name: timemark-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # 数据库路径
      DB_PATH: /app/data/timemark.db
      # 时区
      TZ: Asia/Shanghai
      # 运行环境
      NODE_ENV: production
      # 默认管理员（可选，可自定义或登录后修改密码）
      DEFAULT_ADMIN_USERNAME: admin
      # DEFAULT_ADMIN_PASSWORD: TimeMark@2026  # 可选：自定义密码
      # JWT 密钥（可选：公网部署建议自定义）
      # JWT_SECRET: <自定义密钥>
      # 主密钥（可选：公网部署建议自定义）
      # MASTER_KEY: <自定义密钥>
    dns:
      - 223.5.5.5
      - 8.8.8.8
    volumes:
      - ./data:/app/data
    networks:
      - timemark

networks:
  timemark:
    driver: bridge
```

> ✅ **即开即用**：直接运行 `docker compose up -d`，默认账号 `admin` / `TimeMark@2026`，登录后请修改密码！

---

## 🖥️ 平台部署指南

### 飞牛OS 部署

飞牛OS 内置 Docker 管理界面，支持 Compose 部署。

#### 方法 1：Docker Compose UI（推荐）

1. 打开飞牛OS 的 **Docker 应用**
2. 进入 **Compose** 功能
3. 点击 **新建 Compose**
4. 将上方「复制粘贴部署」的配置内容粘贴进去
5. **可选修改**：
   - 如需自定义密码，取消注释 `DEFAULT_ADMIN_PASSWORD` 行并设置密码
   - 如需自定义密钥，取消注释 `JWT_SECRET` 和 `MASTER_KEY` 行
   - 如需修改端口，将 `"3000:3000"` 改为 `"你的端口:3000"`
6. 点击 **部署**

#### 方法 2：SSH 命令行

```bash
# 1. SSH 登录飞牛OS
ssh root@你的飞牛IP

# 2. 创建部署目录
mkdir -p /vol1/docker/timemark && cd /vol1/docker/timemark

# 3. 下载配置文件
curl -sSL https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.dockerhub.yml -o docker-compose.yml

# 4. 可选：生成自定义密钥（公网部署建议配置）
# openssl rand -hex 32  # JWT_SECRET
# openssl rand -hex 32  # MASTER_KEY
# vim docker-compose.yml

# 5. 启动（无需修改配置，即开即用！）
docker compose up -d
```

#### 飞牛OS 注意事项

- 如果使用 GHCR 源，需要先在 SSH 中执行 `docker login ghcr.io` 登录
- 推荐使用 Docker Hub 源（`docker-compose.dockerhub.yml`），无需登录
- 数据目录建议放在 `/vol1/docker/timemark/data`

#### FNOS 故障排查（Issue #4：权限不足 + 登录 403）

| 现象 | 原因 | 解决 |
|------|------|------|
| `EACCES /app/data` / `SQLite readonly` / 容器反复重启 | FNOS 1.1.3107+ 宿主机卷以 root 创建，容器内 `app` 用户无写权限 | 方案A：升级到已含 `chmod 777 /app/data` 的最新镜像（`docker compose pull && docker compose up -d`）；方案B：`docker-compose.yml` 取消注释 `user: "0:0"` 以 root 运行（仅注释可选，不强制所有用户） |
| 局域网 `http://192.168.x.x:3808` 登录 403 `Origin not allowed` | 旧镜像 CSRF 仅校验 `CORS_ORIGIN`，未允许同 Host | 新版镜像已支持 `Origin` 与 `Host` 同源自动放行（`originMatchesHost`，与 vercel 逻辑一致），无需设置 `CORS_ORIGIN`；旧版可临时加 `CORS_ORIGIN=http://192.168.x.x:3808` |

> 说明：`Dockerfile` 已改为 `mkdir -p /app/data && chown -R app:app /app && chmod -R 777 /app/data`，默认仍以 `USER app` 运行，仅在宿主机卷属主异常时 `777` 兜底；`user: "0:0"` 为可选注释，适合 FNOS 等 NAS 临时提权。

---

### 群晖NAS 部署

群晖 DSM 7.0+ 内置 Container Manager，支持 Docker Compose。

#### 方法 1：Container Manager UI（推荐）

1. 打开 **Container Manager**（DSM 7.2+）或 **Docker**（DSM 7.0-7.1）
2. 进入 **项目** → **新建**
3. 项目名称填写 `timemark`
4. 路径选择 `/volume1/docker/timemark`
5. 将配置内容粘贴到编辑器中
6. **可选修改**：
   - 如需自定义密码/密钥，取消注释相应行
   - 数据卷路径改为 `/volume1/docker/timemark/data:/app/data`
7. 点击 **构建** 或 **部署**

#### 方法 2：SSH 命令行

```bash
# 1. SSH 登录群晖（需要先在 DSM 中启用 SSH）
ssh admin@你的群晖IP

# 2. 创建目录
sudo mkdir -p /volume1/docker/timemark/data

# 3. 下载配置
cd /volume1/docker/timemark
sudo curl -sSL https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.dockerhub.yml -o docker-compose.yml

# 4. 可选：生成自定义密钥（公网部署建议配置）
# sudo openssl rand -hex 32  # JWT_SECRET
# sudo openssl rand -hex 32  # MASTER_KEY
# sudo vim docker-compose.yml
# 修改数据卷路径为：/volume1/docker/timemark/data:/app/data

# 5. 部署（无需修改配置，即开即用！）
sudo docker compose up -d
```

#### 群晖注意事项

- DSM 7.2+ 使用 Container Manager，旧版使用 Docker 套件
- 数据路径通常为 `/volume1/docker/timemark/data`（根据实际存储池调整）
- 群晖默认用户可能没有 Docker 权限，需要 `sudo` 或使用 `root` 账户
- 如果端口 3000 被占用，修改为其他端口如 `"8080:3000"`

---

### 威联通NAS 部署

威联通 QTS 5.0+ 支持 Container Station 进行 Docker 管理。

#### 方法 1：Container Station UI

1. 打开 **Container Station**
2. 进入 **创建** → **Docker Compose**
3. 粘贴配置内容
4. **可选修改**：
   - 如需自定义密码/密钥，取消注释相应行
   - 数据卷路径改为 `/share/Container/timemark/data:/app/data`
5. 点击 **创建**

#### 方法 2：SSH 命令行

```bash
# 1. SSH 登录威联通
ssh admin@你的威联通IP

# 2. 创建目录
mkdir -p /share/Container/timemark/data
cd /share/Container/timemark

# 3. 下载配置
curl -sSL https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.dockerhub.yml -o docker-compose.yml

# 4. 可选：生成自定义密钥（公网部署建议配置）
# openssl rand -hex 32  # JWT_SECRET
# openssl rand -hex 32  # MASTER_KEY
# vim docker-compose.yml
# 修改数据卷路径为：/share/Container/timemark/data:/app/data

# 5. 部署（无需修改配置，即开即用！）
docker compose up -d
```

#### 威联通注意事项

- 数据路径通常为 `/share/Container/timemark/data`
- Container Station 需要在 App Center 中安装
- 确保 Docker 服务已启动

---

### 铁威马NAS 部署

铁威马 TOS 5.0+ 支持 Docker 管理。

#### 方法 1：Docker Manager UI

1. 打开 **Docker Manager** 应用
2. 进入 **Compose** 或 **项目**
3. 新建项目，粘贴配置内容
4. **可选修改**：
   - 如需自定义密码/密钥，取消注释相应行
   - 数据卷路径改为 `/Volume1/docker/timemark/data:/app/data`
5. 部署

#### 方法 2：SSH 命令行

```bash
# 1. SSH 登录铁威马
ssh admin@你的铁威马IP

# 2. 创建目录
mkdir -p /Volume1/docker/timemark/data
cd /Volume1/docker/timemark

# 3. 下载配置
curl -sSL https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.dockerhub.yml -o docker-compose.yml

# 4. 可选：生成自定义密钥（公网部署建议配置）
# openssl rand -hex 32  # JWT_SECRET
# openssl rand -hex 32  # MASTER_KEY
# vim docker-compose.yml
# 修改数据卷路径为：/Volume1/docker/timemark/data:/app/data

# 5. 部署（无需修改配置，即开即用！）
docker compose up -d
```

#### 铁威马注意事项

- 数据路径通常为 `/Volume1/docker/timemark/data`（根据实际存储池调整）
- 部分型号可能需要先安装 Docker 应用

---

### Docker Desktop (Windows/Mac) 部署

适合在 Windows 或 macOS 上本地运行 TimeMark。

#### 前置条件

1. 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. 确保 Docker Desktop 已启动（系统托盘图标为绿色）

#### 部署步骤

**Windows (PowerShell)：**

```powershell
# 1. 创建部署目录
mkdir timemark; cd timemark

# 2. 下载配置文件
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.dockerhub.yml" -OutFile "docker-compose.yml"

# 3. 可选：用记事本编辑配置（自定义密码/密钥）
# notepad docker-compose.yml

# 4. 启动（无需修改，即开即用！）
docker compose up -d
```

**macOS (Terminal)：**

```bash
# 1. 创建部署目录
mkdir timemark && cd timemark

# 2. 下载配置文件
curl -sSL https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.dockerhub.yml -o docker-compose.yml

# 3. 可选：生成自定义密钥（公网部署建议配置）
# openssl rand -hex 32  # JWT_SECRET
# openssl rand -hex 32  # MASTER_KEY
# nano docker-compose.yml

# 4. 启动（无需修改，即开即用！）
docker compose up -d
```

部署完成后访问 `http://localhost:3000`，默认账号 `admin` / `TimeMark@2026`。

---

### 公网服务器部署

适用于云服务器（阿里云、腾讯云、AWS 等），需要额外考虑安全性。

```bash
# 1. 创建目录
sudo mkdir -p /opt/timemark/{data,config}
cd /opt/timemark

# 2. 下载完整配置
sudo curl -sSL https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.full.yml -o docker-compose.yml

# 3. 建议：生成自定义密钥（公网部署强烈建议配置！）
echo "JWT_SECRET: $(openssl rand -hex 32)"
echo "MASTER_KEY: $(openssl rand -hex 32)"

# 4. 修改配置
sudo vim docker-compose.yml
# 建议修改：
# - JWT_SECRET: 填入生成的密钥（自定义更安全）
# - MASTER_KEY: 填入生成的密钥（自定义更安全）
# - DEFAULT_ADMIN_PASSWORD: 设置强密码
# - 数据存储路径

# 5. 启动（也可以直接运行，系统有内置默认值）
sudo docker compose up -d

# 6. 确认运行状态
sudo docker compose ps
sudo docker compose logs -f
```

#### HTTPS 配置（Traefik）

在 `docker-compose.full.yml` 中取消注释 Traefik 相关配置：

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.timemark.rule=Host(`your-domain.com`)"
  - "traefik.http.routers.timemark.tls=true"
  - "traefik.http.routers.timemark.tls.certresolver=letsencrypt"
```

#### Nginx 反向代理（替代方案）

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 公网部署安全建议

- **必须启用 HTTPS**，避免密码和 Token 明文传输
- **修改默认端口**，不要直接暴露 3000 端口
- **配置防火墙**，仅开放必要端口
- **自定义密钥**，公网部署建议自定义 `JWT_SECRET` 和 `MASTER_KEY`
- **修改默认密码**，首次登录后立即修改
- **定期备份**，设置自动备份任务

---

## ⚙️ 环境变量说明

> ✅ **所有环境变量均为可选，不设置也能正常使用。** 系统内置默认值，`docker compose up -d` 即可启动。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TZ` | `Asia/Shanghai` | 时区设置（常用自定义项） |
| `DB_PATH` | `/app/data/timemark.db` | SQLite 数据库文件路径 |
| `NODE_ENV` | `production` | 运行环境 |
| `JWT_SECRET` | 内置默认值 | JWT 签名密钥，公网部署建议自定义 |
| `MASTER_KEY` | 内置默认值 | 主密钥（通知凭证 AES 加密），公网部署建议自定义 |
| `DEFAULT_ADMIN_USERNAME` | `admin` | 初始管理员用户名 |
| `DEFAULT_ADMIN_PASSWORD` | `TimeMark@2026` | 初始管理员密码 |
| `LOG_QUERIES` | `false` | 是否打印 SQL 查询日志（调试用） |
| `CORS_ORIGIN` | 无（默认 localhost） | 允许的前端源，逗号分隔，如 `https://app.example.com,https://admin.example.com` |

> 💡 **公网部署建议**：自定义 `JWT_SECRET` 和 `MASTER_KEY` 以增强安全性。更换 MASTER_KEY 后，已加密的通知渠道凭证需要重新配置。

### v2.2.0 安全改进

- **非 root 运行**: 容器现在以 `app` 用户运行，降低安全风险
- **密钥检测**: 启动时检测默认密钥并输出警告
- **通知重试**: 通知发送失败自动重试 3 次（指数退避）
- **请求追踪**: 每个请求自动生成唯一 ID，便于排查问题

### 自定义密钥（可选，公网部署建议）

```bash
# Linux / macOS / WSL
openssl rand -hex 32

# 如果没有 openssl，也可以用 Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# 或者用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🔧 常用配置

### 修改访问端口

```yaml
ports:
  - "8080:3000"  # 将外部端口改为 8080
```

### 自定义数据存储路径

```yaml
volumes:
  - /your/custom/path:/app/data
```

### 修改时区

```yaml
environment:
  TZ: Asia/Tokyo  # 日本时区
  # TZ: America/New_York  # 美东时区
  # TZ: Europe/London  # 伦敦时区
```

---

## 🔐 首次登录

| 项目 | 说明 |
|:----:|------|
| 访问地址 | `http://服务器IP:3000` |
| 用户名 | `admin`（默认）或自定义 |
| 密码 | `TimeMark@2026`（默认）或自定义 |

> ⚠️ **首次登录后请立即修改密码！** 进入设置页面即可修改。

### 首次登录后建议操作

1. **修改密码** — 进入「设置」→「安全」→「修改密码」
2. **添加通知账户** — 进入「通知渠道」，添加邮箱、微信、Telegram 等通知账户
3. **创建事件** — 进入「事件管理」，添加生日、纪念日等，选择通知账户

---

## 💾 数据备份与恢复

TimeMark v2.0 使用 SQLite 单文件数据库（sql.js 内存数据库 + 文件持久化），备份非常简单。

### 手动备份

```bash
# 方式一：在线备份（无需停止容器）
# sql.js 定期将内存数据写入文件，直接复制即可
cp ./data/timemark.db ./data/timemark.db.bak.$(date +%Y%m%d)

# 方式二：完整目录备份（包含数据库和上传文件）
tar -czf timemark-backup-$(date +%Y%m%d).tar.gz ./data
```

> 💡 **SQLite 备份优势**：由于 sql.js 使用内存数据库 + 文件持久化的方式，读取备份时不会锁定数据库，可以在容器运行时直接复制文件。

### 自动备份

```bash
# 添加到 crontab（每天凌晨 3 点自动备份，保留最近 30 天）
crontab -e

# 添加以下行：
0 3 * * * cd /opt/timemark && tar -czf /backup/timemark-$(date +\%Y\%m\%d).tar.gz ./data && find /backup -name "timemark-*.tar.gz" -mtime +30 -delete
```

### 恢复数据

```bash
# 1. 停止服务
docker compose down

# 2. 恢复备份
# 从 tar.gz 恢复
tar -xzf timemark-backup-20260420.tar.gz

# 或从单文件恢复
cp ./data/timemark.db.bak ./data/timemark.db

# 3. 重新启动
docker compose up -d
```

### 备份最佳实践

| 建议 | 说明 |
|------|------|
| 定期备份 | 至少每天一次自动备份 |
| 异地备份 | 将备份文件同步到其他设备或云存储 |
| 备份验证 | 定期测试备份文件是否可以正常恢复 |
| 保留策略 | 建议保留最近 30 天的备份 |

---

## 🔄 从 v1.x 升级

v2.0 使用全新架构（SQLite 替代 PostgreSQL + Redis），**不支持直接升级**。

### 升级步骤

```bash
# 1. 备份 v1.x 数据
cd /opt/timemark-v1
docker compose down
tar -czf timemark-v1-backup-$(date +%Y%m%d).tar.gz ./data

# 2. 创建 v2.0 部署目录
mkdir -p /opt/timemark-v2 && cd /opt/timemark-v2

# 3. 下载 v2.0 配置
curl -sSL https://raw.githubusercontent.com/WXFffff666/timemark-docker/master/docker-compose.dockerhub.yml -o docker-compose.yml

# 4. 可选：生成新密钥（公网部署建议配置）
# openssl rand -hex 32  # JWT_SECRET
# openssl rand -hex 32  # MASTER_KEY
# vim docker-compose.yml

# 5. 启动 v2.0
docker compose up -d

# 6. 手动迁移数据
# 登录 v2.0 Web 界面，手动重新添加事件和通知渠道配置
# v1.x 的 PostgreSQL 数据需要手动迁移
```

### 升级注意事项

| 项目 | 说明 |
|------|------|
| 数据库 | v1.x 使用 PostgreSQL，v2.0 使用 SQLite，数据格式不兼容 |
| 通知配置 | 需要重新配置所有通知渠道（v2.0 使用加密存储） |
| 环境变量 | v2.0 所有变量均可选（有内置默认值），移除了 `DB_HOST`、`REDIS_URL` 等 |
| 端口 | 默认端口不变，仍为 3000 |

### 清理 v1.x 环境

确认 v2.0 运行正常后，可以清理 v1.x 环境：

```bash
# 停止并删除 v1.x 容器
cd /opt/timemark-v1
docker compose down -v

# 保留备份文件，删除旧部署目录
# rm -rf /opt/timemark-v1  # 确认不再需要后执行
```

---

## ⚡ 资源优化（低功耗设备）

TimeMark v2.0 专门针对 Intel J4125、N5105 等低功耗 NAS 处理器做了优化。

### J4125 / N5105 优化建议

| 优化项 | 建议 |
|--------|------|
| 内存限制 | 可在 docker-compose 中设置 `mem_limit: 512m` |
| 日志级别 | 生产环境保持 `LOG_QUERIES: false` |
| 备份时间 | 将自动备份设在凌晨低负载时段 |
| 通知频率 | 避免设置过于频繁的提醒检查 |

### Docker 资源限制配置

```yaml
services:
  app:
    image: xfffff666/timemark:latest
    # ... 其他配置 ...
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
        reservations:
          memory: 128M
          cpus: '0.25'
```

### 性能对比

| 指标 | v1.x (三容器) | v2.0 (单容器) |
|:----:|:------------:|:------------:|
| 内存占用 | ~800MB | ~256MB |
| CPU 占用 | 中等 | 低 |
| 启动时间 | ~30s | ~5s |
| 磁盘占用 | ~2GB | ~500MB |

---

## ❓ 常见问题

### Q: 端口被占用怎么办？

修改 docker-compose.yml 中的端口映射：

```yaml
ports:
  - "8080:3000"  # 将 3000 改为其他可用端口
```

### Q: 镜像拉取失败

如果使用 GHCR 源，需要先登录：

```bash
docker login ghcr.io -u 你的GitHub用户名 -p 你的GitHubToken
```

**推荐切换到 Docker Hub 源**，无需登录：`xfffff666/timemark:latest`

### Q: 容器启动失败，提示 MASTER_KEY 错误

系统已内置默认值，一般不会遇到此错误。如果自定义了 MASTER_KEY，请确保配置正确：

```bash
# 生成密钥（公网部署建议配置）
openssl rand -hex 32

# 将生成的字符串填入 docker-compose.yml 的 MASTER_KEY 字段
```

> 💡 v2.0 现在支持内置默认密钥，开箱即用。如遇此错误，请检查 docker-compose.yml 中是否有语法错误。

### Q: 忘记管理员密码

```bash
# 1. 停止服务
docker compose down

# 2. 删除数据目录（⚠️ 会清除所有数据！请先备份）
rm -rf ./data

# 3. 重新启动（自动创建新数据库和管理员账户）
docker compose up -d
```

### Q: 通知渠道凭证解密失败

如果更换了 MASTER_KEY，之前加密存储的通知渠道凭证将无法解密。需要重新配置所有通知渠道。**请妥善保管 MASTER_KEY**。

### Q: 数据库文件损坏

```bash
# 1. 备份损坏的文件
cp ./data/timemark.db ./data/timemark.db.corrupted

# 2. 如果有备份，恢复备份
cp ./data/timemark.db.bak ./data/timemark.db
docker compose restart

# 3. 如果没有备份，删除后重建（数据会丢失）
rm ./data/timemark.db
docker compose restart
```

### Q: 如何查看容器日志？

```bash
# 查看实时日志
docker compose logs -f

# 查看最近 100 行日志
docker compose logs --tail 100

# 查看特定时间段的日志
docker compose logs --since "2026-04-20T00:00:00"
```

### Q: 如何更新到最新版本？

```bash
# 1. 备份数据
tar -czf timemark-backup-$(date +%Y%m%d).tar.gz ./data

# 2. 拉取最新镜像
docker compose pull

# 3. 重新启动
docker compose up -d

# 4. 确认版本
docker compose logs | head -20
```

---

## 💬 支持

<div align="center">

**遇到问题？欢迎提交 Issue！**

---

🐛 问题反馈：[GitHub Issues](https://github.com/WXFffff666/timemark-docker/issues)

⭐ Star 支持：[GitHub Stars](https://github.com/WXFffff666/timemark-docker/stargazers)

---

Made with ❤️ by TimeMark

</div>

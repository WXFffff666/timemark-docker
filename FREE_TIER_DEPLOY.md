# 免费部署补充（Docker · v2.16.0）

> Docker 版无需 Vercel 免费额度，直接 docker compose up -d 即可。定时提醒由容器内 Croner 每分钟执行，无需 cron-job.org。
>
> 参考 vercel 的 [FREE_TIER_DEPLOY.md](https://github.com/WXFffff666/timemark-vercel/blob/master/FREE_TIER_DEPLOY.md) 了解 Vercel 免费部署；Docker 版对应概念：
>
> | Vercel | Docker |
> |---|---|
> | Vercel Cron (daily-maintenance) | Croner 内置调度 + \
otification_queue\ 指数退避 |
> | cron-job.org 每分钟 \eminder-check\ | Croner 每分钟 \matchesReminderTimeWindow\ |
> | \CORS_ORIGIN\ / \TURNSTILE_SECRET_KEY\ 仅 Production | Docker \CORS_ORIGIN\ / \TURNSTILE_SECRET_KEY\ 生产公网必填 |
> | \user: "0:0"\ 无需 | FNOS 1.1.3107+ 需取消注释 \user: "0:0"\（见 DEPLOYMENT.md） |

版本：v2.16.0（2026-07-31）
#!/bin/sh
# TimeMark 容器入口：
# 1) 以 root 启动时自愈 bind-mount 的 /app/data 属主（FNOS/NAS 场景挂载目录常为 root 属主，
#    镜像层的 chown 对挂载点无效），然后降权到 app 用户运行；
# 2) 已是非 root（或无 /app/data）时直接透传。
set -e

if [ "$(id -u)" = "0" ]; then
  if [ -d /app/data ]; then
    chown -R app:app /app/data || true
  fi
  exec su-exec app dumb-init "$@"
fi

exec dumb-init "$@"

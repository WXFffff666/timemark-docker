import { serve } from '@hono/node-server';
import 'dotenv/config';
import { createApp } from './app.js';
import { createLogger } from './utils/logger.js';
import { waitForDb, query } from './db/index.js';
import { runMigrations, migrateEncryptionKey } from './db/migrate.js';
import { hashPassword } from './utils/password.js';
import { resolveInitialAdminCredentials } from './utils/initial-admin.js';
import { initSecretKeys } from './utils/secrets.js';
import { startScheduler, stopScheduler } from './queue/scheduler.js';

const log = createLogger('bootstrap');

async function bootstrap() {

  // 0. 初始化密钥（首次启动自动生成，后续启动从文件读取）
  log.info('Initializing secret keys...');
  const secrets = initSecretKeys();
  log.info('Secret keys ready');

  // 1. 等待数据库就绪
  log.info('等待数据库初始化...');
  await waitForDb();
  log.info('数据库就绪');

  // 2. 执行 schema 迁移
  await runMigrations();

  // 2.5 迁移旧密钥加密的数据到新密钥
  await migrateEncryptionKey();

  // 3. 初始化管理员用户
  const userResult = await query('SELECT id FROM users LIMIT 1');
  if (userResult.rows.length === 0) {
    const { username, password } = resolveInitialAdminCredentials();
    const passwordHash = await hashPassword(password);

    await query(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );

    log.info({ username }, 'Initial admin user created');

  } else {
    log.info('数据库已初始化，已存在用户');
  }

  // 4. 创建 Hono 应用
  const app = createApp();

  const port = parseInt(process.env.PORT || '3000');

  // 5. 启动定时任务
  startScheduler().catch((err) => log.error(err, 'Scheduler failed to start'));

  // 6. 优雅关闭
  process.on('SIGTERM', async () => {
    log.info('SIGTERM received, shutting down...');
    await stopScheduler();
    const { gracefulShutdown } = await import('./db/index.js');
    gracefulShutdown();
    process.exit(0);
  });

  log.info({ port }, 'Server running');
  serve({ fetch: app.fetch, port });
}

bootstrap().catch((err) => {
  log.fatal(err, '启动失败');
  process.exit(1);
});
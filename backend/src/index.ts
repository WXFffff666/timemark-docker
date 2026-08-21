import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { requestIdMiddleware } from './middleware/request-id.js';
import { securityHeaders } from './middleware/security-headers.js';
import { csrfProtection } from './middleware/csrf.js';
import { authRateLimit, apiRateLimit, rateLimit } from './middleware/rate-limit.js';
import 'dotenv/config';
import { createLogger } from './utils/logger.js';
import { waitForDb, query } from './db/index.js';
import { runMigrations, migrateEncryptionKey } from './db/migrate.js';
import { hashPassword } from './utils/password.js';
import { initSecretKeys } from './utils/secrets.js';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import configRoutes from './routes/config.js';
import channelsRoutes from './routes/channels.js';
import statsRoutes from './routes/stats.js';
import backupRoutes from './routes/backup.js';
import calendarRoutes from './routes/calendar.js';
import pushRoutes from './routes/push.js';
import todosRoutes from './routes/todos.js';
import timeRoutes from './routes/time.js';
import webauthnRoutes from './routes/webauthn.js';
import { startScheduler, stopScheduler } from './queue/scheduler.js';

const log = createLogger('bootstrap');

async function bootstrap() {

  // 0. 初始化密钥（首次启动自动生成，后续启动从文件读取�?
  log.info('Initializing secret keys...');
  const secrets = initSecretKeys();
  log.info('Secret keys ready');

  // 1. 等待数据库就�?
  log.info('等待数据库初始化...');
  await waitForDb();
  log.info('数据库就�?);

  // 2. 执行 schema 迁移
  await runMigrations();

  // 2.5 迁移旧密钥加密的数据到新密钥
  await migrateEncryptionKey();

  // 3. 初始化管理员用户
  const userResult = await query('SELECT id FROM users LIMIT 1');
  if (userResult.rows.length === 0) {
    const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const passwordHash = await hashPassword(password);

    await query(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );

    console.log(`�?默认用户已创�?(用户�? ${username}, 密码: ${password})`);
    console.log('⚠️  请登录后立即修改默认密码�?);

  } else {
    log.info('数据库已初始化，已存在用�?);
  }

  // 4. 创建 Hono 应用
  const app = new Hono();

  app.use('*', honoLogger());
  app.use('*', securityHeaders);
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];
  app.use('*', cors({
    origin: corsOrigins,
    credentials: true,
  }));
  app.use('*', requestIdMiddleware);
  app.use('*', csrfProtection());

  // Rate limiting: specific limits before general
  const notifyRateLimit = rateLimit(10, 60 * 1000);
  app.use('/api/auth/*', authRateLimit);
  app.use('/api/channels/test', notifyRateLimit);
  app.use('/api/*', apiRateLimit);

  app.route('/api/auth', authRoutes);
  app.route('/api/events', eventRoutes);
  app.route('/api/config', configRoutes);
  app.route('/api/channels', channelsRoutes);
  app.route('/api/stats', statsRoutes);
  app.route('/api/backup', backupRoutes);
  app.route('/api/calendar', calendarRoutes);
  app.route('/api/push', pushRoutes);
  app.route('/api/todos', todosRoutes);
  app.route('/api/time', timeRoutes);
  app.route('/api/auth/webauthn', webauthnRoutes);

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Serve frontend static files
  app.use('/*', serveStatic({ root: './frontend/dist' }));
  app.get('*', serveStatic({ path: './frontend/dist/index.html' }));

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
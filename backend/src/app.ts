import { Hono, type Context, type Next } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { createLogger } from './utils/logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { zeroTrustGuard } from './middleware/zero-trust-guard.js';
import { httpsEnforcement } from './middleware/https-enforcement.js';
import { securityHeaders } from './middleware/security-headers.js';
import { csrfProtection } from './middleware/csrf.js';
import { getConfiguredOrigins, isAllowedOrigin } from './utils/allowed-origins.js';
import { getRequestOrigin } from './utils/client-ip.js';
import { authRateLimit, apiRateLimit, rateLimit } from './middleware/rate-limit.js';
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
import contactsRoutes from './routes/contacts.js';
import inboxRoutes from './routes/inbox.js';
import inboxPublicRoutes from './routes/inbox-public.js';
import webhookInboundRoutes from './routes/webhook-inbound.js';
import calendarImportRoutes from './routes/calendar-import.js';
import calendarPublicRoutes from './routes/calendar-public.js';
import triggerLogRoutes from './routes/trigger-logs.js';
import dataRoutes from './routes/data.js';

const requestLog = createLogger('http');

async function requestLogger(c: Context, next: Next): Promise<void> {
  const startedAt = Date.now();
  await next();
  requestLog.info(
    { method: c.req.method, status: c.res.status, durationMs: Date.now() - startedAt },
    'HTTP request',
  );
}

export function createApp() {
  const app = new Hono();

  app.use('*', requestLogger);
  app.use('*', zeroTrustGuard);
  app.use('*', securityHeaders);
  app.use('*', httpsEnforcement);
  // CORS: 精确白名单 + 与可信请求 origin 完全一致（LAN IP:端口 无需手动 CORS_ORIGIN）
  const corsAllowList = getConfiguredOrigins();
  const isCorsOriginAllowed = (origin: string, requestOrigin: string) =>
    isAllowedOrigin(origin, requestOrigin, corsAllowList);
  app.use('*', cors({
    origin: (origin, c) => {
      if (!origin) return origin;
      const requestOrigin = getRequestOrigin(c);
      if (isCorsOriginAllowed(origin, requestOrigin)) return origin;
      return undefined as unknown as string;
    },
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
  // v2.16.0 ported routers (previously unmounted — Inbox/Contacts/ICS feed/Webhook were 404)
  app.route('/api/calendar', calendarImportRoutes);
  app.route('/api/calendar', calendarPublicRoutes);
  app.route('/api/contacts', contactsRoutes);
  app.route('/api/webhook', webhookInboundRoutes);
  app.route('/api/inbox', inboxRoutes);
  app.route('/api/inbox', inboxPublicRoutes);
  app.route('/api/trigger-logs', triggerLogRoutes);
  app.route('/api/data', dataRoutes);

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Serve frontend static files
  app.use('/*', serveStatic({ root: './frontend/dist' }));
  app.get('*', serveStatic({ path: './frontend/dist/index.html' }));

  return app;
}

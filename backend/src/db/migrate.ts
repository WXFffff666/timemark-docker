import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { getDb, waitForDb } from './index.js';
import { encrypt, decrypt } from '@timemark/shared/crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Auto-migration: ensures database schema is up to date on startup.
 * Reads schema.sql and executes it (all statements are idempotent with IF NOT EXISTS).
 * Tracks schema version for future incremental migrations.
 */
export async function runMigrations(): Promise<void> {
  console.log('[DB] Running migrations...');

  // Ensure database is ready
  await waitForDb();
  const db = getDb();

  // Find schema.sql - check multiple possible locations
  const possiblePaths = [
    path.resolve('./docker/schema.sql'),
    path.resolve('../docker/schema.sql'),
    path.resolve(__dirname, '../../../docker/schema.sql'),
    path.resolve(__dirname, '../../../../docker/schema.sql'),
  ];

  let schemaPath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      schemaPath = p;
      break;
    }
  }

  if (!schemaPath) {
    console.warn('[DB] schema.sql not found, skipping migrations. Searched:', possiblePaths);
    return;
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  // Execute schema (all CREATE TABLE IF NOT EXISTS, so idempotent)
  try {
    db.exec(schemaSql);
    console.log('[DB] Schema applied successfully');
  } catch (error) {
    console.error('[DB] Failed to apply schema:', error);
    throw error;
  }

  // Check current schema version
  try {
    const stmt = db.prepare('SELECT MAX(version) as version FROM schema_version');
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    const currentVersion = rows[0]?.version || 0;
    console.log(`[DB] Current schema version: ${currentVersion}`);

    // Apply incremental migrations
    await applyIncrementalMigrations(db, currentVersion);
  } catch (error) {
    console.error('[DB] Failed to check schema version:', error);
  }
}

async function applyIncrementalMigrations(db: any, currentVersion: number): Promise<void> {
  const migrations: Array<{ version: number; name: string; sql: string; postMigrate?: (db: any) => void }> = [
    {
      version: 2,
      name: 'add_api_key_column',
      sql: `ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS api_key TEXT;`
    },
    {
      version: 3,
      name: 'add_notification_queue',
      sql: `CREATE TABLE IF NOT EXISTS notification_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        next_retry_at TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
      CREATE INDEX IF NOT EXISTS idx_notification_queue_user ON notification_queue(user_id);`
    },
    {
      version: 4,
      name: 'add_recurring_events',
      sql: `ALTER TABLE events ADD COLUMN recurring_config TEXT;`
    },
    {
      version: 5,
      name: 'add_next_occurrence',
      sql: `ALTER TABLE events ADD COLUMN next_occurrence TEXT;`
    },
    {
      version: 6,
      name: 'add_recurring_index',
      sql: `CREATE INDEX IF NOT EXISTS idx_events_next_occurrence ON events(next_occurrence);`
    },
    {
      version: 7,
      name: 'add_push_subscriptions',
      sql: `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        keys_p256dh TEXT,
        keys_auth TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, endpoint)
      );
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);`
    },
    {
      version: 8,
      name: 'add_timezone_column',
      sql: `ALTER TABLE user_configs ADD COLUMN timezone TEXT DEFAULT 'Asia/Shanghai';`
    },
    {
      version: 9,
      name: 'hash_existing_api_keys',
      sql: `SELECT 1;`,
      postMigrate: (db: any) => {
        // Hash existing plaintext API keys in-place (SHA-256)
        const stmt = db.prepare('SELECT user_id, api_key FROM user_configs WHERE api_key IS NOT NULL');
        const rows: Array<{ user_id: number; api_key: string }> = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as any);
        }
        stmt.free();
        for (const row of rows) {
          // Skip if already hashed (64 hex chars = SHA-256 hash)
          if (row.api_key.length === 64 && /^[0-9a-f]+$/.test(row.api_key)) continue;
          const hash = createHash('sha256').update(row.api_key).digest('hex');
          db.run('UPDATE user_configs SET api_key = ? WHERE user_id = ?', [hash, row.user_id]);
        }
        if (rows.length > 0) {
          console.log(`[DB] Hashed ${rows.length} existing API key(s)`);
        }
      },
    },
    {
      version: 10,
      name: 'add_channel_results_column',
      sql: `ALTER TABLE event_trigger_logs ADD COLUMN channel_results TEXT;`
    },
    {
      version: 11,
      name: 'add_plugin_sessions',
      sql: `CREATE TABLE IF NOT EXISTS plugin_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_type TEXT NOT NULL,
        session_id TEXT UNIQUE NOT NULL,
        session_data TEXT,
        status TEXT DEFAULT 'pending',
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_plugin_sessions_id ON plugin_sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_plugin_sessions_expires ON plugin_sessions(expires_at);`
    },
    {
      version: 12,
      name: 'add_trigger_log_failure_details',
      sql: `ALTER TABLE event_trigger_logs ADD COLUMN error_details TEXT;
ALTER TABLE event_trigger_logs ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE event_trigger_logs ADD COLUMN channel_type TEXT;
ALTER TABLE event_trigger_logs ADD COLUMN account_id INTEGER;`
    },
    {
      version: 13,
      name: 'add_connection_status',
      sql: `ALTER TABLE notification_accounts ADD COLUMN connection_status TEXT;`
    },
    {
      version: 14,
      name: 'add_test_result_columns',
      sql: `ALTER TABLE notification_accounts ADD COLUMN last_test_result TEXT;
ALTER TABLE notification_accounts ADD COLUMN last_test_at TEXT;`
    },
    {
      version: 15,
      name: 'add_quiet_hours',
      sql: `ALTER TABLE user_configs ADD COLUMN quiet_hours_start TEXT;
ALTER TABLE user_configs ADD COLUMN quiet_hours_end TEXT;`
    },
    // v16-32 粗略移植自 vercel backend/src/db/migrate.ts (Approach B: JSONB->TEXT, SERIAL->INTEGER, TIMESTAMP->TEXT, BOOLEAN->INTEGER, jsonb_build_object->json_object)
    {
      version: 16,
      name: 'vercel_free_tier_features',
      sql: `ALTER TABLE events ADD COLUMN tags TEXT DEFAULT '[]';
ALTER TABLE events ADD COLUMN share_token TEXT;
ALTER TABLE events ADD COLUMN event_photo_url TEXT;
ALTER TABLE user_configs ADD COLUMN password_changed_at TEXT;
ALTER TABLE event_trigger_logs ADD COLUMN read_at TEXT;
CREATE TABLE IF NOT EXISTS cron_execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  result_summary TEXT,
  error_message TEXT,
  executed_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cron_logs_job ON cron_execution_logs(job_name, executed_at);`
    },
    {
      version: 17,
      name: 'security_features_v17',
      sql: `CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_login_logs_ip_time ON login_logs(ip_address, login_time);
ALTER TABLE user_configs ADD COLUMN ip_whitelist TEXT DEFAULT '[]';
ALTER TABLE user_configs ADD COLUMN ip_whitelist_enabled INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN refresh_family TEXT;
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  device_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);`
    },
    {
      version: 18,
      name: 'contacts_broadcast_v18',
      sql: `CREATE TABLE IF NOT EXISTS fixed_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nickname TEXT,
  email TEXT,
  phone TEXT,
  telegram_chat_id TEXT,
  qq TEXT,
  wxpusher_uid TEXT,
  preferred_channels TEXT DEFAULT '[]',
  notes TEXT,
  validation_status TEXT DEFAULT 'pending',
  last_validated_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fixed_contacts_user ON fixed_contacts(user_id);
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  recipient_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  recipient_source TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_user ON broadcast_campaigns(user_id);
ALTER TABLE email_logs ADD COLUMN broadcast_id INTEGER REFERENCES broadcast_campaigns(id) ON DELETE SET NULL;
ALTER TABLE user_configs ADD COLUMN email_opt_out INTEGER DEFAULT 0;
ALTER TABLE user_configs ADD COLUMN must_change_password INTEGER DEFAULT 0;`
    },
    {
      version: 19,
      name: 'webauthn_challenges_v19',
      sql: `CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);
ALTER TABLE webauthn_credentials ADD COLUMN transports TEXT;
ALTER TABLE webauthn_credentials ADD COLUMN last_used_at TEXT;`
    },
    {
      version: 20,
      name: 'totp_enabled_flag_v20',
      sql: `ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0;`,
      postMigrate: (db: any) => {
        try {
          db.exec(`UPDATE users SET totp_enabled = 1 WHERE totp_secret IS NOT NULL AND EXISTS (SELECT 1 FROM security_events se WHERE se.user_id = users.id AND se.event_type = 'totp_enabled')`);
          // 清理未完成 TOTP 半配置：仅 secret 非空且未启用
          db.exec(`UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE totp_secret IS NOT NULL AND COALESCE(totp_enabled, 0) = 0 AND NOT EXISTS (SELECT 1 FROM security_events se WHERE se.user_id = users.id AND se.event_type = 'totp_enabled')`);
          console.log('[DB] v20 totp_enabled migration done');
        } catch (e) {
          console.warn('[DB] v20 postMigrate skipped:', e);
        }
      },
    },
    {
      version: 21,
      name: 'notification_defaults_email_logs_v21',
      sql: `ALTER TABLE user_configs ADD COLUMN default_test_email TEXT;
ALTER TABLE email_logs ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE email_logs ADD COLUMN subject TEXT;
ALTER TABLE email_logs ADD COLUMN error_message TEXT;
ALTER TABLE email_logs ADD COLUMN channel_type TEXT DEFAULT 'email';
CREATE INDEX IF NOT EXISTS idx_email_logs_user_sent ON email_logs(user_id, sent_at);
ALTER TABLE notification_queue ADD COLUMN account_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_notification_queue_retry ON notification_queue(status, next_retry_at);`
    },
    {
      version: 22,
      name: 'integrations_v22',
      sql: `ALTER TABLE user_configs ADD COLUMN webhook_inbound_token TEXT;
ALTER TABLE user_configs ADD COLUMN webhook_inbound_secret TEXT;
ALTER TABLE user_configs ADD COLUMN calendar_feed_token TEXT;
ALTER TABLE user_configs ADD COLUMN external_calendar_urls TEXT DEFAULT '[]';
ALTER TABLE events ADD COLUMN timezone TEXT;
CREATE TABLE IF NOT EXISTS event_reminder_cache (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_reminder_cache_expires ON event_reminder_cache(expires_at);`,
      postMigrate: (db: any) => {
        try {
          const stmt = db.prepare('SELECT user_id FROM user_configs WHERE webhook_inbound_token IS NULL OR calendar_feed_token IS NULL');
          const rows: Array<{ user_id: number }> = [];
          while (stmt.step()) rows.push(stmt.getAsObject() as any);
          stmt.free();
          for (const r of rows) {
            const webhookToken = randomBytes(24).toString('hex');
            const feedToken = randomBytes(24).toString('hex');
            const webhookSecret = randomBytes(32).toString('hex');
            db.run('UPDATE user_configs SET webhook_inbound_token = COALESCE(webhook_inbound_token, ?), calendar_feed_token = COALESCE(calendar_feed_token, ?), webhook_inbound_secret = COALESCE(webhook_inbound_secret, ?) WHERE user_id = ?', [webhookToken, feedToken, webhookSecret, r.user_id]);
          }
          if (rows.length) console.log(`[DB] v22 generated tokens for ${rows.length} user(s)`);
        } catch (e) {
          console.warn('[DB] v22 postMigrate skipped:', e);
        }
      },
    },
    {
      version: 23,
      name: 'inbox_messages_v23',
      sql: `CREATE TABLE IF NOT EXISTS inbox_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  channel TEXT,
  event_id INTEGER,
  sender_label TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_created ON inbox_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_unread ON inbox_messages(user_id, is_read);
ALTER TABLE user_configs ADD COLUMN inbox_receive_token TEXT;
ALTER TABLE user_configs ADD COLUMN inbox_receive_secret TEXT;`,
      postMigrate: (db: any) => {
        try {
          const stmt = db.prepare('SELECT user_id FROM user_configs WHERE inbox_receive_token IS NULL');
          const rows: Array<{ user_id: number }> = [];
          while (stmt.step()) rows.push(stmt.getAsObject() as any);
          stmt.free();
          for (const r of rows) {
            const token = randomBytes(24).toString('hex');
            const secret = randomBytes(32).toString('hex');
            db.run('UPDATE user_configs SET inbox_receive_token = COALESCE(inbox_receive_token, ?), inbox_receive_secret = COALESCE(inbox_receive_secret, ?) WHERE user_id = ?', [token, secret, r.user_id]);
          }
          if (rows.length) console.log(`[DB] v23 generated inbox tokens for ${rows.length} user(s)`);
        } catch (e) {
          console.warn('[DB] v23 postMigrate skipped:', e);
        }
      },
    },
    {
      version: 24,
      name: 'optimizations_v24',
      sql: `CREATE TABLE IF NOT EXISTS webhook_idempotency_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  response_body TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_created ON webhook_idempotency_keys(created_at);
CREATE TABLE IF NOT EXISTS stats_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  stat_date TEXT NOT NULL,
  events_count INTEGER DEFAULT 0,
  triggers_total INTEGER DEFAULT 0,
  triggers_success INTEGER DEFAULT 0,
  triggers_failed INTEGER DEFAULT 0,
  UNIQUE(user_id, stat_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trigger_dedup_success ON event_trigger_logs(event_id, trigger_date) WHERE status = 'success';
ALTER TABLE user_configs ADD COLUMN calendar_feed_tokens TEXT DEFAULT '[]';
ALTER TABLE user_configs ADD COLUMN external_calendar_sync_strategy TEXT DEFAULT 'add_only';
ALTER TABLE user_configs ADD COLUMN api_scopes TEXT DEFAULT 'read,write';
ALTER TABLE user_configs ADD COLUMN lunar_reminders_enabled INTEGER DEFAULT 0;
ALTER TABLE user_configs ADD COLUMN caldav_url TEXT;
ALTER TABLE user_configs ADD COLUMN caldav_username TEXT;
ALTER TABLE user_configs ADD COLUMN caldav_password_encrypted TEXT;
ALTER TABLE user_configs ADD COLUMN outbound_webhook_url TEXT;
ALTER TABLE user_configs ADD COLUMN resend_webhook_secret TEXT;
ALTER TABLE user_configs ADD COLUMN markdown_email_template TEXT;
ALTER TABLE user_configs ADD COLUMN notification_preset TEXT;`
    },
    {
      version: 25,
      name: 'features_v25',
      sql: `CREATE TABLE IF NOT EXISTS contact_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contact_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  UNIQUE(group_id, email)
);
CREATE TABLE IF NOT EXISTS conditional_reminder_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  days_before INTEGER NOT NULL,
  channels TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);`
    },
    {
      version: 26,
      name: 'reminder_claims_v26',
      sql: `CREATE TABLE IF NOT EXISTS reminder_send_claims (
  event_id INTEGER NOT NULL,
  trigger_date TEXT NOT NULL,
  claimed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, trigger_date)
);
CREATE INDEX IF NOT EXISTS idx_reminder_claims_claimed ON reminder_send_claims(claimed_at);`
    },
    {
      version: 27,
      name: 'google_oauth_calendar_v27',
      sql: `ALTER TABLE user_configs ADD COLUMN google_oauth_refresh_token_encrypted TEXT;
ALTER TABLE user_configs ADD COLUMN google_oauth_email TEXT;
ALTER TABLE user_configs ADD COLUMN google_calendar_id TEXT DEFAULT 'primary';
ALTER TABLE user_configs ADD COLUMN google_oauth_connected_at TEXT;`
    },
    {
      version: 28,
      name: 'alert_settings_v28',
      sql: `ALTER TABLE user_configs ADD COLUMN alert_emails TEXT DEFAULT '[]';
ALTER TABLE user_configs ADD COLUMN alert_account_ids TEXT DEFAULT '[]';`
    },
    {
      version: 29,
      name: 'todo_completions_v29',
      sql: `CREATE TABLE IF NOT EXISTS todo_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  completed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, event_id, occurrence_date)
);
CREATE INDEX IF NOT EXISTS idx_todo_completions_user ON todo_completions(user_id);`
    },
    {
      version: 30,
      name: 'contact_methods_v30',
      sql: `ALTER TABLE fixed_contacts ADD COLUMN contact_methods TEXT DEFAULT '{}';
-- 粗略移植 PG jsonb_build_object -> SQLite json_object/json_array，::jsonb 去除
UPDATE fixed_contacts SET contact_methods = json_object(
  'emails', CASE WHEN email IS NOT NULL AND email != '' THEN json_array(json_object('label', '默认', 'value', email)) ELSE json('[]') END,
  'phones', CASE WHEN phone IS NOT NULL AND phone != '' THEN json_array(json_object('label', '默认', 'value', phone)) ELSE json('[]') END,
  'telegrams', CASE WHEN telegram_chat_id IS NOT NULL AND telegram_chat_id != '' THEN json_array(json_object('label', '默认', 'value', telegram_chat_id)) ELSE json('[]') END,
  'qqs', CASE WHEN qq IS NOT NULL AND qq != '' THEN json_array(json_object('label', '默认', 'value', qq)) ELSE json('[]') END,
  'wxpusherUids', CASE WHEN wxpusher_uid IS NOT NULL AND wxpusher_uid != '' THEN json_array(json_object('label', '默认', 'value', wxpusher_uid)) ELSE json('[]') END
) WHERE contact_methods IS NULL OR contact_methods = '{}';`
    },
    {
      version: 31,
      name: 'contact_relationship_gender_v31',
      sql: `ALTER TABLE fixed_contacts ADD COLUMN relationship TEXT;
ALTER TABLE fixed_contacts ADD COLUMN gender TEXT DEFAULT 'unknown';`
    },
    {
      version: 32,
      name: 'session_data_text_v32',
      sql: `ALTER TABLE notification_accounts ADD COLUMN session_data_text TEXT;`,
      postMigrate: (db: any) => {
        // 粗略版：先新增 TEXT 列并拷贝数据；DROP COLUMN 在 SQLite 需重建表，此处仅尝试，不成功则留注释由后续完整迁移处理
        try {
          const stmt = db.prepare('SELECT id, session_data, session_data_text FROM notification_accounts WHERE session_data IS NOT NULL AND session_data_text IS NULL');
          const rows: Array<{ id: number; session_data: any }> = [];
          while (stmt.step()) rows.push(stmt.getAsObject() as any);
          stmt.free();
          for (const row of rows) {
            let textValue: string | null = null;
            const raw: any = row.session_data;
            if (raw == null) textValue = null;
            else if (typeof raw === 'string') textValue = raw;
            else if (typeof raw === 'object') textValue = JSON.stringify(raw);
            if (textValue != null) db.run('UPDATE notification_accounts SET session_data_text = ? WHERE id = ?', [textValue, row.id]);
          }
          if (rows.length) console.log(`[DB] v32 copied session_data -> session_data_text for ${rows.length} row(s)`);
          // 尝试 SQLite DROP/COLUMN RENAME（新版 SQLite 支持，旧版会抛错则仅警告）
          try { db.exec('ALTER TABLE notification_accounts DROP COLUMN session_data;'); } catch { console.warn('[DB] v32 DROP COLUMN session_data skipped (需重建表，粗略版保留)'); }
          try { db.exec('ALTER TABLE notification_accounts RENAME COLUMN session_data_text TO session_data;'); } catch { console.warn('[DB] v32 RENAME COLUMN skipped'); }
          // TODO 完整重建表思路: CREATE TABLE notification_accounts_new (... session_data TEXT ...); INSERT INTO ... SELECT ...; DROP TABLE notification_accounts; ALTER TABLE ... RENAME TO ...
        } catch (e) {
          console.warn('[DB] v32 postMigrate skipped:', e);
        }
      },
    },
  ];

  for (const migration of migrations) {
    if (currentVersion < migration.version) {
      try {
        console.log(`[DB] Applying migration v${migration.version}: ${migration.name}`);
        db.exec(migration.sql);
        if (migration.postMigrate) {
          migration.postMigrate(db);
        }
        db.run('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [migration.version]);
        console.log(`[DB] Migration v${migration.version} applied successfully`);
      } catch (error) {
        console.error(`[DB] Migration v${migration.version} failed:`, error);
      }
    }
  }
}

// The old hardcoded default key used before auto-generation was implemented.
const LEGACY_MASTER_KEY = 'timemark-default-master-key-change-in-production-2026';

/**
 * One-time migration: re-encrypt notification_accounts from legacy key to new key.
 * Runs on startup after schema migrations. Safe to run multiple times (idempotent).
 */
export async function migrateEncryptionKey(): Promise<void> {
  const currentKey = process.env.MASTER_KEY;
  if (!currentKey) {
    console.warn('[Migration] MASTER_KEY not set, skipping encryption migration');
    return;
  }

  // If the current key IS the legacy key, no migration needed
  if (currentKey === LEGACY_MASTER_KEY) {
    return;
  }

  const db = getDb();

  // Migrate notification_accounts
  const encryptedFields = ['webhook', 'token', 'secret', 'chat_id', 'session_data'];
  const stmt = db.prepare('SELECT id, webhook, token, secret, chat_id, session_data FROM notification_accounts');
  const rows: Array<{ id: number; [key: string]: any }> = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as any);
  }
  stmt.free();

  let migratedCount = 0;
  for (const row of rows) {
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of encryptedFields) {
      const value = row[field];
      if (!value) continue;

      // Try decrypting with current key - if it works, already migrated
      try {
        decrypt(value, currentKey);
        continue; // Already encrypted with current key
      } catch {
        // Current key failed
      }

      // Try legacy key
      try {
        const plaintext = decrypt(value, LEGACY_MASTER_KEY);
        const reEncrypted = encrypt(plaintext, currentKey);
        updates.push(`${field} = ?`);
        values.push(reEncrypted);
      } catch {
        // Both keys failed - might be plaintext or corrupted, skip
        continue;
      }
    }

    if (updates.length > 0) {
      values.push(row.id);
      db.run(`UPDATE notification_accounts SET ${updates.join(', ')} WHERE id = ?`, values);
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    console.log(`[Migration] Migrated ${migratedCount} notification account(s) from legacy key`);
  }

  // Migrate user_configs
  const configFields = [
    'encrypted_resend_key', 'encrypted_github_token', 'encrypted_feishu_webhook',
    'encrypted_wecom_webhook', 'encrypted_dingtalk_webhook', 'encrypted_dingtalk_secret',
    'encrypted_telegram_bot_token', 'encrypted_discord_webhook', 'encrypted_slack_webhook',
    'encrypted_wxpusher_app_token', 'encrypted_wxpusher_uid', 'encrypted_qmsg_key',
    'encrypted_qmsg_qq', 'encrypted_channel_webhooks'
  ];

  const configStmt = db.prepare(`SELECT user_id, ${configFields.join(', ')} FROM user_configs`);
  const configRows: Array<{ user_id: number; [key: string]: any }> = [];
  while (configStmt.step()) {
    configRows.push(configStmt.getAsObject() as any);
  }
  configStmt.free();

  let configMigratedCount = 0;
  for (const row of configRows) {
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of configFields) {
      const value = row[field];
      if (!value) continue;

      // Try decrypting with current key
      try {
        decrypt(value, currentKey);
        continue; // Already encrypted with current key
      } catch {
        // Current key failed
      }

      // Try legacy key
      try {
        const plaintext = decrypt(value, LEGACY_MASTER_KEY);
        const reEncrypted = encrypt(plaintext, currentKey);
        updates.push(`${field} = ?`);
        values.push(reEncrypted);
      } catch {
        // Both keys failed, skip
        continue;
      }
    }

    if (updates.length > 0) {
      values.push(row.user_id);
      db.run(`UPDATE user_configs SET ${updates.join(', ')} WHERE user_id = ?`, values);
      configMigratedCount++;
    }
  }

  if (configMigratedCount > 0) {
    console.log(`[Migration] Migrated ${configMigratedCount} user config(s) from legacy key`);
  }

  if (migratedCount === 0 && configMigratedCount === 0) {
    console.log('[Migration] No legacy-encrypted data found, encryption migration complete');
  }
}
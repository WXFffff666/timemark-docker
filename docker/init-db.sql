-- Enable pgcrypto for TDE
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- users 表
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- sessions 表
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  device_fingerprint TEXT,
  is_trusted BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- events 表
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  calendar_type VARCHAR(20) DEFAULT 'gregorian',
  lunar_date VARCHAR(50),
  reminder_config JSON,
  reminder_emails JSON,
  reminder_template TEXT,
  reminder_time TIME DEFAULT '09:00',
  reminder_days_before JSON DEFAULT '[1, 3, 7]',
  notification_channels JSON DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_events_user_date ON events(user_id, date);

-- email_logs 表
CREATE TABLE email_logs (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  recipient VARCHAR(255) NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL,
  message_id TEXT
);
CREATE INDEX idx_email_logs_sent_at ON email_logs(sent_at);

-- login_logs 表（安全审计）
CREATE TABLE login_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_fingerprint TEXT,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_login_logs_login_time ON login_logs(login_time);

-- login_attempts 表
CREATE TABLE login_attempts (
  id SERIAL PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL,
  type VARCHAR(10) NOT NULL,
  failed_count INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(identifier, type)
);
CREATE INDEX idx_login_attempts_identifier ON login_attempts(identifier, type);

-- user_configs 表
CREATE TABLE user_configs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_resend_key TEXT,
  encrypted_github_token TEXT,
  encrypted_feishu_webhook TEXT,
  encrypted_wecom_webhook TEXT,
  encrypted_dingtalk_webhook TEXT,
  encrypted_dingtalk_secret TEXT,
  encrypted_telegram_bot_token TEXT,
  telegram_chat_id VARCHAR(255),
  reminder_settings JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

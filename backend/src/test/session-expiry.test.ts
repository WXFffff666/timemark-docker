import initSqlJs from 'sql.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../db/index.js', () => ({ query: mocks.query }));

import { getSessionByToken, rotateSessionRefreshToken } from '../services/session.service.js';

describe('session expiry checks', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('rejects an expired ISO timestamp even when it expired earlier today', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE sessions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      token TEXT,
      device_fingerprint TEXT,
      is_trusted INTEGER,
      expires_at TEXT,
      refresh_token_id TEXT
    )`);
    db.run(
      'INSERT INTO sessions (user_id, token, device_fingerprint, is_trusted, expires_at, refresh_token_id) VALUES (?, ?, ?, ?, ?, ?)',
      [7, 'expired-session', 'device', 0, `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`, 'refresh-current'],
    );

    mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqliteSql = sql.replace(/\$\d+/g, '?');
      if (/^\s*SELECT\b/i.test(sql)) {
        const statement = db.prepare(sqliteSql);
        statement.bind(params);
        const rows: Record<string, unknown>[] = [];
        while (statement.step()) rows.push(statement.getAsObject());
        statement.free();
        return { rows, rowCount: rows.length };
      }
      db.run(sqliteSql, params);
      return { rows: [], rowCount: db.getRowsModified() };
    });

    await expect(getSessionByToken('expired-session')).resolves.toBeNull();
    await expect(
      rotateSessionRefreshToken('expired-session', 'refresh-current', 'refresh-next'),
    ).resolves.toBe(false);

    const rows = db.exec('SELECT refresh_token_id FROM sessions WHERE token = \'expired-session\'');
    expect(rows[0].values[0][0]).toBe('refresh-current');
    db.close();
  });
});

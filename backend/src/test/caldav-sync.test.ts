import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, safeAxiosGetMock, warnMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  safeAxiosGetMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ query: queryMock }));
vi.mock('../utils/safe-http.js', () => ({ safeAxiosGet: safeAxiosGetMock }));
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ warn: warnMock }),
}));

import { syncAllCalDavSubscriptions } from '../services/caldav-sync.service.js';

const eventCalendar = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'SUMMARY:Redirect body must not be imported',
  'DTSTART;VALUE=DATE:20261001',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

beforeEach(() => {
  warnMock.mockReset();
  queryMock.mockReset().mockImplementation(async (sql: string) => {
    if (String(sql).includes('SELECT user_id')) {
      return {
        rows: [{ user_id: 7, caldav_url: 'https://caldav.example/calendar.ics' }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  });
  safeAxiosGetMock.mockReset().mockResolvedValue({ status: 302, data: eventCalendar });
});

describe('syncAllCalDavSubscriptions', () => {
  it('does not include transport credentials in logged CalDAV errors', async () => {
    const marker = 'test-credential-marker';
    const error = Object.assign(new Error('request failed'), {
      config: { auth: { username: 'caldav-user', password: marker }, url: `https://caldav-user:${marker}@caldav.example/calendar.ics` },
    });
    safeAxiosGetMock.mockRejectedValue(error);

    await syncAllCalDavSubscriptions();

    expect(warnMock).toHaveBeenCalled();
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain(marker);
  });

  it('does not import the body of a redirect response', async () => {
    const result = await syncAllCalDavSubscriptions();

    expect(result.synced).toBe(0);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO events'))).toBe(false);
  });

  it('imports a supported date-only event', async () => {
    safeAxiosGetMock.mockResolvedValue({ status: 200, data: eventCalendar });

    const result = await syncAllCalDavSubscriptions();

    expect(result.synced).toBe(1);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO events'))).toBe(true);
  });

  it.each([
    ['unqualified date-only value', 'DTSTART:20261001'],
    ['date-time value', 'DTSTART:20261001T193000Z'],
    ['invalid date-only value', 'DTSTART;VALUE=DATE:20260230'],
  ])('does not import a VEVENT with unsupported %s', async (_caseName, dtstart) => {
    safeAxiosGetMock.mockResolvedValue({
      status: 200,
      data: [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'SUMMARY:Unsupported event',
        dtstart,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join(String.fromCharCode(13, 10)),
    });

    const result = await syncAllCalDavSubscriptions();

    expect(result.synced).toBe(0);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO events'))).toBe(false);
  });

  it.each([
    ['http://caldav.example/calendar.ics', 'account'],
    ['http://account:[REDACTED]@caldav.example/calendar.ics', ''],
  ])('does not send credentials over HTTP (%s)', async (url, username) => {
    queryMock.mockResolvedValue({
      rows: [{
        user_id: 7,
        caldav_url: url,
        caldav_username: username,
        caldav_password_encrypted: '',
      }],
      rowCount: 1,
    });
    safeAxiosGetMock.mockClear();

    await syncAllCalDavSubscriptions();

    expect(safeAxiosGetMock).not.toHaveBeenCalled();
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO events'))).toBe(false);
  });
});

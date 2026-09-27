import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, queryTransactionMock, safeAxiosGetMock, createEventMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  queryTransactionMock: vi.fn(),
  safeAxiosGetMock: vi.fn(),
  createEventMock: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  query: queryMock,
  queryTransaction: queryTransactionMock,
}));
vi.mock('../utils/safe-http.js', () => ({ safeAxiosGet: safeAxiosGetMock }));
vi.mock('../services/event.service.js', () => ({ createEvent: createEventMock }));

import { syncAllExternalCalendars, syncExternalCalendarsForUser } from '../services/calendar-sync.service.js';

const feed = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//TimeMark//Calendar Sync Test//EN',
  'BEGIN:VEVENT',
  'SUMMARY:Replacement event',
  'DTSTART;VALUE=DATE:20261001',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

beforeEach(() => {
  queryMock.mockReset().mockResolvedValue({
    rows: [{
      external_calendar_urls: JSON.stringify(['https://calendar.example/events.ics']),
      external_calendar_sync_strategy: 'replace',
    }],
    rowCount: 1,
  });
  queryTransactionMock.mockReset().mockResolvedValue([
    { rows: [], rowCount: 2 },
    { rows: [], rowCount: 1 },
  ]);
  safeAxiosGetMock.mockReset().mockResolvedValue({ status: 200, data: feed });
  createEventMock.mockReset().mockResolvedValue({ id: 1 });
});

describe('syncExternalCalendarsForUser replace strategy', () => {
  it('preserves existing imports when a feed fetch fails', async () => {
    safeAxiosGetMock.mockRejectedValue(new Error('DNS unavailable'));

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 0, deleted: 0 });
    expect(result.errors).toHaveLength(1);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM events'))).toBe(false);
    expect(queryTransactionMock).not.toHaveBeenCalled();
  });

  it('preserves existing imports when a successful HTTP response is not a calendar', async () => {
    safeAxiosGetMock.mockResolvedValue({ status: 200, data: '<html>upstream error</html>' });

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 0, deleted: 0 });
    expect(result.errors).toHaveLength(1);
    expect(queryTransactionMock).not.toHaveBeenCalled();
  });

  it('preserves existing imports when a VEVENT cannot be parsed', async () => {
    safeAxiosGetMock.mockResolvedValue({
      status: 200,
      data: [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TimeMark//Calendar Sync Test//EN',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261001',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join(String.fromCharCode(13, 10)),
    });

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 0, deleted: 0 });
    expect(result.errors).toHaveLength(1);
    expect(queryTransactionMock).not.toHaveBeenCalled();
  });

  it('does not delete imports when calendar markers appear only inside malformed text', async () => {
    safeAxiosGetMock.mockResolvedValue({
      status: 200,
      data: 'not an iCalendar document: BEGIN:VCALENDAR ... END:VCALENDAR',
    });

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 0, deleted: 0 });
    expect(result.errors).toHaveLength(1);
    expect(queryTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ['date-time DTSTART', ['DTSTART:20261001T193000Z']],
    ['invalid calendar date', ['DTSTART;VALUE=DATE:20260230']],
    ['unqualified eight-digit DTSTART', ['DTSTART:20261001']],
    ['duplicate DTSTART properties', [
      'DTSTART;VALUE=DATE:20261001',
      'DTSTART;VALUE=DATE:20261002',
    ]],
  ])('preserves imports when a VEVENT has unsupported %s', async (_caseName, dateLines) => {
    safeAxiosGetMock.mockResolvedValue({
      status: 200,
      data: [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TimeMark//Calendar Sync Test//EN',
        'BEGIN:VEVENT',
        'SUMMARY:Unsupported date event',
        ...dateLines,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join(String.fromCharCode(13, 10)),
    });

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 0, deleted: 0 });
    expect(result.errors).toHaveLength(1);
    expect(queryTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ['headers nested in an event', [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'VERSION:2.0',
      'PRODID:-//TimeMark//Calendar Sync Test//EN',
      'SUMMARY:Misplaced headers',
      'DTSTART;VALUE=DATE:20261001',
      'END:VEVENT',
      'END:VCALENDAR',
    ]],
    ['unsupported VTODO component', [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeMark//Calendar Sync Test//EN',
      'BEGIN:VTODO',
      'SUMMARY:Unsupported task',
      'DTSTART;VALUE=DATE:20261001',
      'END:VTODO',
      'END:VCALENDAR',
    ]],
    ['empty VTIMEZONE', [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeMark//Calendar Sync Test//EN',
      'BEGIN:VTIMEZONE',
      'TZID:Test/Zone',
      'END:VTIMEZONE',
      'END:VCALENDAR',
    ]],
    ['empty STANDARD component', [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeMark//Calendar Sync Test//EN',
      'BEGIN:VTIMEZONE',
      'TZID:Test/Zone',
      'BEGIN:STANDARD',
      'END:STANDARD',
      'END:VTIMEZONE',
      'END:VCALENDAR',
    ]],
    ['invalid timezone observance DTSTART', [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeMark//Calendar Sync Test//EN',
      'BEGIN:VTIMEZONE',
      'TZID:Test/Zone',
      'BEGIN:STANDARD',
      'DTSTART:garbage',
      'TZOFFSETFROM:-0400',
      'TZOFFSETTO:-0500',
      'END:STANDARD',
      'END:VTIMEZONE',
      'END:VCALENDAR',
    ]],
    ['invalid timezone offset', [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeMark//Calendar Sync Test//EN',
      'BEGIN:VTIMEZONE',
      'TZID:Test/Zone',
      'BEGIN:STANDARD',
      'DTSTART:20261001T020000',
      'TZOFFSETFROM:bogus',
      'TZOFFSETTO:-0500',
      'END:STANDARD',
      'END:VTIMEZONE',
      'END:VCALENDAR',
    ]],
    ['invalid timezone date', [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeMark//Calendar Sync Test//EN',
      'BEGIN:VTIMEZONE',
      'TZID:Test/Zone',
      'BEGIN:STANDARD',
      'DTSTART:20260230T020000',
      'TZOFFSETFROM:-0400',
      'TZOFFSETTO:-0500',
      'END:STANDARD',
      'END:VTIMEZONE',
      'END:VCALENDAR',
    ]],
    ['out-of-range timezone offset', [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeMark//Calendar Sync Test//EN',
      'BEGIN:VTIMEZONE',
      'TZID:Test/Zone',
      'BEGIN:STANDARD',
      'DTSTART:20261001T020000',
      'TZOFFSETFROM:+2500',
      'TZOFFSETTO:-0500',
      'END:STANDARD',
      'END:VTIMEZONE',
      'END:VCALENDAR',
    ]],
  ])('preserves imports when the feed has %s', async (_caseName, lines) => {
    safeAxiosGetMock.mockResolvedValue({
      status: 200,
      data: lines.join(String.fromCharCode(13, 10)),
    });

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 0, deleted: 0 });
    expect(result.errors).toHaveLength(1);
    expect(queryTransactionMock).not.toHaveBeenCalled();
  });

  it('does not send HTTP requests to external calendar URLs with userinfo', async () => {
    const url = 'http://calendar-user:[REDACTED]@calendar.example/events.ics';
    queryMock.mockResolvedValue({
      rows: [{ external_calendar_urls: JSON.stringify([url]), external_calendar_sync_strategy: 'replace' }],
      rowCount: 1,
    });

    const result = await syncExternalCalendarsForUser(7);

    expect(safeAxiosGetMock).not.toHaveBeenCalled();
    expect(queryTransactionMock).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.errors.join(' ')).not.toContain('[REDACTED]');
  });

  it('accepts well-formed VTIMEZONE observances in replace mode', async () => {
    safeAxiosGetMock.mockResolvedValue({
      status: 200,
      data: [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TimeMark//Calendar Sync Test//EN',
        'BEGIN:VTIMEZONE',
        'TZID:America/New_York',
        'BEGIN:STANDARD',
        'DTSTART:20261101T020000',
        'TZOFFSETFROM:-0400',
        'TZOFFSETTO:-0500',
        'END:STANDARD',
        'BEGIN:DAYLIGHT',
        'DTSTART:20260308T020000',
        'TZOFFSETFROM:-0500',
        'TZOFFSETTO:-0400',
        'END:DAYLIGHT',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'SUMMARY:Valid timezone event',
        'DTSTART;VALUE=DATE:20261001',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join(String.fromCharCode(13, 10)),
    });

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 1, deleted: 2, errors: [] });
    expect(queryTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('allows a valid empty calendar to clear prior imports in replace mode', async () => {
    queryTransactionMock.mockResolvedValue([{ rows: [], rowCount: 2 }]);
    safeAxiosGetMock.mockResolvedValue({
      status: 200,
      data: [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TimeMark//Calendar Sync Test//EN',
        'END:VCALENDAR',
      ].join(String.fromCharCode(13, 10)),
    });

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 0, deleted: 2, errors: [] });
    expect(queryTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('filters bulk sync users with SQLite-compatible JSON parsing', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('SELECT user_id, external_calendar_urls')) {
        return {
          rows: [
            { user_id: 8, external_calendar_urls: '[]' },
            { user_id: 9, external_calendar_urls: JSON.stringify(['https://calendar.example/events.ics']) },
            { user_id: 10, external_calendar_urls: ['https://calendar.example/events.ics'] },
          ],
          rowCount: 3,
        };
      }
      if (String(sql).includes('SELECT external_calendar_urls')) {
        return {
          rows: [{
            external_calendar_urls: JSON.stringify(['https://calendar.example/events.ics']),
            external_calendar_sync_strategy: 'add_only',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await syncAllExternalCalendars();

    expect(queryMock.mock.calls[0][0]).not.toContain('jsonb_array_length');
    expect(safeAxiosGetMock).toHaveBeenCalledTimes(2);
    expect(createEventMock).toHaveBeenCalledTimes(2);
  });

  it('preserves existing imports when more than five replacement sources are configured', async () => {
    const urls = Array.from({ length: 6 }, (_, index) => `https://calendar${index}.example/events.ics`);
    queryMock.mockResolvedValue({
      rows: [{ external_calendar_urls: JSON.stringify(urls), external_calendar_sync_strategy: 'replace' }],
      rowCount: 1,
    });

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 0, deleted: 0 });
    expect(result.errors).toHaveLength(1);
    expect(safeAxiosGetMock).not.toHaveBeenCalled();
    expect(queryTransactionMock).not.toHaveBeenCalled();
  });

  it('preserves existing imports when a replacement feed exceeds the event limit', async () => {
    const bulkFeed = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeMark//Calendar Sync Test//EN',
      ...Array.from({ length: 101 }, (_, index) => [
        'BEGIN:VEVENT',
        `SUMMARY:Replacement event ${index}`,
        'DTSTART;VALUE=DATE:20261001',
        'END:VEVENT',
      ]).flat(),
      'END:VCALENDAR',
    ].join(String.fromCharCode(13, 10));
    safeAxiosGetMock.mockResolvedValue({ status: 200, data: bulkFeed });

    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 0, deleted: 0 });
    expect(result.errors).toHaveLength(1);
    expect(queryTransactionMock).not.toHaveBeenCalled();
  });

  it('replaces imported rows in one database transaction after fetching succeeds', async () => {
    const result = await syncExternalCalendarsForUser(7);

    expect(result).toMatchObject({ imported: 1, deleted: 2, errors: [] });
    expect(queryTransactionMock).toHaveBeenCalledTimes(1);
    const statements = queryTransactionMock.mock.calls[0][0];
    expect(String(statements[0].text)).toContain('DELETE FROM events');
    expect(String(statements[1].text)).toContain('INSERT INTO events');
    expect(statements[1].params).toContain('Replacement event');
  });
});

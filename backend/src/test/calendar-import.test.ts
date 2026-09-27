import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createEvent: vi.fn(),
  authMiddleware: vi.fn(async (c: any, next: () => Promise<void>) => {
    c.set('user', { id: '7', username: 'admin' });
    await next();
  }),
  getRequestOrigin: vi.fn(() => 'https://app.example.com'),
}));

vi.mock('../db/index.js', () => ({ query: mocks.query }));
vi.mock('../services/event.service.js', () => ({ createEvent: mocks.createEvent }));
vi.mock('../middleware/auth.middleware.js', () => ({ authMiddleware: mocks.authMiddleware }));
vi.mock('../utils/client-ip.js', () => ({ getRequestOrigin: mocks.getRequestOrigin }));

import calendarImport from '../routes/calendar-import.js';

beforeEach(() => {
  mocks.query.mockReset();
  mocks.createEvent.mockReset();
});

describe('calendar integration settings', () => {
  it('parses SQLite JSON text when returning saved integration lists', async () => {
    mocks.query.mockResolvedValue({
      rows: [{
        webhook_inbound_token: null,
        calendar_feed_token: null,
        calendar_feed_tokens: JSON.stringify([{ name: 'Primary', token: 'feed-token-1' }]),
        external_calendar_urls: JSON.stringify(['https://calendar.example/events.ics']),
        external_calendar_sync_strategy: 'replace',
        inbox_receive_token: null,
      }],
      rowCount: 1,
    });

    const response = await calendarImport.request('/integrations');
    const result = await response.json() as any;

    expect(response.status).toBe(200);
    expect(result.data.calendarFeedTokens).toEqual([{
      name: 'Primary',
      url: 'https://app.example.com/api/calendar/feed/feed-token-1.ics',
    }]);
    expect(result.data.externalCalendarUrls).toEqual(['https://calendar.example/events.ics']);
  });

  it('preserves existing feed tokens when appending a token to SQLite JSON text', async () => {
    const existing = [{ name: 'Primary', token: 'feed-token-1' }];
    mocks.query
      .mockResolvedValueOnce({ rows: [{ calendar_feed_tokens: JSON.stringify(existing) }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const response = await calendarImport.request('/feed-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Secondary' }),
    });

    expect(response.status).toBe(200);
    const stored = JSON.parse(mocks.query.mock.calls[1][1][0] as string);
    expect(stored).toHaveLength(2);
    expect(stored[0]).toEqual(existing[0]);
    expect(stored[1].name).toBe('Secondary');
  });

  it('refuses to overwrite feed tokens when saved SQLite JSON is malformed', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ calendar_feed_tokens: '{broken' }], rowCount: 1 });

    const response = await calendarImport.request('/feed-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Secondary' }),
    });

    expect(response.status).toBe(500);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('rejects over-limit source lists instead of truncating replacement settings', async () => {
    const externalCalendarUrls = Array.from(
      { length: 6 },
      (_, index) => `https://calendar${index}.example/events.ics`,
    );

    const response = await calendarImport.request('/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalCalendarUrls, externalCalendarSyncStrategy: 'replace' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

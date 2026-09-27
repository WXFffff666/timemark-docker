import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosGetMock, lookupMock } = vi.hoisted(() => ({
  axiosGetMock: vi.fn(),
  lookupMock: vi.fn(),
}));

vi.mock('axios', () => ({
  default: { get: axiosGetMock },
}));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

import { safeAxiosGet } from '../utils/safe-http.js';

beforeEach(() => {
  axiosGetMock.mockReset().mockResolvedValue({ status: 200, data: 'calendar-data' });
  lookupMock.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

function invokePinnedLookup(lookup: (...args: any[]) => void) {
  return new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    lookup('calendar.example', { all: true }, (error: Error | null, addresses: unknown) => {
      if (error) return reject(error);
      resolve(addresses as Array<{ address: string; family: number }>);
    });
  });
}

describe('safeAxiosGet', () => {
  it('pins the request to the addresses checked during validation', async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);

    const response = await safeAxiosGet('https://calendar.example/events.ics', {
      timeout: 15000,
    });

    expect(response.data).toBe('calendar-data');
    expect(lookupMock).toHaveBeenCalledTimes(1);

    const config = axiosGetMock.mock.calls[0][1];
    expect(config).toMatchObject({
      adapter: 'http',
      maxRedirects: 0,
      maxContentLength: 10 * 1024 * 1024,
      proxy: false,
    });
    const lookup = config.httpsAgent.options.lookup;
    await expect(invokePinnedLookup(lookup)).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it('does not make a request when hostname resolution fails', async () => {
    lookupMock.mockRejectedValue(new Error('DNS unavailable'));

    await expect(safeAxiosGet('https://calendar.example/events.ics')).rejects.toThrow();
    expect(axiosGetMock).not.toHaveBeenCalled();
  });
});

import { Hono } from 'hono';
import {
  DEFAULT_SYNC_TIMEZONE,
  formatLocalHHmm,
  formatTodayYmd,
  getClockOffsetMs,
  getLastTimeSyncResult,
  getSyncedNow,
  scheduleTimeSync,
  syncTime,
} from '../utils/ntp.js';
import { runLunarCalendarSelfTest } from '@timemark/shared/lunar-calendar';
import { lunarConverter } from '../utils/lunar-converter.js';

const timeRoutes = new Hono();

/** 公开：时间/NTP/双历自检（不阻塞，默认读缓存） */
timeRoutes.get('/status', async (c) => {
  const requestedTz = c.req.query('timezone')?.trim() || DEFAULT_SYNC_TIMEZONE;
  const force = c.req.query('refresh') === '1';

  let sync;
  if (force) {
    sync = await syncTime(requestedTz, { force: true });
  } else {
    const cached = getLastTimeSyncResult(requestedTz);
    if (cached) {
      sync = cached;
      scheduleTimeSync(requestedTz);
    } else {
      scheduleTimeSync(requestedTz);
      const now = new Date();
      sync = {
        success: true,
        timeZone: requestedTz,
        currentTime: now,
        serverTime: now,
        todayYmd: formatTodayYmd(now, requestedTz),
        localTimeHHmm: formatLocalHHmm(now, requestedTz),
        source: 'system',
        message: 'Using system time (background NTP sync started)',
      };
    }
  }

  const calendarVerify = runLunarCalendarSelfTest(lunarConverter);
  const now = getSyncedNow(requestedTz);

  return c.json({
    success: true,
    data: {
      timeZone: sync.timeZone,
      serverNow: now.toISOString(),
      todayYmd: sync.todayYmd,
      localTimeHHmm: sync.localTimeHHmm,
      clockOffsetMs: getClockOffsetMs(requestedTz),
      driftMs: sync.drift ?? 0,
      source: sync.source,
      message: sync.message,
      calendarVerify,
    },
  });
});

export default timeRoutes;

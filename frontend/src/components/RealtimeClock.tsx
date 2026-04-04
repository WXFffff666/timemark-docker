import { useEffect, useMemo, useState } from 'react';
import { Solar } from 'lunar-javascript';

const timezones = [
  { value: 'Asia/Shanghai', label: '北京时间 (UTC+8)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Tokyo', label: '东京 (UTC+9)' },
  { value: 'America/Los_Angeles', label: '洛杉矶 (UTC-7/-8)' },
];

const solarFestivalMap: Record<string, string> = {
  '1-1': '元旦',
  '2-14': '情人节',
  '5-1': '劳动节',
  '10-1': '国庆节',
  '12-25': '圣诞节',
};

function getFestivalLabel(date: Date): string {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();
  const solarFestivals = solar.getFestivals?.() || [];
  const lunarFestivals = lunar.getFestivals?.() || [];

  if (solarFestivals.length > 0) {
    return solarFestivals[0];
  }

  if (lunarFestivals.length > 0) {
    return lunarFestivals[0];
  }

  const fallback = `${date.getMonth() + 1}-${date.getDate()}`;
  return solarFestivalMap[fallback] || '无节日';
}

export function RealtimeClock() {
  const [timezone, setTimezone] = useState<string>(() => localStorage.getItem('timemark_timezone') || 'Asia/Shanghai');
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    localStorage.setItem('timemark_timezone', timezone);
  }, [timezone]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const display = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    return formatter.format(now);
  }, [now, timezone]);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
      <span>{display}</span>
      <span>· {getFestivalLabel(now)}</span>
      <select
        value={timezone}
        onChange={(event) => setTimezone(event.target.value)}
        className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-900"
        aria-label="切换时区"
      >
        {timezones.map((zone) => (
          <option key={zone.value} value={zone.value}>
            {zone.label}
          </option>
        ))}
      </select>
    </div>
  );
}

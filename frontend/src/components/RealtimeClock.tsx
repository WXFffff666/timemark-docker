import { useEffect, useMemo, useState } from 'react';
import { Solar } from 'lunar-javascript';

function getNowParts() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).format(now);

  const time = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);

  return { date, time, solar: Solar.fromDate(now) };
}

export function RealtimeClock() {
  const [tick, setTick] = useState(() => getNowParts());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(getNowParts()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const festival = useMemo(() => {
    const solarFestivals = tick.solar.getFestivals?.() || [];
    const lunarFestivals = tick.solar.getLunar().getFestivals?.() || [];
    const names = [...solarFestivals, ...lunarFestivals].filter(Boolean);
    return names.length > 0 ? names.join(' / ') : '无节日';
  }, [tick]);

  return (
    <div className="text-right hidden md:block">
      <p className="text-xs text-gray-500 dark:text-gray-400">{tick.date}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{tick.time}</p>
      <p className="text-xs text-primary-600 dark:text-primary-400">{festival}</p>
    </div>
  );
}

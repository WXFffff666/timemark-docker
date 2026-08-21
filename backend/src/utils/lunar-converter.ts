import { Lunar, Solar } from 'lunar-javascript';
import type { LunarConverter, LunarDateParts } from '@timemark/shared/lunar-calendar';

export const lunarConverter: LunarConverter = {
  gregorianToLunar(ymd: string): LunarDateParts | null {
    try {
      const date = new Date(`${ymd.slice(0, 10)}T00:00:00`);
      if (Number.isNaN(date.getTime())) return null;
      const lunar = Solar.fromDate(date).getLunar();
      const month = lunar.getMonth();
      return {
        year: lunar.getYear(),
        month: Math.abs(month),
        day: lunar.getDay(),
        isLeap: month < 0,
      };
    } catch {
      return null;
    }
  },

  lunarToGregorian(lunar: LunarDateParts): string | null {
    try {
      const { year, month, day, isLeap } = lunar;
      const solar = Lunar.fromYmd(year, isLeap ? -month : month, day).getSolar();
      return `${solar.getYear()}-${String(solar.getMonth()).padStart(2, '0')}-${String(solar.getDay()).padStart(2, '0')}`;
    } catch {
      return null;
    }
  },
};

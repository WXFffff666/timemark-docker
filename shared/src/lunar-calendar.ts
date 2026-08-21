/**
 * 公历 ↔ 农历转换校验（与 lunar-javascript 约定一致）
 * 供前后端 NTP/双历自检共用
 */

export interface LunarDateParts {
  year: number;
  month: number;
  day: number;
  isLeap?: boolean;
}

export interface LunarConverter {
  gregorianToLunar(ymd: string): LunarDateParts | null;
  lunarToGregorian(lunar: LunarDateParts): string | null;
}

export interface LunarVerifySample {
  gregorian: string;
  lunar: LunarDateParts;
  roundtrip: string | null;
  ok: boolean;
}

/** 已知公历样本，用于 NTP/双历自检（仅验证往返一致性） */
export const LUNAR_VERIFY_GREGORIAN_SAMPLES = [
  '2026-01-29',
  '2026-07-31',
  '2007-08-07',
  '1990-07-28',
];

/** @deprecated 使用 LUNAR_VERIFY_GREGORIAN_SAMPLES */
export const LUNAR_VERIFY_SAMPLES: Array<{ gregorian: string; lunar: LunarDateParts }> = [];

export function verifyLunarGregorianRoundtrip(
  converter: LunarConverter,
  gregorian: string,
  expectedLunar?: LunarDateParts,
): LunarVerifySample {
  const lunar = converter.gregorianToLunar(gregorian);
  const roundtrip = lunar ? converter.lunarToGregorian(lunar) : null;
  const ok =
    !!lunar
    && roundtrip === gregorian.slice(0, 10)
    && (!expectedLunar
      || (lunar.year === expectedLunar.year
        && lunar.month === expectedLunar.month
        && lunar.day === expectedLunar.day
        && !!lunar.isLeap === !!expectedLunar.isLeap));

  return { gregorian: gregorian.slice(0, 10), lunar: lunar!, roundtrip, ok };
}

export function runLunarCalendarSelfTest(converter: LunarConverter): {
  ok: boolean;
  samples: LunarVerifySample[];
} {
  const samples = LUNAR_VERIFY_GREGORIAN_SAMPLES.map((gregorian) =>
    verifyLunarGregorianRoundtrip(converter, gregorian),
  );
  return { ok: samples.every((s) => s.ok), samples };
}

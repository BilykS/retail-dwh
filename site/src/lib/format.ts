import type { Locale } from '../i18n/index.ts';

const INTL: Record<Locale, string> = { en: 'en-US', uk: 'uk-UA' };

const UNITS: Record<Locale, { bn: string; m: string; k: string }> = {
  en: { bn: 'bn', m: 'M', k: 'k' },
  uk: { bn: 'млрд', m: 'млн', k: 'тис' },
};

/**
 * Number formatting for one locale. Used at build time for static figures and
 * in the browser by the report, so both always agree.
 */
export function formatter(lang: Locale) {
  const number = (n: number, digits: number) =>
    n
      .toLocaleString(INTL[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits })
      // Some locales emit U+2212. A plain hyphen keeps every negative alike.
      .replace(/−/g, '-');

  const units = UNITS[lang];

  return {
    /** 233015 becomes "233,015" or "233 015". */
    int: (n: number) => number(Math.round(n), 0),
    /** Fixed decimals: dec(32.96, 2) becomes "32.96" or "32,96". */
    dec: number,
    /** Short form for tiles and bars: 2196102912 becomes "2.20 bn" or "2,20 млрд". */
    compact: (n: number) => {
      const a = Math.abs(n);
      if (a >= 1e9) return `${number(n / 1e9, 2)} ${units.bn}`;
      if (a >= 1e6) return `${number(n / 1e6, a >= 1e8 ? 0 : 1)} ${units.m}`;
      if (a >= 1e3) return `${number(n / 1e3, 0)} ${units.k}`;
      return number(Math.round(n), 0);
    },
    /** Signed value with a unit: signed(0.6, 1, "%") becomes "+0.6%". */
    signed: (n: number, digits: number, unit: string) => `${n > 0 ? '+' : ''}${number(n, digits)}${unit}`,
  };
}

export type Formatter = ReturnType<typeof formatter>;

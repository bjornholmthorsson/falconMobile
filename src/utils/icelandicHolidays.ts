/**
 * Icelandic public holidays for any year.
 *
 * Fixed dates: Jan 1, May 1, Jun 17, Dec 24, Dec 25, Dec 26, Dec 31.
 * Easter-relative: Maundy Thursday, Good Friday, Easter Sunday, Easter Monday,
 *   Ascension Day (Easter+39), Whit Sunday (Easter+49), Whit Monday (Easter+50).
 * Other movable: Sumardagurinn fyrsti (first Thursday after Apr 18),
 *   Frídagur verslunarmanna (first Monday of August).
 */

function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm (Computus)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function firstThursdayAfter(year: number, monthIdx: number, dayMin: number): Date {
  // Returns the first Thursday strictly after `dayMin` in the given month.
  // (Used for Sumardagurinn fyrsti — first Thursday after Apr 18.)
  let d = new Date(year, monthIdx, dayMin + 1);
  while (d.getDay() !== 4) d = addDays(d, 1);
  return d;
}

function firstMondayOf(year: number, monthIdx: number): Date {
  let d = new Date(year, monthIdx, 1);
  while (d.getDay() !== 1) d = addDays(d, 1);
  return d;
}

const cache = new Map<number, Set<string>>();

function holidaysFor(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  const set = new Set<string>([
    `${year}-01-01`,                               // Nýársdagur
    ymd(addDays(easter, -3)),                      // Skírdagur (Maundy Thursday)
    ymd(addDays(easter, -2)),                      // Föstudagurinn langi
    ymd(easter),                                   // Páskadagur
    ymd(addDays(easter, 1)),                       // Annar í páskum
    ymd(firstThursdayAfter(year, 3, 18)),          // Sumardagurinn fyrsti
    `${year}-05-01`,                               // Verkalýðsdagurinn
    ymd(addDays(easter, 39)),                      // Uppstigningardagur
    ymd(addDays(easter, 49)),                      // Hvítasunnudagur
    ymd(addDays(easter, 50)),                      // Annar í hvítasunnu
    `${year}-06-17`,                               // Þjóðhátíðardagurinn
    ymd(firstMondayOf(year, 7)),                   // Frídagur verslunarmanna (Aug)
    `${year}-12-24`,                               // Aðfangadagur (half day, treat as holiday)
    `${year}-12-25`,                               // Jóladagur
    `${year}-12-26`,                               // Annar í jólum
    `${year}-12-31`,                               // Gamlársdagur (half day)
  ]);

  cache.set(year, set);
  return set;
}

export function isIcelandicHoliday(date: string): boolean {
  const year = Number(date.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return holidaysFor(year).has(date);
}

export function isWeekend(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

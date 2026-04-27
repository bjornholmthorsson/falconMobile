/**
 * Builds the weekly lunch-orders summary as an xlsx file, mirroring the
 * "Matarpöntun fyrir viku nr. ##" layout used internally:
 *   • One block per weekday (Mon–Fri)
 *   • Columns: Gastró eða bakka | Kjöt | Ketó | Vegan | Salat | Fisk |
 *              Hamborgari | Óþol | Alls
 *   • Two service rows per day (Gastró and Bakka — we only fill Gastró)
 *   • A "Samtals fjöldi" total row per day
 */
import XLSX from 'xlsx';
import type { LunchOrdersSummary } from '../services/api';

const ICE_DAYS: Record<string, string> = {
  Monday: 'Mánudagur',
  Tuesday: 'Þriðjudagur',
  Wednesday: 'Miðvikudagur',
  Thursday: 'Fimmtudagur',
  Friday: 'Föstudagur',
};

const ICE_MONTHS = [
  'janúar', 'febrúar', 'mars',  'apríl', 'maí',  'júní',
  'júlí',   'ágúst',   'september', 'október', 'nóvember', 'desember',
];

function fmtIceDate(date: string): string {
  // 'YYYY-MM-DD' → 'D.month' in Icelandic (e.g. '27.apríl')
  const [, m, d] = date.split('-');
  return `${parseInt(d, 10)}.${ICE_MONTHS[parseInt(m, 10) - 1]}`;
}

// ISO-8601 week → Mon..Fri dates as 'YYYY-MM-DD'
function weekdays(year: number, week: number): { date: string; dayOfWeek: keyof typeof ICE_DAYS }[] {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (week - 1) * 7);
  const names: (keyof typeof ICE_DAYS)[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return names.map((dayOfWeek, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), dayOfWeek };
  });
}

// Maps DB category (English key in lunch_options) → xlsx column index
//   1 = Kjöt, 2 = Ketó, 3 = Vegan, 4 = Salat, 5 = Fisk, 6 = Hamborgari
const CAT_TO_COL: Record<string, number> = {
  Meat:   1,
  Keto:   2,
  Vegan:  3,
  Salad:  4,
  Fish:   5,
  Burger: 6,
};

export function generateLunchOrdersXlsxBase64(data: LunchOrdersSummary): string {
  const allDays = weekdays(data.year, data.week);
  const ordersByDate: Record<string, LunchOrdersSummary['days'][number]['orders']> = {};
  for (const d of data.days) ordersByDate[d.date] = d.orders;

  const rows: (string | number)[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];

  for (const ad of allDays) {
    if (rows.length > 0) rows.push([]); // blank separator
    const startRow = rows.length;

    const dayLabel = `${ICE_DAYS[ad.dayOfWeek]} ${fmtIceDate(ad.date)}`;
    rows.push([`Vika ${data.week}`, dayLabel]);
    merges.push({ s: { r: startRow, c: 1 }, e: { r: startRow, c: 8 } });

    rows.push(['Gastró eða bakka', 'Kjöt', 'Ketó', 'Vegan', 'Salat', 'Fisk', 'Hamborgari', 'Óþol', 'Alls']);

    const counts = [0, 0, 0, 0, 0, 0]; // Kjöt..Hamborgari
    for (const o of ordersByDate[ad.date] ?? []) {
      const col = CAT_TO_COL[o.category];
      if (typeof col === 'number') counts[col - 1] += 1;
    }
    const total = counts.reduce((a, b) => a + b, 0);

    rows.push(['Gastró',         ...counts, 0, total]);
    rows.push(['Bakka',          0, 0, 0, 0, 0, 0, 0, 0]);
    rows.push(['Samtals fjöldi', ...counts, 0, total]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 25 }, // A — Gastró eða bakka
    { wch: 8  }, // B — Kjöt
    { wch: 8  }, // C — Ketó
    { wch: 9  }, // D — Vegan
    { wch: 9  }, // E — Salat
    { wch: 8  }, // F — Fisk
    { wch: 18 }, // G — Hamborgari
    { wch: 12 }, // H — Óþol
    { wch: 8  }, // I — Alls
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

export function lunchOrdersXlsxFilename(data: LunchOrdersSummary): string {
  const ordered = data.days; // backend already returns days that have at least one order
  if (ordered.length === 0) return `Matarpöntun fyrir viku nr. ${data.week}.xlsx`;
  const first = ordered[0].date;
  const last  = ordered[ordered.length - 1].date;
  const [, mA, dA] = first.split('-');
  const [, mB, dB] = last.split('-');
  let range: string;
  if (mA === mB) {
    range = `${parseInt(dA, 10)}-${parseInt(dB, 10)}.${ICE_MONTHS[parseInt(mA, 10) - 1]}`;
  } else {
    range = `${parseInt(dA, 10)}.${ICE_MONTHS[parseInt(mA, 10) - 1]} - ${parseInt(dB, 10)}.${ICE_MONTHS[parseInt(mB, 10) - 1]}`;
  }
  return `Matarpöntun fyrir viku nr. ${data.week} - (${range}).xlsx`;
}

/**
 * Builds the weekly lunch-orders summary as an xlsx file with styling
 * mirroring the app's green palette. Uses xlsx-js-style (drop-in
 * SheetJS API with style support).
 */
import XLSX from 'xlsx-js-style';
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

// App palette (matches src/screens/* and the cloud header artwork)
const COLOR_PRIMARY      = '006559'; // dark teal (header bg)
const COLOR_PRIMARY_DARK = '004F47'; // title bar
const COLOR_ACCENT       = 'E6F4F1'; // pale teal (alt rows / col headers)
const COLOR_TOTALS_BG    = 'D1E7E2'; // a touch darker than accent for totals
const COLOR_BORDER       = 'B7CFCB';
const COLOR_TEXT_DARK    = '111827';
const COLOR_MUTED        = '6B7280';

function fmtIceDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${parseInt(d, 10)}.${ICE_MONTHS[parseInt(m, 10) - 1]}`;
}

function weekdays(year: number, week: number): { date: string; dayOfWeek: keyof typeof ICE_DAYS }[] {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (week - 1) * 7);
  const names: (keyof typeof ICE_DAYS)[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return names.map((dayOfWeek, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), dayOfWeek };
  });
}

const CAT_TO_COL: Record<string, number> = {
  Meat: 1, Keto: 2, Vegan: 3, Salad: 4, Fish: 5, Burger: 6,
};

// ── Style presets ────────────────────────────────────────────────────────────

const thinBorder = { style: 'thin', color: { rgb: COLOR_BORDER } };
const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

const titleStyle = {
  fill: { fgColor: { rgb: COLOR_PRIMARY_DARK } },
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 16 },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: allBorders,
};

const dayHeaderStyle = {
  fill: { fgColor: { rgb: COLOR_PRIMARY } },
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13 },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  border: allBorders,
};

const colHeaderStyle = {
  fill: { fgColor: { rgb: COLOR_ACCENT } },
  font: { bold: true, color: { rgb: COLOR_PRIMARY } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: allBorders,
};

const colHeaderStyleLeft = {
  ...colHeaderStyle,
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
};

const dataLabelStyle = {
  font: { color: { rgb: COLOR_TEXT_DARK } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  border: allBorders,
};

const dataNumStyle = {
  font: { color: { rgb: COLOR_TEXT_DARK } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: allBorders,
};

const dataNumZeroStyle = {
  font: { color: { rgb: COLOR_MUTED } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: allBorders,
};

const totalsLabelStyle = {
  fill: { fgColor: { rgb: COLOR_TOTALS_BG } },
  font: { bold: true, color: { rgb: COLOR_PRIMARY_DARK } },
  alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  border: allBorders,
};

const totalsNumStyle = {
  fill: { fgColor: { rgb: COLOR_TOTALS_BG } },
  font: { bold: true, color: { rgb: COLOR_PRIMARY_DARK } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: allBorders,
};

// ── Builder ──────────────────────────────────────────────────────────────────

type CellSpec = { v: string | number; t?: 's' | 'n'; s?: any };

export function generateLunchOrdersXlsxBase64(data: LunchOrdersSummary): string {
  const allDays = weekdays(data.year, data.week);
  const ordersByDate: Record<string, LunchOrdersSummary['days'][number]['orders']> = {};
  for (const d of data.days) ordersByDate[d.date] = d.orders;

  const rows: CellSpec[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const rowHeights: { hpt: number }[] = [];

  // ── Title block ────────────────────────────────────────────────────────────
  const titleRowIdx = rows.length;
  rows.push([
    { v: `Matarpöntun – Vika ${data.week}, ${data.year}`, t: 's', s: titleStyle },
  ]);
  // Stretch title across the full 9 columns
  merges.push({ s: { r: titleRowIdx, c: 0 }, e: { r: titleRowIdx, c: 8 } });
  rowHeights.push({ hpt: 28 });
  rows.push([{ v: '' }]); // spacer
  rowHeights.push({ hpt: 6 });

  for (const ad of allDays) {
    if (rows[rows.length - 1] && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0].v !== '') {
      rows.push([{ v: '' }]); // small gap between day blocks
      rowHeights.push({ hpt: 6 });
    }
    if (rows.length > 2 && rows[rows.length - 1][0].v === '' && rows.length === titleRowIdx + 2) {
      // already pushed spacer after title; nothing
    }

    // Day-header row: "Vika 18 — Mánudagur 27.apríl"
    const dayLabel = `Vika ${data.week} — ${ICE_DAYS[ad.dayOfWeek]} ${fmtIceDate(ad.date)}`;
    const dayRowIdx = rows.length;
    rows.push([{ v: dayLabel, t: 's', s: dayHeaderStyle }]);
    merges.push({ s: { r: dayRowIdx, c: 0 }, e: { r: dayRowIdx, c: 8 } });
    rowHeights.push({ hpt: 24 });

    // Column header row
    rows.push([
      { v: 'Gastró eða bakka', t: 's', s: colHeaderStyleLeft },
      { v: 'Kjöt',       t: 's', s: colHeaderStyle },
      { v: 'Ketó',       t: 's', s: colHeaderStyle },
      { v: 'Vegan',      t: 's', s: colHeaderStyle },
      { v: 'Salat',      t: 's', s: colHeaderStyle },
      { v: 'Fisk',       t: 's', s: colHeaderStyle },
      { v: 'Hamborgari', t: 's', s: colHeaderStyle },
      { v: 'Óþol',       t: 's', s: colHeaderStyle },
      { v: 'Alls',       t: 's', s: colHeaderStyle },
    ]);
    rowHeights.push({ hpt: 22 });

    // Counts
    const counts = [0, 0, 0, 0, 0, 0];
    for (const o of ordersByDate[ad.date] ?? []) {
      const col = CAT_TO_COL[o.category];
      if (typeof col === 'number') counts[col - 1] += 1;
    }
    const total = counts.reduce((a, b) => a + b, 0);

    const numCell = (n: number, style: any = dataNumStyle, zeroStyle: any = dataNumZeroStyle): CellSpec => ({
      v: n, t: 'n', s: n === 0 ? zeroStyle : style,
    });

    rows.push([
      { v: 'Gastró', t: 's', s: dataLabelStyle },
      numCell(counts[0]), numCell(counts[1]), numCell(counts[2]), numCell(counts[3]),
      numCell(counts[4]), numCell(counts[5]), numCell(0), numCell(total),
    ]);
    rowHeights.push({ hpt: 20 });

    rows.push([
      { v: 'Bakka', t: 's', s: dataLabelStyle },
      numCell(0), numCell(0), numCell(0), numCell(0), numCell(0), numCell(0), numCell(0), numCell(0),
    ]);
    rowHeights.push({ hpt: 20 });

    rows.push([
      { v: 'Samtals fjöldi', t: 's', s: totalsLabelStyle },
      numCell(counts[0], totalsNumStyle, totalsNumStyle),
      numCell(counts[1], totalsNumStyle, totalsNumStyle),
      numCell(counts[2], totalsNumStyle, totalsNumStyle),
      numCell(counts[3], totalsNumStyle, totalsNumStyle),
      numCell(counts[4], totalsNumStyle, totalsNumStyle),
      numCell(counts[5], totalsNumStyle, totalsNumStyle),
      numCell(0, totalsNumStyle, totalsNumStyle),
      numCell(total, totalsNumStyle, totalsNumStyle),
    ]);
    rowHeights.push({ hpt: 22 });
  }

  // Build the sheet from cell specs (preserving styles)
  const ws: any = {};
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      ws[addr] = { v: cell.v, t: cell.t ?? (typeof cell.v === 'number' ? 'n' : 's'), s: cell.s };
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: 8 } });
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 22 }, // A — Gastró eða bakka
    { wch: 9  }, // B — Kjöt
    { wch: 9  }, // C — Ketó
    { wch: 9  }, // D — Vegan
    { wch: 9  }, // E — Salat
    { wch: 9  }, // F — Fisk
    { wch: 14 }, // G — Hamborgari
    { wch: 10 }, // H — Óþol
    { wch: 9  }, // I — Alls
  ];
  ws['!rows'] = rowHeights;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pöntun');

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

export function lunchOrdersXlsxFilename(data: LunchOrdersSummary): string {
  const ordered = data.days;
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

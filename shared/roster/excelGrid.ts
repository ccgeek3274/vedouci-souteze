// ExcelJS worksheet → Grid (used by the web upload and by scripts/parse-soupiska.mjs).
// Typed structurally so shared/ does not depend on the exceljs package types.
import type { Grid } from './xlsx';

type CellLike = {
  value: unknown;
  isMerged: boolean;
  master: { address: string };
  address: string;
};
type WorksheetLike = {
  name: string;
  eachRow: (opts: { includeEmpty: boolean }, cb: (row: { eachCell: (o: { includeEmpty: boolean }, cb: (cell: CellLike, col: number) => void) => void }, rowNumber: number) => void) => void;
};

export function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    // Excel time-only cells (e.g. "10:00") come back as dates on the 1899-12-30 epoch.
    if (v.getUTCFullYear() < 1901) return `${v.getUTCHours()}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'object') {
    const o = v as any;
    if (Array.isArray(o.richText)) return o.richText.map((t: any) => t.text).join('');
    if (o.text != null) return cellText(o.text);
    if (o.result != null) return cellText(o.result);
    if (o.error) return '';
    return '';
  }
  return String(v);
}

export function worksheetToGrid(ws: WorksheetLike): Grid {
  const grid: Grid = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    const cells: (string | null)[] = [];
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;   // value lives in the master only
      const t = cellText(cell.value).trim();
      if (t) cells[c - 1] = t;
    });
    grid[r - 1] = cells;
  });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return grid;
}

/** Pick the roster sheet: the first one with a "Pořadí" table header, else the first sheet. */
export function pickRosterSheet<T extends WorksheetLike>(sheets: T[]): T | undefined {
  return sheets.find((ws) => worksheetToGrid(ws).some((row) => /^poradi\b/i.test((row[0] ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')))) ?? sheets[0];
}

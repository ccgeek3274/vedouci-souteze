// Page and table geometry of the úvodní zpravodaj (DXA = 1/20 pt), shared by DOCX, PDF and the HTML preview.
// Ported from uvodni-zpravodaj (A4, minimal printable margins, Calibri 12 pt, rosters in pairs side by side).

export const PAGE_W = 11906;
export const PAGE_H = 16838;
export const MARGIN_X = Math.round(0.7 * 567);
export const MARGIN_Y = Math.round(1.2 * 567);
export const HDR_DIST = Math.round(0.5 * 567);
export const CONTENT = PAGE_W - 2 * MARGIN_X;
export const FONT = 'Calibri';
export const FS = 24; // 12 pt in half-points
export const FS_NAME = 28; // 14 pt — team / month names above tables
export const cellLine = (size = FS) => size * 12;

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export { sum };

export const CELL_PAD = 50;
export const ROSTER_GAP = 200;
export const ROSTER_W = Math.floor((CONTENT - ROSTER_GAP) / 2);
const ROSTER_FIX = [360, 0, 640, 620, 300, 300, 380];
export const ROSTER_COLS = ROSTER_FIX.map((w) => w || ROSTER_W - sum(ROSTER_FIX));
const PAGE_BODY_H = PAGE_H - 2 * MARGIN_Y;
const ROSTER_FULL = 20;
export const ROSTER_TITLE_H = 420;
export const ROSTER_PAIR_GAP = 440;
export const GAP_PARA_H = 20;
export const ROSTER_ROW_H = Math.floor((PAGE_BODY_H - 100 - 2 * ROSTER_TITLE_H - ROSTER_PAIR_GAP - 2 * GAP_PARA_H) / (2 * (1 + ROSTER_FULL))) - 20;
export const ROSTER_HDRS = ['', 'Jméno', 'NRtg', 'IRtg', 'Z', 'P', 'K'];

export const SCHED_HDRS = ['Č.', 'St.', 'Družstvo', '-', 'Družstvo', 'St.', 'Rozhodčí'];
const COL_NR = 380, COL_STC = 460, COL_RES = 280, COL_REF = 2200;
/** Schedule columns: narrow fixed columns, the referee fixed, the team names share the rest. */
export function schedCols(withRef: boolean): number[] {
  const fixed = COL_NR + 2 * COL_STC + COL_RES + (withRef ? COL_REF : 0);
  const name = Math.floor((CONTENT - fixed) / 2);
  const cols = [COL_NR, COL_STC, name, COL_RES, name, COL_STC];
  if (withRef) cols.push(CONTENT - fixed - 2 * name + COL_REF);
  return cols;
}

/** Venues: start number | team | venue. */
export const VENUE_COLS = [460, 3700, CONTENT - 460 - 3700];
/** Address book: role | name | phone | e-mail (team name row spans all). */
export const CONTACT_COLS = [2200, 3300, 1700, CONTENT - 2200 - 3300 - 1700];

export const CAL_GAP = 400;
export const CAL_COL = Math.round(((CONTENT - CAL_GAP) / 14) * 0.9);
export const CAL_W = 14 * CAL_COL + CAL_GAP;

export const C_SUB = 'F2F2F2';
export const C_TIME = 'C00000';
export const C_CAL = 'C8D9F0';
export const C_WKND = '808080';
export const C_BORDER = 'AAAAAA';

/** Node ids of the sections (PDF ↔ preview page breaks, see pdf.ts). */
export const INTRO_ID = 'i.';
export const sectionId = (chapter: number, section: number) => `s${chapter}.${section}.`;

/** Address book as table rows: a team name row, then its contacts (PDF table / preview rows). */
export function contactRows<R>(teams: { name: string; rows: R[] }[]): ({ team: string } | (R & { team?: undefined }))[] {
  return teams.flatMap((t) => [{ team: t.name }, ...t.rows.map((r) => ({ ...r, team: undefined }))]);
}

/** Items in pairs (rosters / calendar months side by side); an odd last one stays alone on the left. */
export function pairs<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

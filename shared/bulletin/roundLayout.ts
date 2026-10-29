// Page and table geometry of the zpravodaj z kola (DXA = 1/20 pt), shared by the preview, DOCX and PDF.
// Ported from sscr-zpravodaj: column widths follow the longest text at the chosen font size, so nothing wraps.
import { FONT_DEFAULT, STAND_HDRS, type MatchView } from './round';

export const CM = 567;
export const PAGE_W = 11906;
export const PAGE_H = 16838;
export const MARGIN_X = Math.round(1.5 * CM);
export const MARGIN_T = Math.round(1.2 * CM);
export const MARGIN_B = Math.round(1.2 * CM);
export const HDR_DIST = Math.round(0.5 * CM);
export const CONTENT = PAGE_W - 2 * MARGIN_X; // 10204 DXA

export const C_HDR = 'C8D9F0';
export const C_ALT = 'F2F2F2';
export const C_BORDER = 'AAAAAA';

const COL_BOARD = 460;
const COL_RESULT = 1120;
const COL_ELO = 640;
const CELL_MARG = 180; // cell margins 90 + 90

/** Text width in px at `fpt` points (canvas in the browser). */
export type Measure = (text: string, bold: boolean, fpt: number) => number;
/** Conservative estimate without a DOM (tests, server). */
export const estimateWidth: Measure = (text, bold, fpt) => text.length * (bold ? 7.4 : 7.0) * fpt / FONT_DEFAULT;

const widest = (texts: string[], bold: boolean, fpt: number, m: Measure) => texts.reduce((px, t) => Math.max(px, m(t ?? '', bold, fpt)), 0);
/** Column (DXA) for the widest text + a small reserve against wrapping; never narrower than `base`. */
const colFor = (texts: string[], bold: boolean, fpt: number, base: number, m: Measure) =>
  Math.max(base, Math.ceil(widest(texts, bold, fpt, m) * 15 * 1.02) + CELL_MARG + 40);
/** Bare minimum without the reserve — only for the "will wrap" warning. */
const colMin = (texts: string[], bold: boolean, fpt: number, m: Measure) => Math.ceil(widest(texts, bold, fpt, m) * 15) + CELL_MARG;
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export type MatchLayout = { board: number; name: number; elo: number; result: number; fits: boolean };

/**
 * Result tables (all the same width): narrow columns (number, rating, result) widen only when needed, the name
 * columns take what the players (regular) and the team names (bold, spanning name + rating) need.
 * fits = false: the longest name does not fit even the maximum width (DOCX / PDF wrap it).
 */
export function matchLayout(matches: MatchView[], fpt: number, m: Measure = estimateWidth): MatchLayout {
  const nrs = matches.map((x) => x.nr);
  const scores = matches.map((x) => x.score);
  const teams = matches.flatMap((x) => [x.home, x.away]);
  const games = matches.flatMap((x) => x.games);
  const elos = games.flatMap((g) => [g.homeElo, g.awayElo]);
  const res = games.map((g) => g.result);
  const players = games.flatMap((g) => [g.home, g.away]);
  const board = colFor(nrs, true, fpt, COL_BOARD, m);
  const elo = colFor(elos, false, fpt, COL_ELO, m);
  const result = Math.max(colFor(res, false, fpt, COL_RESULT, m), colFor(scores, true, fpt, COL_RESULT, m));
  const need = Math.max(colFor(players, false, fpt, 0, m), colFor(teams, true, fpt, 0, m) - elo);
  const maxAllowed = Math.floor((CONTENT - board - 2 * elo - result) / 2);
  const name = Math.max(1200, Math.min(need, maxAllowed));
  return { board, name, elo, result, fits: colMin(players, false, fpt, m) <= name && colMin(teams, true, fpt, m) <= name + elo };
}
export const matchCols = (l: MatchLayout) => [l.board, l.name, l.elo, l.result, l.elo, l.name];

/** Standings P | Družstvo | Z | + | = | − | B | Sk | V: numbers widen as needed, Družstvo takes the rest. */
export function standingsLayout(rows: string[][], fpt: number, m: Measure = estimateWidth): { cols: number[]; fits: boolean } {
  const base = [480, 0, 520, 520, 520, 520, 620, 700, 620];
  const ws = base.map((b, i) => (i === 1 ? 0 : Math.max(colFor([STAND_HDRS[i]], true, fpt, b, m), colFor(rows.map((r) => r[i]), false, fpt, b, m))));
  ws[1] = CONTENT - sum(ws);
  return { cols: ws, fits: colMin(rows.map((r) => r[1]), false, fpt, m) <= ws[1] };
}
export const STAND_ALIGN = ['center', 'left', 'center', 'center', 'center', 'center', 'center', 'center', 'center'] as const;

/** Exact line height in a table cell: 1.2 × font (twips = half-points × 12) — text vertically centred. */
export const cellLine = (halfPts: number) => halfPts * 12;

// E-soupiska xlsx → RosterDraft.
//
// The parser works on a plain grid of cell texts so it is testable without ExcelJS
// (web/src/lib/xlsxGrid.ts and scripts/parse-soupiska.mjs build the grid). It never relies
// on fixed cell addresses: rows are found by their labels in column A and player columns by
// the header row texts, which covers the 2026/27 template, rosters longer than 20 players
// (shifted rows) and the older template variant without the FIDE column.
// Custom formats are rejected with a clear message — no special handling (doc/analyza-soupisek.md).

import { fold, formatPhone } from '../text';
import { emptyExtra, numOrBlank, parseFlags, type DraftContact, type DraftPlayer, type RosterDraft } from './draft';

/** grid[r][c] — 0-based; merged cells carry the value only in their top-left cell. */
export type Grid = (string | null)[][];

export class RosterFormatError extends Error {}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /^(\+?420)?[\d\s/()-]{9,}$/;

const ANCHORS = {
  kraj: /^kraj\b/,
  soutez: /^soutez\b/,
  druzstvo: /^nazev druzstva/,
  oddil: /^oddil\b/,
  table: /^poradi\b/,
  kapitan: /^kapitan\b/,
  zastupce: /^zastupce kapitana/,
  mistnost: /^hraci mistnost/,
  prezuvky: /^prezuvky/,
  preference: /^preference jineho zacatku/,
  pozadavky: /^dalsi pozadavky/,
  komunikace: /^udaje pro komunikaci/,
  rozhodci: /^jako rozhodci/,
} as const;
type Anchor = keyof typeof ANCHORS;
const CONTACT_SECTION_END: Anchor[] = ['kapitan', 'zastupce', 'mistnost', 'prezuvky', 'preference', 'pozadavky', 'komunikace', 'rozhodci'];

const cellAt = (g: Grid, r: number, c: number) => (g[r]?.[c] ?? '').toString().trim();
const rowCells = (g: Grid, r: number) => (g[r] ?? []).map((v) => (v ?? '').toString().trim());

function findAnchor(g: Grid, anchor: Anchor, from = 0): number {
  for (let r = from; r < g.length; r++) {
    if (ANCHORS[anchor].test(fold(cellAt(g, r, 0)))) return r;
  }
  return -1;
}

/** First non-empty cell right of column A whose text differs from the label (merged label copies). */
function valueRightOf(g: Grid, r: number): string {
  const label = fold(cellAt(g, r, 0));
  return rowCells(g, r).slice(1).find((v) => v && fold(v) !== label) ?? '';
}

/** "ne", "NE", "-", "nemáme", "nejsou" … mean "no request". */
function answer(v: string): string {
  const f = fold(v).replace(/[.!]+$/, '');
  return /^(ne|-+|x|nemame|nejsou|neni|nic|zadne|zadny|zadna|bez pozadavku|0|null)$/.test(f) ? '' : v;
}

/** name / phone / e-mail from the cells of one contact row. */
function contactFromCells(cells: string[]): DraftContact {
  const c: DraftContact = { jmeno: '', tel: '', email: '' };
  for (const v of cells) {
    if (!v) continue;
    const mail = v.match(EMAIL_RE);
    if (mail && !c.email) c.email = mail[0];
    else if (PHONE_RE.test(v) && v.replace(/\D/g, '').length >= 9 && !c.tel) c.tel = formatPhone(v);
    else if (!mail && !c.jmeno && !/:$/.test(v) && !/^(prijmeni|telefon|e-?mail|jmeno)\b/.test(fold(v))) c.jmeno = v;
  }
  return c;
}

function contactRows(g: Grid, from: number, to: number): DraftContact[] {
  const out: DraftContact[] = [];
  for (let r = from; r < to; r++) {
    const cells = rowCells(g, r);
    if (cells.some((v) => /^(prijmeni|telefon)/.test(fold(v)))) continue;   // table header row
    const c = contactFromCells(cells.slice(1));
    if (c.jmeno || c.tel || c.email) out.push(c);
  }
  return out;
}

type Columns = { name: number; rok: number; lok: number; fide: number; ozn: number; z: number };

function tableColumns(g: Grid, r: number): Columns {
  const cols: Columns = { name: -1, rok: -1, lok: -1, fide: -1, ozn: -1, z: -1 };
  rowCells(g, r).forEach((v, c) => {
    const f = fold(v);
    if (!f) return;
    if (cols.name < 0 && /prijmeni|jmeno/.test(f)) cols.name = c;
    else if (cols.rok < 0 && /^rok/.test(f)) cols.rok = c;
    else if (cols.lok < 0 && /lok/.test(f)) cols.lok = c;
    else if (cols.fide < 0 && /fide/.test(f)) cols.fide = c;
    else if (cols.ozn < 0 && /oznaceni/.test(f)) cols.ozn = c;
    else if (cols.z < 0 && /^z\b/.test(f)) cols.z = c;
  });
  return cols;
}

const Z_YES = new Set(['ano', 'a', 'z', 'x', '1', '✓', '✔', 'yes', 'y']);

/** "ano", "Ano", "z", "ANO, ml." … → Z = yes; other words of the cell are returned for a warning. */
export function parseZCell(cell: string): { z: boolean; rest: string } {
  const parts = cell.split(/[\s,;/]+/).filter(Boolean);
  const isYes = (w: string) => Z_YES.has(fold(w).replace(/\.$/, ''));
  const NO = new Set(['ne', 'n', '0', '-']);
  return {
    z: parts.some(isYes),
    rest: parts.filter((w) => !isYes(w) && !NO.has(fold(w))).join(' '),
  };
}

export function parseRosterGrid(g: Grid): { draft: RosterDraft; warnings: string[] } {
  const tableRow = findAnchor(g, 'table');
  const cols = tableRow >= 0 ? tableColumns(g, tableRow) : null;
  if (!cols || cols.name < 0 || cols.lok < 0) {
    throw new RosterFormatError('Nerozpoznaný formát soupisky — soubor neodpovídá šabloně e-soupisky ŠSČR. Údaje zadejte ručně.');
  }
  const warnings: string[] = [];
  const header = (a: Anchor) => {
    const r = findAnchor(g, a);
    return r >= 0 && r < tableRow ? valueRightOf(g, r) : '';
  };

  // Player rows: everything between the table header and the first contact-section label.
  let end = g.length;
  for (const a of CONTACT_SECTION_END) {
    const r = findAnchor(g, a, tableRow + 1);
    if (r >= 0) end = Math.min(end, r);
  }
  const players: DraftPlayer[] = [];
  for (let r = tableRow + 1; r < end; r++) {
    const name = cellAt(g, r, cols.name);
    if (!name || /^(prijmeni|jmeno)/.test(fold(name))) continue;
    const flags = parseFlags(cols.ozn >= 0 ? cellAt(g, r, cols.ozn) : '');
    const zCell = parseZCell(cols.z >= 0 ? cellAt(g, r, cols.z) : '');
    if (zCell.rest) warnings.push(`Sloupec Z u hráče ${name.trim()} obsahuje navíc „${zCell.rest}“ — zkontrolujte (např. ml./st. patří ke jménu).`);
    players.push({
      jmeno: name.replace(/\s+/g, ' '),
      rok: numOrBlank(cols.rok >= 0 ? cellAt(g, r, cols.rok) : ''),
      rokSrc: '',
      lok: numOrBlank(cellAt(g, r, cols.lok)),
      fide: numOrBlank(cols.fide >= 0 ? cellAt(g, r, cols.fide) : ''),
      ozn: flags.ozn,
      z: flags.z || zCell.z,
      source: 'xlsx',
    });
  }

  const extra = emptyExtra();
  const kap = findAnchor(g, 'kapitan', tableRow + 1);
  if (kap >= 0) {
    const c = contactFromCells(rowCells(g, kap).slice(1));
    Object.assign(extra, { kapJmeno: c.jmeno, kapTel: c.tel, kapEmail: c.email });
  }
  const zast = findAnchor(g, 'zastupce', tableRow + 1);
  if (zast >= 0) {
    const c = contactFromCells(rowCells(g, zast).slice(1));
    Object.assign(extra, { zastJmeno: c.jmeno, zastTel: c.tel, zastEmail: c.email });
  }
  const single = (a: Anchor) => {
    const r = findAnchor(g, a, tableRow + 1);
    return r >= 0 ? valueRightOf(g, r) : '';
  };
  extra.hraciMistnost = single('mistnost');
  extra.prezuvky = single('prezuvky');
  extra.preferZacatek = answer(single('preference'));
  extra.pozadavkyLosovani = answer(single('pozadavky'));

  const kom = findAnchor(g, 'komunikace', tableRow + 1);
  const roz = findAnchor(g, 'rozhodci', tableRow + 1);
  if (kom >= 0) extra.komunikace = contactRows(g, kom + 1, roz > kom ? roz : g.length);
  if (roz >= 0) extra.rozhodci = contactRows(g, roz + 1, g.length);

  if (findAnchor(g, 'pozadavky') < 0) warnings.push('Soupiska nemá sekci „Další požadavky pro losování“ (starší šablona?).');
  if (cols.fide < 0) warnings.push('Soupiska nemá sloupec „Číslo FIDE“ (starší šablona?).');

  const zCount = players.filter((p) => p.z).length;
  return {
    draft: {
      app: 'sscr-soupiska',
      version: 1,
      header: { kraj: header('kraj'), soutez: header('soutez'), druzstvo: header('druzstvo'), oddil: header('oddil') },
      zakladCount: zCount || 8,
      players,
      extra,
    },
    warnings,
  };
}

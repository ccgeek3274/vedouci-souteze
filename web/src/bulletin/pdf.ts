// PDF of the úvodní zpravodaj through pdfmake (loaded on demand) with Carlito — metrically identical to Calibri,
// so the PDF keeps the DOCX geometry (DXA / 20 = pt). Approach from sscr-zpravodaj.
import type { BulletinModel, CalMonth, RoundView, RosterRow, Section } from '../../../shared/bulletin/initial';
import { CONFLICT, CZ_DAYS } from '../../../shared/bulletin/initial';
import type { RichBlock } from '../../../shared/bulletin/rich';
import { richId } from './paginate';
import {
  C_BORDER, C_CAL, C_SUB, C_TIME, C_WKND, CAL_COL, CAL_GAP, CONTACT_COLS, MARGIN_X, MARGIN_Y, HDR_DIST,
  ROSTER_COLS, ROSTER_GAP, ROSTER_HDRS, ROSTER_PAIR_GAP, ROSTER_W, ROSTER_ROW_H, VENUE_ROW_H, CONTACT_ROW_H, ROSTER_TITLE_H, GAP_PARA_H, cellLine, SCHED_HDRS, VENUE_COLS, contactRows, INTRO_ID, pairs, schedCols, sectionId,
} from './layout';

const pt = (dxa: number) => dxa / 20;
const PAD = 2.5;
const LINE = 0.5;
const FS = 12;
const widths = (ws: number[]) => ws.map((w) => Math.max(4, pt(w) - 2 * PAD - LINE));
/** Calendar cells (fixed square rows). */
const LAYOUT = {
  hLineWidth: () => LINE, vLineWidth: () => LINE,
  hLineColor: () => `#${C_BORDER}`, vLineColor: () => `#${C_BORDER}`,
  paddingLeft: () => PAD, paddingRight: () => PAD, paddingTop: () => 1.5, paddingBottom: () => 1.5,
};
const NO_LINES = { ...LAYOUT, hLineWidth: () => 0, vLineWidth: () => 0 };
const SUB = `#${C_SUB}`;
/** Carlito's natural line (lineHeight 1) = 2500 / 2048 of the font size. */
const NATURAL_LINE = 2500 / 2048;
/**
 * Other tables as the DOCX (and the approved bulletin rpb_26_27_uz): no vertical cell padding, the text line exactly
 * 12 pt × 1.2 = 14.4 pt → a row is 14.4 pt + line (6 rounds of 5 matches per page).
 */
const CELL_LINE = cellLine() / 20;
const CELL_LH = CELL_LINE / (FS * NATURAL_LINE);
const TABLE = { ...LAYOUT, paddingTop: () => 0, paddingBottom: () => 0 };
/** Rows of a fixed height (DXA, incl. the line) with the text vertically centred. */
const fixedRows = (h: number) => ({ heights: pt(h) - LINE });

// Node ids (data-pg in the preview, for its page breaks): t* titles, h* chapters, sections `i.` (intro) / `s{ch}.{n}.`
// + order of the item (paragraph, line, table row, roster / calendar pair, round, link).
function rich(blocks: RichBlock[], id: string): any[] {
  const out: any[] = [];
  let list: any = null;
  let kind: string | null = null;
  blocks.forEach((bl, bi) => {
    const runs = bl.runs.map((r) => {
      const o: any = { text: r.text };
      if (r.b) o.bold = true;
      if (r.i) o.italics = true;
      if (r.u || r.link) o.decoration = 'underline';
      if (r.link) { o.link = r.link; o.color = '#0563C1'; }
      return o;
    });
    const node = { id: richId(id, bi), text: runs.length ? runs : ' ', margin: [0, 0, 0, bl.list ? 3 : 6] };
    if (bl.list) {
      const key = bl.list === 'ordered' ? 'ol' : 'ul';
      if (!list || kind !== key) { list = { [key]: [], margin: [0, 0, 0, 3] }; kind = key; out.push(list); }
      list[key].push(node);
    } else {
      list = null;
      out.push(node);
    }
  });
  return out;
}

// Rosters as in the DOCX (fixed rows): the name in a ROSTER_TITLE_H band (text at the bottom), every row ROSTER_ROW_H
// with the text line exactly 12 pt × 1.2 → 2 pairs of rosters with 20 players fit on a page.
const ROSTER_PAD = (pt(ROSTER_ROW_H) - LINE - CELL_LINE) / 2;
const ROSTER_LAYOUT = { ...LAYOUT, paddingTop: () => ROSTER_PAD, paddingBottom: () => ROSTER_PAD };
const NAME_LINE = 14 * NATURAL_LINE;

function rosterTable(t: { stc: number | null; name: string; players: RosterRow[] }, id?: string) {
  const al = ['center', 'left', 'center', 'center', 'center', 'center', 'center'];
  return {
    width: pt(ROSTER_W),
    stack: [
      { id, text: `${t.stc ?? ''}  ${t.name}`, bold: true, fontSize: 14, margin: [0, pt(ROSTER_TITLE_H) - NAME_LINE, 0, 0] },
      {
        lineHeight: CELL_LH,
        table: {
          widths: widths(ROSTER_COLS), dontBreakRows: true,
          body: [
            ROSTER_HDRS.map((x, i) => ({ text: x, bold: true, fillColor: SUB, alignment: al[i] })),
            ...t.players.map((p) => [p.pos, p.display, p.nrtg || '', p.irtg || '', p.z ? 'Z' : '', p.letter, p.cap].map((v, i) => ({ text: String(v), alignment: al[i] }))),
          ],
        },
        layout: ROSTER_LAYOUT,
      },
    ],
  };
}

function roundTable(r: RoundView, withRef: boolean, id: string) {
  const cw = schedCols(withRef);
  const nc = cw.length;
  const al = ['center', 'center', 'left', 'center', 'left', 'center', 'left'];
  const body: any[] = [
    [{ id, text: r.header, bold: true, colSpan: nc, border: [false, false, false, true] }, ...Array(nc - 1).fill({})],
    SCHED_HDRS.slice(0, nc).map((x, i) => ({ text: x, bold: true, fillColor: SUB, alignment: al[i] })),
    ...r.rows.map((m) => {
      const home: any[] = [m.homeName];
      if (m.time) home.push({ text: ` ${m.time}${m.time === CONFLICT ? '' : ' hodin'}`, bold: true, color: `#${C_TIME}` });
      const row: any[] = [
        { text: String(m.board), alignment: 'center' }, { text: String(m.homeStc ?? ''), alignment: 'center' },
        { text: home }, { text: '-', alignment: 'center' }, { text: m.awayName }, { text: String(m.awayStc ?? ''), alignment: 'center' },
      ];
      if (withRef) row.push({ text: m.ref });
      return row;
    }),
  ];
  // rounds separated by one empty paragraph (DOCX gap)
  return { table: { widths: widths(cw), body, dontBreakRows: true }, layout: TABLE, lineHeight: CELL_LH, unbreakable: true, margin: [0, 0, 0, FS * NATURAL_LINE] };
}

function calendarMonth(mo: CalMonth, weeks: number, id?: string) {
  const wks = [...mo.weeks];
  while (wks.length < weeks) wks.push(Array(7).fill(null));
  const sq = pt(CAL_COL) - 2 * 1.5 - LINE;
  return {
    width: pt(7 * CAL_COL),
    stack: [
      { id, text: mo.name, bold: true, fontSize: 14, margin: [0, 0, 0, 2] },
      {
        table: {
          widths: widths(Array(7).fill(CAL_COL)),
          heights: (i: number) => (i === 0 ? undefined : sq),
          body: [
            CZ_DAYS.map((d) => ({ text: d, bold: true, fillColor: SUB, alignment: 'center' })),
            ...wks.map((wk) => wk.map((c, i) => {
              if (!c) return { text: '' };
              const hit = c.rounds.length > 0;
              return { text: String(c.d), alignment: 'center', bold: hit, fillColor: hit ? `#${C_CAL}` : undefined, color: !hit && i >= 5 ? `#${C_WKND}` : undefined, margin: [0, sq / 2 - 8, 0, 0] };
            })),
          ],
        },
        layout: LAYOUT,
      },
    ],
  };
}

function section(s: Section, id: string): any[] {
  switch (s.type) {
    case 'rich': return rich(s.blocks, id);
    case 'lines': return s.lines.map((l, i) => ({ id: `${id}${i}`, text: l, margin: [0, 0, 0, 3] }));
    case 'venues': return [{
      table: {
        widths: widths(VENUE_COLS), dontBreakRows: true, ...fixedRows(VENUE_ROW_H),
        body: s.rows.map((r, i) => [{ id: `${id}${i}`, text: String(r.stc ?? ''), alignment: 'center' }, { text: r.name }, { text: r.venue }]
          .map((c) => ({ ...c, verticalAlignment: 'middle' }))),
      },
      layout: TABLE, lineHeight: CELL_LH,
    }];
    case 'contacts': return [{
      table: {
        widths: widths(CONTACT_COLS), dontBreakRows: true, ...fixedRows(CONTACT_ROW_H),
        body: contactRows(s.teams).map((r, i) => (r.team != null
          ? [{ id: `${id}${i}`, text: r.team, bold: true, fillColor: SUB, colSpan: 4 }, {}, {}, {}]
          : [{ id: `${id}${i}`, text: r.label }, { text: r.name }, { text: r.phone }, r.email ? { text: r.email, link: `mailto:${r.email}`, color: '#0563C1' } : { text: '' }])
          .map((c: any) => (c.text != null ? { ...c, verticalAlignment: 'middle' } : c))),
      },
      layout: TABLE, lineHeight: CELL_LH,
    }];
    case 'rosters': return pairs(s.teams).map((p, k) => ({
      columns: p.map((t, j) => rosterTable(t, j ? undefined : `${id}${k}`)), columnGap: pt(ROSTER_GAP), unbreakable: true,
      margin: [0, 0, 0, pt(ROSTER_PAIR_GAP + GAP_PARA_H)],
    }));
    case 'rounds': return s.rounds.map((r, k) => roundTable(r, s.withRef, `${id}${k}`));
    case 'links': return s.links.map((l, k) => ({ id: `${id}${k}`, text: [`${l.label}: `, { text: l.url, link: l.url, color: '#0563C1', decoration: 'underline' }], margin: [0, 0, 0, 6] }));
    case 'signature': return s.name ? [{
      id: `${id}0`,
      margin: [0, 12, 0, 0],
      text: [s.name, ...(s.email ? ['\n', { text: s.email, link: `mailto:${s.email}`, color: '#0563C1', decoration: 'underline' }] : []), ...(s.phone ? [`\ntel: ${s.phone}`] : [])],
    }] : [];
    case 'calendar': return pairs(s.months).map((p, k) => {
      const weeks = Math.max(...p.map((m) => m.weeks.length));
      return {
        columns: [{ width: '*', text: '' }, ...p.map((m, j) => calendarMonth(m, weeks, j ? undefined : `${id}${k}`)), ...(p.length < 2 ? [{ width: pt(7 * CAL_COL), text: '' }] : []), { width: '*', text: '' }],
        columnGap: pt(CAL_GAP) / 2, unbreakable: true, margin: [0, 0, 0, 12],
      };
    });
  }
}

export function buildPdfDef(model: BulletinModel): any {
  const content: any[] = [
    { id: 't0', text: model.title, bold: true, fontSize: 20, alignment: 'center', margin: [0, 0, 0, 6] },
    ...model.subtitles.map((s, i) => ({ id: `t${i + 1}`, text: s, fontSize: 14, alignment: 'center', margin: [0, 3, 0, 3] })),
    { text: '', margin: [0, 0, 0, 12] },
    ...section(model.intro, INTRO_ID),
  ];
  model.chapters.forEach((c, i) => {
    const head = { id: `h${i}`, text: `${i + 1}.  ${c.title}`, bold: true, fontSize: 14, margin: [0, c.pageBreak ? 0 : 12, 0, 6], pageBreak: c.pageBreak ? 'before' : undefined, headlineLevel: 1 };
    const body = c.sections.flatMap((s, j) => section(s, sectionId(i, j)));
    // pdfmake has no keepNext: the heading and the first block (a round, a roster pair, a paragraph) are one unbreakable
    // block; a table that may split (venues, address book) or a list relies on the heading rule in pageBreakBefore
    if (!c.pageBreak && body[0] && (body[0].unbreakable || body[0].text !== undefined)) content.push({ stack: [head, body.shift()], unbreakable: true });
    else content.push(head);
    content.push(...body);
  });
  return {
    pageSize: 'A4',
    pageMargins: [pt(MARGIN_X), pt(MARGIN_Y), pt(MARGIN_X), pt(MARGIN_Y)],
    header: { text: model.header, fontSize: 9, alignment: 'right', margin: [pt(MARGIN_X), pt(HDR_DIST), pt(MARGIN_X), 0] },
    footer: (page: number, pages: number) => ({ text: `Strana ${page} z ${pages}`, fontSize: 9, alignment: 'center', margin: [0, pt(MARGIN_Y) - pt(HDR_DIST) - 9, 0, 0] }),
    // a chapter heading never stays alone at the bottom of a page
    pageBreakBefore: (node: any, after: any) => node.headlineLevel === 1 && after.getFollowingNodesOnPage().length === 0,
    defaultStyle: { font: 'Carlito', fontSize: FS, lineHeight: 1 },
    info: { title: `${model.title} – úvodní zpravodaj` },
    content,
  };
}

let pdfReady: Promise<any> | null = null;
export function loadPdfMake(): Promise<any> {
  if (!pdfReady) {
    pdfReady = import('pdfmake/build/pdfmake').then((m: any) => {
      const pdfMake = m.default ?? m;
      const u = (f: string) => new URL(`/fonts/Carlito-${f}.ttf`, location.href).href;
      pdfMake.addFonts({ Carlito: { normal: u('Regular'), bold: u('Bold'), italics: u('Italic'), bolditalics: u('BoldItalic') } });
      return pdfMake;
    }).catch((e) => { pdfReady = null; throw e; });
  }
  return pdfReady;
}

export async function buildPdfBlob(model: BulletinModel): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  // pdfmake rewrites the definition in place — never hand it arrays shared with the (rendered) model
  return pdfMake.createPdf(buildPdfDef(structuredClone(model))).getBlob();
}

/** Page of every block of the PDF (ids as data-pg in the preview), for the page breaks of the preview. */
export async function pdfPageMap(model: BulletinModel): Promise<Record<string, number>> {
  const pdfMake = await loadPdfMake();
  const map: Record<string, number> = {};
  const def = buildPdfDef(structuredClone(model));
  const keepHeadings = def.pageBreakBefore;
  // the heading rule moves a heading to the next page and lays the document out again; pdfmake asks about every node
  // only once (nodes after it are asked in the new layout), so the moved heading is recorded on the next page here
  def.pageBreakBefore = (n: any, ...rest: any[]) => {
    const moved = keepHeadings(n, ...rest);
    if (n.id) map[n.id] = n.startPosition.pageNumber + (moved ? 1 : 0);
    return moved;
  };
  await pdfMake.createPdf(def).getBuffer();
  return map;
}

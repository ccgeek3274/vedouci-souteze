// PDF of the zpravodaj z kola through pdfmake + Carlito (metrically identical to Calibri), built from the same
// model and widths as the DOCX (DXA / 20 = pt). Port of sscr-zpravodaj buildPdfDef.
import type { PageHeader, RoundModel } from '../../../shared/bulletin/round';
import { refLine, STAND_HDRS } from '../../../shared/bulletin/round';
import type { RichBlock } from '../../../shared/bulletin/rich';
import {
  C_ALT, C_BORDER, C_HDR, CONTENT, HDR_DIST, MARGIN_B, MARGIN_T, MARGIN_X, STAND_ALIGN, matchCols, type MatchLayout,
} from '../../../shared/bulletin/roundLayout';
import { loadPdfMake } from './pdf';

const pt = (dxa: number) => dxa / 20;
const PAD = 3; // horizontal cell padding (DOCX has 4.5 pt)
const LINE = 0.5;
/** pdfmake widths exclude padding and lines → subtract them, so the table width matches the DOCX. */
const widths = (ws: number[]) => ws.map((w) => Math.max(4, pt(w) - 2 * PAD - LINE));
/** Row as in the DOCX: text exactly 1.2 × font (Carlito's natural line is 2500/2048 ≈ 1.22). */
const CELL_LH = 1.2 / (2500 / 2048);
const TABLE_LAYOUT = {
  hLineWidth: () => LINE, vLineWidth: () => LINE, hLineColor: () => `#${C_BORDER}`, vLineColor: () => `#${C_BORDER}`,
  paddingLeft: () => PAD, paddingRight: () => PAD, paddingTop: () => pt(24), paddingBottom: () => pt(24),
};
const MATCH_LAYOUT = { ...TABLE_LAYOUT, paddingTop: (i: number) => pt(i === 0 ? 14 : 24), paddingBottom: (i: number) => pt(i === 0 ? 14 : 24) };
const color = (c?: string) => (c ? `#${c}` : undefined);
const rule = (c: string, w: number) => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: pt(CONTENT), y2: 0, lineWidth: w, lineColor: `#${c}` }] });

function rich(blocks: RichBlock[], base: number): any[] {
  const out: any[] = [];
  let list: any = null;
  let kind: string | null = null;
  for (const bl of blocks) {
    const runs = bl.runs.map((r) => {
      const o: any = { text: r.text, fontSize: base };
      if (r.b) o.bold = true;
      if (r.i) o.italics = true;
      if (r.u || r.link) o.decoration = 'underline';
      if (r.link) { o.link = r.link; o.color = '#0563C1'; }
      return o;
    });
    const node = { text: runs.length ? runs : ' ', margin: [0, 0, 0, pt(100)] };
    if (bl.list) {
      const key = bl.list === 'ordered' ? 'ol' : 'ul';
      if (!list || kind !== key) { list = { [key]: [], margin: [0, 0, 0, 0] }; kind = key; out.push(list); }
      list[key].push(node);
    } else {
      list = null;
      out.push(node);
    }
  }
  // no space under the last paragraph — on a full page pdfmake would add an empty page just for it
  const last = out[out.length - 1];
  if (last) ((last.ul ?? last.ol)?.[(last.ul ?? last.ol).length - 1] ?? last).margin = [0, 0, 0, 0];
  return out;
}

function header(hd: PageHeader) {
  const st = { fontSize: hd.size, color: color(hd.color) };
  const row = hd.c != null
    ? { text: hd.c, alignment: 'center', ...st }
    : { columns: [{ text: hd.l ?? '', width: '*', ...st }, { text: hd.r ?? '', width: 'auto', alignment: 'right', ...st }], columnGap: 12 };
  return { stack: [row, ...(hd.rule ? [{ ...rule(hd.rule, 0.5), margin: [0, 1, 0, 0] }] : [])], margin: [pt(MARGIN_X), pt(HDR_DIST), pt(MARGIN_X), 0] };
}

export function buildRoundPdfDef(model: RoundModel, lay: MatchLayout, standCols: number[]): any {
  const fpt = model.fontPt;
  const ch = model.chap;
  const chapter = (i: number, before: number) => {
    const t = { text: ch.labels[i], bold: true, fontSize: ch.size, color: color(ch.color) };
    return ch.rule ? { stack: [t, rule(ch.rule, 0.75)], margin: [0, before, 0, pt(80)] } : { ...t, margin: [0, before, 0, pt(80)] };
  };
  // pdfmake has no keepNext: a chapter title and its first item form one unbreakable block
  const keep = (head: any, next: any) => (next ? { stack: [head, next], unbreakable: true } : head);

  const content: any[] = model.titles.map((t, i) => {
    const tx = { text: t.text, bold: !!t.bold, fontSize: t.size, alignment: t.align, color: color(t.color) };
    const titleRule = model.profile.titleRule;
    return titleRule && i === model.titles.length - 1
      ? { stack: [tx, { ...rule(titleRule, 1.5), margin: [0, 3, 0, 0] }], margin: [0, 0, 0, t.after] }
      : { ...tx, margin: [0, 0, 0, t.after] };
  });

  const mw = widths(matchCols(lay));
  const fill = `#${C_HDR}`;
  const matches = model.matches.map((m, mi) => {
    const h = { bold: true, fillColor: fill };
    const body: any[] = [[
      { text: m.nr, alignment: 'center', noWrap: true, ...h }, { text: m.home, colSpan: 2, ...h }, {},
      { text: m.score, alignment: 'center', ...h }, { text: m.away, colSpan: 2, alignment: 'right', ...h }, {},
    ]];
    m.games.forEach((g, i) => body.push([
      { text: String(i + 1), alignment: 'center' }, { text: g.home }, { text: g.homeElo, alignment: 'right' },
      { text: g.result, alignment: 'center' }, { text: g.awayElo }, { text: g.away },
    ]));
    if (model.withRef) body.push([{ text: refLine(m.ref), colSpan: 6 }, {}, {}, {}, {}, {}]);
    return {
      table: { widths: mw, body, dontBreakRows: true },
      layout: MATCH_LAYOUT, fontSize: fpt, lineHeight: CELL_LH,
      unbreakable: true, // a match never splits across pages
      margin: [0, 0, 0, mi < model.matches.length - 1 ? 11 * 2500 / 2048 : 0], // one empty 11 pt line (DOCX gap)
    };
  });
  content.push(keep(chapter(0, pt(60)), matches[0]), ...matches.slice(1));

  const sBody = [
    STAND_HDRS.map((x, i) => ({ text: x, bold: true, fillColor: fill, alignment: STAND_ALIGN[i] })),
    ...model.standings.map((vals, idx) => vals.map((v, i) => ({ text: v, alignment: STAND_ALIGN[i], fillColor: idx % 2 === 1 ? `#${C_ALT}` : null }))),
  ];
  content.push(keep(chapter(1, pt(200)), {
    table: { widths: widths(standCols), body: sBody, headerRows: 1, dontBreakRows: true }, layout: TABLE_LAYOUT, fontSize: fpt, lineHeight: CELL_LH,
  }));

  const r = rich(model.rozne.blocks, fpt);
  content.push(keep(chapter(2, pt(200)), r[0]), ...r.slice(1));

  return {
    pageSize: 'A4',
    pageMargins: [pt(MARGIN_X), pt(MARGIN_T), pt(MARGIN_X), pt(MARGIN_B)],
    header: header(model.hdr),
    defaultStyle: { font: 'Carlito', fontSize: 11 },
    info: { title: model.docTitle },
    content,
  };
}

export async function buildRoundPdfBlob(model: RoundModel, lay: MatchLayout, standCols: number[]): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  // pdfmake rewrites the definition in place — never hand it arrays shared with the (rendered) model
  // (the profile holds functions — not cloneable, and the definition does not reference its arrays)
  const { profile, ...data } = model;
  return pdfMake.createPdf(buildRoundPdfDef({ ...structuredClone(data), profile }, lay, standCols)).getBlob();
}

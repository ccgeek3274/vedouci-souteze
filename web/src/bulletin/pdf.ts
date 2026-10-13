// PDF of the úvodní zpravodaj through pdfmake (loaded on demand) with Carlito — metrically identical to Calibri,
// so the PDF keeps the DOCX geometry (DXA / 20 = pt). Approach from sscr-zpravodaj.
import type { BulletinModel, CalMonth, RoundView, RosterRow, Section } from '../../../shared/bulletin/initial';
import { CONFLICT, CZ_DAYS } from '../../../shared/bulletin/initial';
import type { RichBlock } from '../../../shared/bulletin/rich';
import {
  C_BORDER, C_CAL, C_SUB, C_TIME, C_WKND, CAL_COL, CAL_GAP, CONTACT_COLS, MARGIN_X, MARGIN_Y, HDR_DIST,
  ROSTER_COLS, ROSTER_GAP, ROSTER_HDRS, ROSTER_PAIR_GAP, ROSTER_W, SCHED_HDRS, VENUE_COLS, pairs, schedCols,
} from './layout';

const pt = (dxa: number) => dxa / 20;
const PAD = 2.5;
const LINE = 0.5;
const FS = 12;
const widths = (ws: number[]) => ws.map((w) => Math.max(4, pt(w) - 2 * PAD - LINE));
const LAYOUT = {
  hLineWidth: () => LINE, vLineWidth: () => LINE,
  hLineColor: () => `#${C_BORDER}`, vLineColor: () => `#${C_BORDER}`,
  paddingLeft: () => PAD, paddingRight: () => PAD, paddingTop: () => 1.5, paddingBottom: () => 1.5,
};
const NO_LINES = { ...LAYOUT, hLineWidth: () => 0, vLineWidth: () => 0 };
const SUB = `#${C_SUB}`;

function rich(blocks: RichBlock[]): any[] {
  const out: any[] = [];
  let list: any = null;
  let kind: string | null = null;
  for (const bl of blocks) {
    const runs = bl.runs.map((r) => {
      const o: any = { text: r.text };
      if (r.b) o.bold = true;
      if (r.i) o.italics = true;
      if (r.u || r.link) o.decoration = 'underline';
      if (r.link) { o.link = r.link; o.color = '#0563C1'; }
      return o;
    });
    const node = { text: runs.length ? runs : ' ', margin: [0, 0, 0, bl.list ? 3 : 6] };
    if (bl.list) {
      const key = bl.list === 'ordered' ? 'ol' : 'ul';
      if (!list || kind !== key) { list = { [key]: [], margin: [0, 0, 0, 3] }; kind = key; out.push(list); }
      list[key].push(node);
    } else {
      list = null;
      out.push(node);
    }
  }
  return out;
}

function rosterTable(t: { stc: number | null; name: string; players: RosterRow[] }) {
  const al = ['center', 'left', 'center', 'center', 'center', 'left'];
  return {
    width: pt(ROSTER_W),
    stack: [
      { text: `${t.stc ?? ''}  ${t.name}`, bold: true, fontSize: 14, margin: [0, 0, 0, 2] },
      {
        table: {
          widths: widths(ROSTER_COLS), dontBreakRows: true,
          body: [
            ROSTER_HDRS.map((x, i) => ({ text: x, bold: true, fillColor: SUB, alignment: al[i] })),
            ...t.players.map((p) => [p.pos, p.display, p.nrtg || '', p.irtg || '', p.z ? 'Z' : '', p.typ].map((v, i) => ({ text: String(v), alignment: al[i] }))),
          ],
        },
        layout: LAYOUT,
      },
    ],
  };
}

function roundTable(r: RoundView, withRef: boolean) {
  const cw = schedCols(withRef);
  const nc = cw.length;
  const al = ['center', 'center', 'left', 'center', 'left', 'center', 'left'];
  const body: any[] = [
    [{ text: r.header, bold: true, colSpan: nc, border: [false, false, false, true] }, ...Array(nc - 1).fill({})],
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
  return { table: { widths: widths(cw), body, dontBreakRows: true }, layout: LAYOUT, unbreakable: true, margin: [0, 0, 0, 12] };
}

function calendarMonth(mo: CalMonth, weeks: number) {
  const wks = [...mo.weeks];
  while (wks.length < weeks) wks.push(Array(7).fill(null));
  const sq = pt(CAL_COL) - 2 * 1.5 - LINE;
  return {
    width: pt(7 * CAL_COL),
    stack: [
      { text: mo.name, bold: true, fontSize: 14, margin: [0, 0, 0, 2] },
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

function section(s: Section): any[] {
  switch (s.type) {
    case 'rich': return rich(s.blocks);
    case 'lines': return s.lines.map((l) => ({ text: l, margin: [0, 0, 0, 3] }));
    case 'venues': return [{
      table: { widths: widths(VENUE_COLS), dontBreakRows: true, body: s.rows.map((r) => [{ text: String(r.stc ?? ''), alignment: 'center' }, { text: r.name, bold: true }, { text: r.venue }]) },
      layout: LAYOUT,
    }];
    case 'contacts': return [{
      table: {
        widths: widths(CONTACT_COLS), dontBreakRows: true,
        body: s.teams.flatMap((t) => [
          [{ text: t.name, bold: true, fillColor: SUB, colSpan: 4 }, {}, {}, {}],
          ...t.rows.map((r) => [r.label, r.name, r.phone, r.email ? { text: r.email, link: `mailto:${r.email}`, color: '#0563C1' } : '']),
        ]),
      },
      layout: LAYOUT,
    }];
    case 'rosters': return pairs(s.teams).map((p) => ({
      columns: p.map(rosterTable), columnGap: pt(ROSTER_GAP), unbreakable: true, margin: [0, 0, 0, pt(ROSTER_PAIR_GAP)],
    }));
    case 'deficiencies': return s.teams.flatMap((t) => [
      { text: t.team, bold: true, margin: [0, 6, 0, 3] },
      { ul: t.lines.map((l) => ({ text: l })), margin: [0, 0, 0, 3] },
    ]);
    case 'rounds': return s.rounds.map((r) => roundTable(r, s.withRef));
    case 'links': return s.links.map((l) => ({ text: [`${l.label}: `, { text: l.url, link: l.url, color: '#0563C1', decoration: 'underline' }], margin: [0, 0, 0, 6] }));
    case 'signature': return s.name ? [{
      margin: [0, 12, 0, 0],
      text: [s.name, ...(s.email ? ['\n', { text: s.email, link: `mailto:${s.email}`, color: '#0563C1', decoration: 'underline' }] : []), ...(s.phone ? [`\ntel: ${s.phone}`] : [])],
    }] : [];
    case 'calendar': return pairs(s.months).map((p) => {
      const weeks = Math.max(...p.map((m) => m.weeks.length));
      return {
        columns: [{ width: '*', text: '' }, ...p.map((m) => calendarMonth(m, weeks)), ...(p.length < 2 ? [{ width: pt(7 * CAL_COL), text: '' }] : []), { width: '*', text: '' }],
        columnGap: pt(CAL_GAP) / 2, unbreakable: true, margin: [0, 0, 0, 12],
      };
    });
  }
}

export function buildPdfDef(model: BulletinModel): any {
  const content: any[] = [
    { text: model.title, bold: true, fontSize: 20, alignment: 'center', margin: [0, 0, 0, 6] },
    ...model.subtitles.map((s) => ({ text: s, fontSize: 14, alignment: 'center', margin: [0, 3, 0, 3] })),
    { text: '', margin: [0, 0, 0, 12] },
    ...section(model.intro),
  ];
  model.chapters.forEach((c, i) => {
    content.push({ text: `${i + 1}.  ${c.title}`, bold: true, fontSize: 14, margin: [0, c.pageBreak ? 0 : 12, 0, 6], pageBreak: c.pageBreak ? 'before' : undefined, headlineLevel: 1 });
    content.push(...c.sections.flatMap(section));
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
function loadPdfMake(): Promise<any> {
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

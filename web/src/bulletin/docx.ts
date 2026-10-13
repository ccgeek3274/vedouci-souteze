// DOCX of the úvodní zpravodaj (docx, loaded on demand). Ported from uvodni-zpravodaj buildDocx: fonts and sizes
// live only in the document styles, tables have fixed row heights and do not split across pages.
import type { BulletinModel, CalMonth, ContactRow, RoundView, RosterRow, Section } from '../../../shared/bulletin/initial';
import { CZ_DAYS, CONFLICT } from '../../../shared/bulletin/initial';
import type { RichBlock } from '../../../shared/bulletin/rich';
import {
  C_BORDER, C_CAL, C_SUB, C_TIME, C_WKND, CAL_COL, CAL_GAP, CELL_PAD, CONTACT_COLS, FONT, FS, FS_NAME, GAP_PARA_H, HDR_DIST,
  MARGIN_X, MARGIN_Y, PAGE_H, PAGE_W, ROSTER_COLS, ROSTER_GAP, ROSTER_HDRS, ROSTER_PAIR_GAP, ROSTER_ROW_H, ROSTER_TITLE_H,
  SCHED_HDRS, VENUE_COLS, cellLine, pairs, schedCols, sum,
} from './layout';

type Docx = typeof import('docx');

export async function buildDocxBlob(model: BulletinModel): Promise<Blob> {
  const D: Docx = await import('docx');
  return D.Packer.toBlob(buildDocument(D, model));
}

function buildDocument(D: Docx, model: BulletinModel) {
  const B_S = { style: D.BorderStyle.SINGLE, size: 4, color: C_BORDER };
  const B_N = { style: D.BorderStyle.NIL, size: 0, color: 'auto' };
  const B_ALL = { top: B_S, bottom: B_S, left: B_S, right: B_S };
  const B_NONE = { top: B_N, bottom: B_N, left: B_N, right: B_N };
  const TABLE_NONE = { top: B_N, bottom: B_N, left: B_N, right: B_N, insideHorizontal: B_N, insideVertical: B_N };

  type CellOpts = {
    w?: number; span?: number; bold?: boolean; size?: number; bg?: string; align?: 'left' | 'center';
    keepNext?: boolean; valign?: 'center' | 'bottom'; borders?: any; noBorder?: boolean;
  };
  const run = (text: unknown, o: { bold?: boolean; size?: number } = {}) =>
    new D.TextRun({ text: String(text ?? ''), bold: o.bold || undefined, size: o.size });
  const cell = (content: unknown, o: CellOpts = {}) =>
    new D.TableCell({
      width: { size: o.w || 1000, type: D.WidthType.DXA },
      columnSpan: o.span || 1,
      verticalAlign: o.valign === 'bottom' ? D.VerticalAlign.BOTTOM : D.VerticalAlign.CENTER,
      shading: o.bg ? { fill: o.bg, type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
      borders: o.borders || (o.noBorder ? B_NONE : B_ALL),
      margins: { top: 0, bottom: 0, left: CELL_PAD, right: CELL_PAD },
      children: [new D.Paragraph({
        alignment: o.align === 'center' ? D.AlignmentType.CENTER : D.AlignmentType.LEFT,
        keepNext: o.keepNext || false,
        keepLines: true,
        spacing: { before: 0, after: 0, line: cellLine(o.size), lineRule: D.LineRuleType.EXACT },
        children: Array.isArray(content) ? content : [run(content, { bold: o.bold, size: o.size })],
      })],
    });
  const row = (cells: InstanceType<Docx['TableCell']>[], h?: number) =>
    new D.TableRow({ cantSplit: true, children: cells, height: h ? { value: h, rule: D.HeightRule.EXACT } : undefined });
  const table = (cols: number[], rows: InstanceType<Docx['TableRow']>[], borders?: any) =>
    new D.Table({ width: { size: sum(cols), type: D.WidthType.DXA }, columnWidths: cols, rows, borders });
  const para = (children: string | any[], o: { style?: string; heading?: any; numbering?: any; spacing?: any; keepNext?: boolean; pageBreakBefore?: boolean } = {}) =>
    new D.Paragraph({
      style: o.style, heading: o.heading, numbering: o.numbering, keepNext: o.keepNext, pageBreakBefore: o.pageBreakBefore,
      spacing: o.spacing || { before: 0, after: 120 },
      children: typeof children === 'string' ? [run(children)] : children,
    });
  const gap = () => new D.Paragraph({ spacing: { before: 0, after: 0 }, children: [] });
  const link = (text: string, url: string) => new D.ExternalHyperlink({ link: url, children: [new D.TextRun({ text, style: 'Hyperlink' })] });

  // ── Rich text (Quill) ──
  let olInstance = 0;
  const rich = (blocks: RichBlock[]) => {
    let prev: string | null = null;
    return blocks.map((bl) => {
      if (bl.list === 'ordered' && prev !== 'ordered') olInstance++;
      prev = bl.list;
      return new D.Paragraph({
        spacing: { before: 0, after: bl.list ? 60 : 120 },
        bullet: bl.list === 'bullet' ? { level: 0 } : undefined,
        numbering: bl.list === 'ordered' ? { reference: 'rich-ol', level: 0, instance: olInstance } : undefined,
        children: bl.runs.map((r) => {
          const tr = new D.TextRun({ text: r.text, bold: r.b || undefined, italics: r.i || undefined, underline: r.u ? {} : undefined, style: r.link ? 'Hyperlink' : undefined });
          return r.link ? new D.ExternalHyperlink({ link: r.link, children: [tr] }) : tr;
        }),
      });
    });
  };

  // ── Venues ──
  const venues = (rows: { stc: number | null; name: string; venue: string }[]) => {
    const c = VENUE_COLS;
    return table(c, rows.map((r) => row([
      cell(r.stc ?? '', { w: c[0], align: 'center' }),
      cell(r.name, { w: c[1], bold: true }),
      new D.TableCell({
        width: { size: c[2], type: D.WidthType.DXA }, borders: B_ALL, verticalAlign: D.VerticalAlign.CENTER,
        margins: { top: 20, bottom: 20, left: CELL_PAD, right: CELL_PAD },
        children: [new D.Paragraph({ spacing: { before: 0, after: 0 }, children: [run(r.venue)] })],
      }),
    ])));
  };

  // ── Address book: one table, team name row + contact rows; a team does not split across pages ──
  const contacts = (teams: { name: string; rows: ContactRow[] }[]) => {
    const c = CONTACT_COLS;
    const rows: InstanceType<Docx['TableRow']>[] = [];
    for (const t of teams) {
      const n = t.rows.length;
      rows.push(row([cell(t.name, { w: sum(c), span: 4, bold: true, bg: C_SUB, keepNext: n > 0 })]));
      t.rows.forEach((r, i) => {
        const kn = i < n - 1;
        rows.push(row([
          cell(r.label, { w: c[0], keepNext: kn }), cell(r.name, { w: c[1], keepNext: kn }),
          cell(r.phone, { w: c[2], keepNext: kn }),
          cell(r.email ? [link(r.email, `mailto:${r.email}`)] : '', { w: c[3], keepNext: kn }),
        ]));
      });
    }
    return table(c, rows);
  };

  // ── Rosters in pairs: one flat table (7 cols | gap | 7 cols), see uvodni-zpravodaj ──
  type RT = { stc: number | null; name: string; players: RosterRow[] };
  const filled = (t: RT | undefined, ri: number) => !!t && ri < t.players.length + 2;
  const rosterHalf = (t: RT | undefined, ri: number, kn: boolean) => {
    const cw = ROSTER_COLS;
    if (!filled(t, ri)) {
      const under = !!t && ri === t.players.length + 2;
      return [cell('', { w: sum(cw), span: 7, keepNext: kn, borders: { top: under ? B_S : B_N, bottom: B_N, left: B_N, right: B_N } })];
    }
    if (ri === 0) return [cell(`${t!.stc ?? ''}  ${t!.name}`, { w: sum(cw), span: 7, bold: true, size: FS_NAME, keepNext: kn, valign: 'bottom', borders: { top: B_N, left: B_N, right: B_N, bottom: B_S } })];
    if (ri === 1) return ROSTER_HDRS.map((x, i) => cell(x, { w: cw[i], bold: true, bg: C_SUB, align: i === 1 ? 'left' : 'center', keepNext: kn }));
    const p = t!.players[ri - 2];
    return [
      cell(p.pos, { w: cw[0], align: 'center', keepNext: kn }),
      cell(p.display, { w: cw[1], keepNext: kn }),
      cell(p.nrtg || '', { w: cw[2], align: 'center', keepNext: kn }),
      cell(p.irtg || '', { w: cw[3], align: 'center', keepNext: kn }),
      cell(p.z ? 'Z' : '', { w: cw[4], align: 'center', keepNext: kn }),
      cell(p.letter, { w: cw[5], align: 'center', keepNext: kn }),
      cell(p.cap, { w: cw[6], align: 'center', keepNext: kn }),
    ];
  };
  const rosterPair = (pair: RT[]) => {
    const cols = [...ROSTER_COLS, ROSTER_GAP, ...ROSTER_COLS];
    const n = 2 + Math.max(pair[0].players.length, pair[1]?.players.length ?? 0);
    const rows = [];
    for (let ri = 0; ri < n; ri++) {
      const kn = ri < n - 1;
      rows.push(row([
        ...rosterHalf(pair[0], ri, kn),
        cell('', { w: ROSTER_GAP, keepNext: kn, borders: { top: B_N, bottom: B_N, left: ri > 0 && filled(pair[0], ri) ? B_S : B_N, right: ri > 0 && filled(pair[1], ri) ? B_S : B_N } }),
        ...rosterHalf(pair[1], ri, kn),
      ], ri === 0 ? ROSTER_TITLE_H : ROSTER_ROW_H));
    }
    return table(cols, rows, TABLE_NONE);
  };
  const pairGap = () => new D.Paragraph({ spacing: { before: 0, after: ROSTER_PAIR_GAP, line: GAP_PARA_H, lineRule: D.LineRuleType.EXACT }, children: [] });

  // ── Schedule ──
  const roundTable = (r: RoundView, withRef: boolean) => {
    const cw = schedCols(withRef), nc = cw.length, n = r.rows.length;
    const rows = [
      row([cell(r.header, { w: sum(cw), span: nc, bold: true, keepNext: true, borders: { top: B_N, left: B_N, right: B_N, bottom: B_S } })]),
      row(SCHED_HDRS.slice(0, nc).map((x, i) => cell(x, { w: cw[i], bold: true, bg: C_SUB, align: i === 2 || i === 4 || i === 6 ? 'left' : 'center', keepNext: n > 0 }))),
    ];
    r.rows.forEach((m, i) => {
      const kn = i < n - 1;
      const home: any[] = [run(m.homeName)];
      if (m.time) home.push(new D.TextRun({ text: ` ${m.time}${m.time === CONFLICT ? '' : ' hodin'}`, bold: true, color: C_TIME }));
      const cells = [
        cell(m.board, { w: cw[0], align: 'center', keepNext: kn }),
        cell(m.homeStc ?? '', { w: cw[1], align: 'center', keepNext: kn }),
        cell(home, { w: cw[2], keepNext: kn }),
        cell('-', { w: cw[3], align: 'center', keepNext: kn }),
        cell(m.awayName, { w: cw[4], keepNext: kn }),
        cell(m.awayStc ?? '', { w: cw[5], align: 'center', keepNext: kn }),
      ];
      if (withRef) cells.push(cell(m.ref, { w: cw[6], keepNext: kn }));
      rows.push(row(cells));
    });
    return table(cw, rows);
  };

  // ── Calendar: pairs of months as one flat table, match days shaded and bold, weekends grey ──
  const calHalf = (mo: CalMonth | undefined, ri: number, kn: boolean, weeks: number) => {
    const w7 = 7 * CAL_COL;
    if (!mo) return [cell('', { w: w7, span: 7, noBorder: true, keepNext: kn })];
    if (ri === 0) return [cell(mo.name, { w: w7, span: 7, bold: true, size: FS_NAME, keepNext: kn, borders: { top: B_N, left: B_N, right: B_N, bottom: B_S } })];
    if (ri === 1) return CZ_DAYS.map((x) => cell(x, { w: CAL_COL, bold: true, bg: C_SUB, align: 'center', keepNext: kn }));
    void weeks;
    return (mo.weeks[ri - 2] ?? Array(7).fill(null)).map((c, i) => {
      if (!c) return cell('', { w: CAL_COL, keepNext: kn });
      const hit = c.rounds.length > 0;
      return cell([new D.TextRun({ text: String(c.d), bold: hit || undefined, color: !hit && i >= 5 ? C_WKND : undefined })], { w: CAL_COL, align: 'center', bg: hit ? C_CAL : undefined, keepNext: kn });
    });
  };
  const calendarPair = (pair: CalMonth[]) => {
    const cols = [...Array(7).fill(CAL_COL), CAL_GAP, ...Array(7).fill(CAL_COL)];
    const weeks = Math.max(...pair.map((m) => m.weeks.length));
    const n = 2 + weeks;
    const rows = [];
    for (let ri = 0; ri < n; ri++) {
      const kn = ri < n - 1;
      rows.push(new D.TableRow({
        cantSplit: true,
        height: ri === 1 ? { value: 320, rule: D.HeightRule.ATLEAST } : ri > 1 ? { value: CAL_COL, rule: D.HeightRule.EXACT } : undefined,
        children: [
          ...calHalf(pair[0], ri, kn, weeks),
          cell('', { w: CAL_GAP, keepNext: kn, borders: { top: B_N, bottom: B_N, left: ri > 0 && pair[0] ? B_S : B_N, right: ri > 0 && pair[1] ? B_S : B_N } }),
          ...calHalf(pair[1], ri, kn, weeks),
        ],
      }));
    }
    return new D.Table({ width: { size: sum(cols), type: D.WidthType.DXA }, columnWidths: cols, rows, alignment: D.AlignmentType.CENTER, borders: TABLE_NONE });
  };

  const section = (s: Section): any[] => {
    switch (s.type) {
      case 'rich': return s.blocks.length ? rich(s.blocks) : [];
      case 'lines': return s.lines.map((l) => para(l, { spacing: { before: 0, after: 60 } }));
      case 'venues': return [venues(s.rows)];
      case 'contacts': return [contacts(s.teams)];
      case 'rosters': return pairs(s.teams).flatMap((p) => [rosterPair(p), pairGap()]);
      case 'deficiencies': return s.teams.flatMap((t) => [
        para([run(t.team, { bold: true })], { spacing: { before: 120, after: 60 }, keepNext: true }),
        ...t.lines.map((l) => new D.Paragraph({ bullet: { level: 0 }, spacing: { before: 0, after: 40 }, children: [run(l)] })),
      ]);
      case 'rounds': return s.rounds.flatMap((r, i) => [roundTable(r, s.withRef), ...(i < s.rounds.length - 1 ? [gap()] : [])]);
      case 'links': return s.links.map((l) => para([run(`${l.label}: `), link(l.url, l.url)]));
      case 'signature': {
        if (!s.name) return [];
        const sig: any[] = [run(s.name)];
        if (s.email) sig.push(new D.TextRun({ text: '', break: 1 }), link(s.email, `mailto:${s.email}`));
        if (s.phone) sig.push(new D.TextRun({ text: `tel: ${s.phone}`, break: 1 }));
        return [para(sig, { spacing: { before: 240, after: 0 } })];
      }
      case 'calendar': {
        const ps = pairs(s.months);
        return ps.flatMap((p, i) => [calendarPair(p), ...(i < ps.length - 1 ? [gap()] : [])]);
      }
    }
  };

  const ch: any[] = [];
  ch.push(para(model.title, { heading: D.HeadingLevel.TITLE, spacing: { before: 0, after: 120 } }));
  for (const s of model.subtitles) ch.push(para(s, { style: 'Subtitle' }));
  ch.push(new D.Paragraph({ spacing: { before: 240, after: 0 }, children: [] }));
  ch.push(...section(model.intro));
  for (const c of model.chapters) {
    ch.push(para(c.title, { heading: D.HeadingLevel.HEADING_1, numbering: { reference: 'kap', level: 0 }, keepNext: true, pageBreakBefore: c.pageBreak, spacing: { before: c.pageBreak ? 0 : 240, after: 120 } }));
    const body = c.sections.flatMap(section);
    ch.push(...(body.length ? body : [gap()]));
  }

  const small = 18;
  return new D.Document({
    title: `${model.title} – úvodní zpravodaj`,
    styles: {
      default: {
        document: { run: { font: FONT, size: FS }, paragraph: { spacing: { before: 0, after: 0 } } },
        title: { run: { font: FONT, size: 40, bold: true, color: '000000' }, paragraph: { alignment: D.AlignmentType.CENTER, spacing: { before: 0, after: 120 } } },
        heading1: { run: { font: FONT, size: 28, bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } },
        hyperlink: { run: { color: '0563C1', underline: { type: D.UnderlineType.SINGLE } } },
      },
      paragraphStyles: [{
        id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 28 }, paragraph: { alignment: D.AlignmentType.CENTER, spacing: { before: 60, after: 60 } },
      }],
    },
    numbering: {
      config: [
        { reference: 'kap', levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 432, hanging: 432 } } } }] },
        { reference: 'rich-ol', levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [{
      headers: { default: new D.Header({ children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.TextRun({ text: model.header, size: small })] })] }) },
      footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ size: small, children: ['Strana ', D.PageNumber.CURRENT, ' z ', D.PageNumber.TOTAL_PAGES] })] })] }) },
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN_Y, right: MARGIN_X, bottom: MARGIN_Y, left: MARGIN_X, header: HDR_DIST, footer: HDR_DIST } } },
      children: ch,
    }],
  });
}

// DOCX of the zpravodaj z kola (docx, loaded on demand). Port of sscr-zpravodaj buildDocx: every match its own
// table (cantSplit + keepNext → never split across pages), standings, Různé; header / titles by the profile.
import type { MatchView, RoundModel } from '../../../shared/bulletin/round';
import { refLine, STAND_HDRS } from '../../../shared/bulletin/round';
import type { RichBlock } from '../../../shared/bulletin/rich';
import {
  C_ALT, C_BORDER, C_HDR, CONTENT, HDR_DIST, MARGIN_B, MARGIN_T, MARGIN_X, PAGE_H, PAGE_W, STAND_ALIGN, cellLine, matchCols,
  sum, type MatchLayout,
} from '../../../shared/bulletin/roundLayout';
import { FONT } from './layout';

type Docx = typeof import('docx');

export async function buildRoundDocxBlob(model: RoundModel, lay: MatchLayout, standCols: number[]): Promise<Blob> {
  const D: Docx = await import('docx');
  return D.Packer.toBlob(buildDocument(D, model, lay, standCols));
}

function buildDocument(D: Docx, model: RoundModel, lay: MatchLayout, standCols: number[]) {
  const fs = model.fontPt * 2;
  const B_S = { style: D.BorderStyle.SINGLE, size: 4, color: C_BORDER };
  const B_ALL = { top: B_S, bottom: B_S, left: B_S, right: B_S };
  const ALIGN = { left: D.AlignmentType.LEFT, center: D.AlignmentType.CENTER, right: D.AlignmentType.RIGHT };
  type CellOpts = { w: number; bold?: boolean; align?: keyof typeof ALIGN; bg?: string; span?: number; vm?: number; keepNext?: boolean };
  // Exact line height 1.2 × font: with "auto" spacing real Calibri pushes the text to the top of the cell.
  const cell = (text: unknown, o: CellOpts) => {
    const vm = o.vm ?? 24;
    return new D.TableCell({
      width: { size: o.w, type: D.WidthType.DXA },
      columnSpan: o.span ?? 1,
      verticalAlign: D.VerticalAlign.CENTER,
      shading: o.bg ? { fill: o.bg, type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
      borders: B_ALL,
      margins: { top: vm, bottom: vm, left: 90, right: 90 },
      children: [new D.Paragraph({
        alignment: ALIGN[o.align ?? 'left'],
        keepNext: o.keepNext ?? false, // keeps the row with the next one → the table does not split
        keepLines: true,
        spacing: { before: 0, after: 0, line: cellLine(fs), lineRule: D.LineRuleType.EXACT },
        children: [new D.TextRun({ text: String(text ?? ''), bold: o.bold || undefined, size: fs, font: FONT })],
      })],
    });
  };
  const row = (cells: InstanceType<Docx['TableCell']>[]) => new D.TableRow({ cantSplit: true, children: cells });
  const rule = (color: string | undefined, size = 6) =>
    color ? { bottom: { style: D.BorderStyle.SINGLE, size, color, space: 1 } } : undefined;

  const matchTable = (m: MatchView) => {
    const cols = matchCols(lay);
    const h = { bold: true, bg: C_HDR, vm: 14, keepNext: true };
    const rows = [row([
      cell(m.nr, { w: lay.board, align: 'center', ...h }),
      cell(m.home, { w: lay.name + lay.elo, span: 2, ...h }),
      cell(m.score, { w: lay.result, align: 'center', ...h }),
      cell(m.away, { w: lay.elo + lay.name, span: 2, align: 'right', ...h }),
    ])];
    m.games.forEach((g, i) => {
      const keepNext = i < m.games.length - 1 || model.withRef; // the last row is not glued to what follows
      rows.push(row([
        cell(i + 1, { w: lay.board, align: 'center', keepNext }),
        cell(g.home, { w: lay.name, keepNext }),
        cell(g.homeElo, { w: lay.elo, align: 'right', keepNext }),
        cell(g.result, { w: lay.result, align: 'center', keepNext }),
        cell(g.awayElo, { w: lay.elo, keepNext }),
        cell(g.away, { w: lay.name, keepNext }),
      ]));
    });
    if (model.withRef) rows.push(row([cell(refLine(m.ref), { w: sum(cols), span: 6 })]));
    return new D.Table({ width: { size: sum(cols), type: D.WidthType.DXA }, columnWidths: cols, rows });
  };

  const standings = () => new D.Table({
    width: { size: CONTENT, type: D.WidthType.DXA },
    columnWidths: standCols,
    rows: [
      row(STAND_HDRS.map((x, i) => cell(x, { w: standCols[i], bold: true, bg: C_HDR, align: STAND_ALIGN[i], keepNext: true }))),
      ...model.standings.map((vals, idx) => row(vals.map((v, i) => cell(v, {
        w: standCols[i], bg: idx % 2 === 1 ? C_ALT : undefined, align: STAND_ALIGN[i], keepNext: idx < model.standings.length - 1,
      })))),
    ],
  });

  let olInstance = 0;
  const rich = (blocks: RichBlock[]) => {
    let prev: string | null = null;
    return blocks.map((bl) => {
      if (bl.list === 'ordered' && prev !== 'ordered') olInstance++;
      prev = bl.list;
      return new D.Paragraph({
        spacing: { before: 0, after: 100 },
        bullet: bl.list === 'bullet' ? { level: 0 } : undefined,
        numbering: bl.list === 'ordered' ? { reference: 'rich-ol', level: 0, instance: olInstance } : undefined,
        children: bl.runs.map((r) => {
          const tr = new D.TextRun({ text: r.text, size: fs, bold: r.b || undefined, italics: r.i || undefined, underline: r.u ? {} : undefined, style: r.link ? 'Hyperlink' : undefined });
          return r.link ? new D.ExternalHyperlink({ link: r.link, children: [tr] }) : tr;
        }),
      });
    });
  };

  const ch = model.chap;
  const chapter = (i: number, before: number) => new D.Paragraph({
    keepNext: true,
    spacing: { before, after: 80 },
    border: rule(ch.rule),
    children: [new D.TextRun({ text: ch.labels[i], bold: true, size: Math.round(ch.size * 2), color: ch.color })],
  });
  // one empty 11 pt line between matches
  const gap = () => new D.Paragraph({ spacing: { before: 0, after: 0, line: 240, lineRule: D.LineRuleType.AUTO }, children: [] });

  const children: any[] = model.titles.map((t, i) => new D.Paragraph({
    alignment: ALIGN[t.align],
    keepNext: true,
    spacing: { before: 0, after: Math.round(t.after * 20) },
    border: i === model.titles.length - 1 ? rule(model.profile.titleRule, 12) : undefined,
    children: [new D.TextRun({ text: t.text, bold: !!t.bold, size: Math.round(t.size * 2), color: t.color })],
  }));
  children.push(chapter(0, 60));
  model.matches.forEach((m, i) => {
    children.push(matchTable(m));
    if (i < model.matches.length - 1) children.push(gap());
  });
  children.push(chapter(1, 200), standings(), chapter(2, 200), ...rich(model.rozne.blocks));

  // Page header by the profile: centred text, or left / right (right part on a right tab stop at the margin).
  const hd = model.hdr;
  const hRun = (text: string) => new D.TextRun({ text, size: Math.round(hd.size * 2), color: hd.color });
  const hRuns = hd.c != null ? [hRun(hd.c)] : !hd.l ? [hRun(hd.r ?? '')] : [hRun(hd.l), ...(hd.r ? [hRun(`\t${hd.r}`)] : [])];
  const header = new D.Header({
    children: [new D.Paragraph({
      alignment: hd.c != null ? D.AlignmentType.CENTER : hd.l ? D.AlignmentType.LEFT : D.AlignmentType.RIGHT,
      tabStops: [{ type: D.TabStopType.RIGHT, position: CONTENT }],
      spacing: { before: 0, after: 0 },
      border: rule(hd.rule, 4),
      children: hRuns,
    })],
  });

  return new D.Document({
    title: model.docTitle,
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } },
        hyperlink: { run: { color: '0563C1', underline: { type: D.UnderlineType.SINGLE } } },
      },
    },
    numbering: {
      config: [{ reference: 'rich-ol', levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: D.AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }],
    },
    sections: [{
      headers: { default: header },
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN_T, right: MARGIN_X, bottom: MARGIN_B, left: MARGIN_X, header: HDR_DIST, footer: HDR_DIST } } },
      children,
    }],
  });
}

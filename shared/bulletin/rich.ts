// Rich text of the bulletin's editable chapters: stored as a Quill Delta (ops), rendered from a simple
// line model (ported from sscr-zpravodaj deltaBlocks) into the HTML preview, DOCX and PDF.

export type DeltaOp = { insert?: unknown; attributes?: Record<string, unknown> };
export type RichRun = { text: string; b?: boolean; i?: boolean; u?: boolean; link?: string };
export type RichBlock = { list: 'bullet' | 'ordered' | null; runs: RichRun[] };

/** Delta → lines. Line attributes (list) sit on the line's closing \n; embeds are ignored; trailing empty lines dropped. */
export function deltaBlocks(ops: DeltaOp[] | null | undefined): RichBlock[] {
  const blocks: RichBlock[] = [];
  let runs: RichRun[] = [];
  for (const op of ops ?? []) {
    if (typeof op.insert !== 'string') continue;
    const a = op.attributes ?? {};
    op.insert.split('\n').forEach((part, idx) => {
      if (idx > 0) {
        blocks.push({ list: a.list === 'bullet' || a.list === 'ordered' ? a.list : null, runs });
        runs = [];
      }
      if (!part) return;
      const r: RichRun = { text: part };
      if (a.bold) r.b = true;
      if (a.italic) r.i = true;
      if (a.underline) r.u = true;
      if (typeof a.link === 'string' && a.link) r.link = a.link;
      runs.push(r);
    });
  }
  if (runs.length) blocks.push({ list: null, runs });
  while (blocks.length && !blocks[blocks.length - 1].runs.length && !blocks[blocks.length - 1].list) blocks.pop();
  return blocks;
}

/** Plain paragraphs (a leading "• " makes a bullet item) → Delta ops — used for the default texts. */
export function textDelta(paras: string[]): DeltaOp[] {
  const ops: DeltaOp[] = [];
  for (const p of paras) {
    const bullet = p.startsWith('• ');
    const text = bullet ? p.slice(2) : p;
    if (text) ops.push({ insert: text });
    ops.push(bullet ? { insert: '\n', attributes: { list: 'bullet' } } : { insert: '\n' });
  }
  return ops;
}

export const blocksText = (blocks: RichBlock[]) => blocks.map((b) => b.runs.map((r) => r.text).join('')).join('\n');

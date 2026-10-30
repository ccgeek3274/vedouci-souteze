// Page breaks of the zpravodaj z kola preview (port of sscr-zpravodaj paginatePreview). The preview is one long sheet;
// here it is split into A4 pages. Where a new page starts comes from the real PDF layout: pdfmake builds the PDF in
// the background and its pageBreakBefore reports the page of every block (data-pg in the preview = id of the PDF node,
// paragraphs of Různé = r + order). Until the PDF is there (or when it fails) an estimate from the preview's own
// dimensions applies, with the same rules: a match or a table never splits, a chapter title stays with what follows,
// a paragraph of Různé moves whole.
// Editors' DOM is not touched: a block moves to the next page through margin-top (Quill paragraphs through a generated
// stylesheet); gaps between pages and the headers of further pages are overlays in `layer`.
// The editor toolbars are not in the document → a page with them is longer in the preview by their height.
import { MARGIN_B, PAGE_H } from '../../../shared/bulletin/roundLayout';

const PG_H = PAGE_H / 15;
const PG_MB = MARGIN_B / 15;
export const PG_GAP = 22;

/** PDF node id → page number (from pdfmake's pageBreakBefore). */
export type PageMap = Record<string, number>;

type Unit = { el: HTMLElement; key?: string; keep?: boolean; ghost?: boolean; sel?: string; mt?: number };

const RICH_SEL = '.rdoc .ql-editor > ';

function units(doc: HTMLElement): Unit[] {
  const out: Unit[] = [];
  for (const el of Array.from(doc.children) as HTMLElement[]) {
    if (el.classList.contains('rdoc-top') || el.classList.contains('pg-layer')) continue;
    if (!el.classList.contains('d-rich')) {
      out.push({ el, key: el.dataset.pg, keep: el.dataset.pgKeep != null });
      continue;
    }
    // Různé: the bar and the Quill toolbar are not in the document; the paragraphs (and list items) are the units
    for (const c of Array.from(el.querySelectorAll<HTMLElement>('.d-rich-bar, .ql-toolbar, .ql-editor'))) {
      if (!c.classList.contains('ql-editor')) { out.push({ el: c, ghost: true }); continue; }
      let r = 0;
      Array.from(c.children).forEach((p, i) => {
        if (p.tagName !== 'OL' && p.tagName !== 'UL') { out.push({ el: p as HTMLElement, key: `r${r++}`, sel: `${RICH_SEL}:nth-child(${i + 1})` }); return; }
        Array.from(p.children).forEach((li, j) => {
          out.push({ el: li as HTMLElement, key: `r${r++}`, sel: `${RICH_SEL}:nth-child(${i + 1}) > :nth-child(${j + 1})` });
        });
      });
    }
  }
  return out;
}

/** Splits the preview `doc` into pages; `layer` (absolutely positioned, empty in React) gets the overlays. */
export function paginate(doc: HTMLElement, layer: HTMLElement, css: HTMLStyleElement, map: PageMap | null) {
  // start from a clean state: no shifts, no overlays
  css.textContent = '';
  layer.replaceChildren();
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('.pg-shift'))) {
    el.classList.remove('pg-shift');
    el.style.removeProperty('--pg');
  }
  doc.style.removeProperty('--pgh');
  if (!doc.offsetHeight) return;

  const docTop = doc.getBoundingClientRect().top;
  const top = (el: Element) => el.getBoundingClientRect().top - docTop;
  const bottom = (el: Element) => el.getBoundingClientRect().bottom - docTop;
  const rules: Record<string, number> = {};
  // moves a block so that it starts at y (a few iterations because of collapsing margins)
  const shiftTo = (u: Unit, y: number) => {
    for (let it = 0; it < 4; it++) {
      const dy = y - top(u.el);
      if (Math.abs(dy) < 0.5) return;
      u.mt = (u.mt ?? (parseFloat(getComputedStyle(u.el).marginTop) || 0)) + dy;
      if (u.sel) {
        rules[u.sel] = u.mt;
        css.textContent = `@media screen{${Object.entries(rules).map(([k, v]) => `${k}{margin-top:${v.toFixed(2)}px!important}`).join('')}}`;
      } else {
        u.el.classList.add('pg-shift');
        u.el.style.setProperty('--pg', `${u.mt.toFixed(2)}px`);
      }
    }
  };

  const list = units(doc);
  if (!list.length) return;
  const hdr = doc.querySelector<HTMLElement>('.rdoc-hdr');
  const CT = top(list[0].el); // start of the text from the top edge of a page
  const HT = hdr ? top(hdr) : 0; // page header from the top edge
  const pages = [{ top: 0, h: PG_H }];
  let pg = pages[0];
  let pageNo = 1;
  for (let i = 0; i < list.length;) {
    // group: title(s) + what follows them (toolbars do not count); with the PDF map block by block
    let j = i;
    if (!map) while (j < list.length - 1 && (list[j].keep || list[j].ghost)) j++;
    let gh = 0;
    for (let k = i; k <= j; k++) {
      if (!list[k].ghost) continue;
      const cs = getComputedStyle(list[k].el);
      gh += list[k].el.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    }
    let brk = false;
    if (map) {
      const p = list[i].key ? map[list[i].key!] : undefined; // toolbars and extra empty lines are not in the PDF
      brk = p != null && p > pageNo;
      if (brk) pageNo = p!;
    } else {
      const t = top(list[i].el), b = bottom(list[j].el);
      brk = b - gh > pg.top + pg.h - PG_MB + 0.5 && t > pg.top + CT + 0.5;
    }
    if (brk) {
      pg = { top: pg.top + pg.h + PG_GAP, h: PG_H };
      pages.push(pg);
      shiftTo(list[i], pg.top + CT);
    }
    pg.h += gh;
    i = j + 1;
  }

  pages.slice(1).forEach((p, k) => {
    const gap = document.createElement('div');
    gap.className = 'pg-gap';
    gap.style.top = `${p.top - PG_GAP}px`;
    gap.style.height = `${PG_GAP}px`;
    gap.textContent = `strana ${k + 2} / ${pages.length}`;
    layer.appendChild(gap);
    if (hdr) {
      const h = hdr.cloneNode(true) as HTMLElement;
      h.classList.add('pg-hdr');
      h.style.top = `${p.top + HT}px`;
      const cs = getComputedStyle(doc);
      h.style.left = cs.paddingLeft;
      h.style.right = cs.paddingRight;
      layer.appendChild(h);
    }
  });
  doc.style.setProperty('--pgh', `${pg.top + pg.h}px`);
}

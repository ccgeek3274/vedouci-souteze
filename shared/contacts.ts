// Paste of contact cells copied from Excel (tab-separated, one contact per line) or one free-text line
// ("Petr Kolman, petr@x.cz, Tel. 777 466 606"). Cells are classified, not taken by position:
// e-mail by "@", phone by ≥ 9 digits, the first remaining text is the name.
import { formatPhone } from './text';

export type PastedContact = { name: string; phone: string; email: string };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function classify(cells: string[]): PastedContact {
  const c: PastedContact = { name: '', phone: '', email: '' };
  for (const raw of cells) {
    const v = raw.trim();
    if (!v) continue;
    const mail = v.match(EMAIL);
    const digits = v.replace(/\D/g, '');
    if (mail && !c.email) c.email = mail[0];
    else if (!mail && digits.length >= 9 && digits.length <= 12 && /^[\d\s+()/.-]*(tel\.?|telefon)?[\d\s+()/.-]*$/i.test(v.replace(/^tel\.?\s*/i, '')) && !c.phone) {
      c.phone = formatPhone(v.replace(/^tel(efon)?\.?:?\s*/i, ''));
    } else if (!mail && !c.name && !/^\d/.test(v)) c.name = v;
  }
  return c;
}

/** Contacts from pasted text, or null when the text is a plain single value (let the input handle it). */
export function parseContactPaste(text: string): PastedContact[] | null {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  const tabular = lines.some((l) => l.includes('\t'));
  if (!tabular) {
    // one free-text line with separators and at least an e-mail or phone in it
    if (lines.length > 1 || !/[;,|]/.test(lines[0]) || !(EMAIL.test(lines[0]) || /\d{3}\s?\d{3}\s?\d{3}/.test(lines[0]))) return null;
  }
  const out = lines
    .map((l) => classify(tabular ? l.split('\t') : l.split(/[;,|]/)))
    .filter((c) => c.name || c.phone || c.email);
  return out.length ? out : null;
}

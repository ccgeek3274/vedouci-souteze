// Text helpers shared by web + worker (ported from sscr-soupiska/index.html).

export function stripDiacritics(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function fold(s: unknown): string {
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Every word of the query appears in the text (diacritics/case-insensitive). */
export function matchName(text: string, query: string): boolean {
  const t = fold(text);
  const q = fold(query);
  if (!q) return true;
  return q.split(' ').every((w) => t.includes(w));
}

/** Czech phone number → "604 409 805" (drops +420); anything else is returned trimmed. */
export function formatPhone(v: unknown): string {
  const s = String(v ?? '').trim();
  const digits = s.replace(/\D/g, '');
  const nine = digits.length === 12 && digits.startsWith('420') ? digits.slice(3) : digits;
  if (nine.length === 9 && /^[\d\s+()/-]+$/.test(s)) {
    return `${nine.slice(0, 3)} ${nine.slice(3, 6)} ${nine.slice(6)}`;
  }
  return s;
}

// Words that say nothing about which club a team belongs to.
const GENERIC_WORDS = new Set([
  'sk', 'tj', 'sokol', 'sachovy', 'sachovy', 'klub', 'sachklub', 'mesta', 'sachistu', 'sachy', 'so', 'ss',
  'ddm', 'spartak', 'sparta', 'auto', 'skoda', 'nad', 'pod', 'labem', 'vltavou', 'jizerou', 'cernymi', 'lesy',
  'pro', 'radost', 'tp', 'nova', 'as', 'kdjs', 'oddil', 'z', 's', 'a', 'mesto', 'cesky', 'lev', 'jawa', 'joly', 'aero',
]);

function tokens(name: string): string[] {
  return fold(name).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean);
}

/** Team letter ("A", "B", …) when the name ends with a single letter; '' otherwise. */
export function teamLetter(name: string): string {
  const t = tokens(name);
  const last = t[t.length - 1] ?? '';
  return /^[a-z]$/.test(last) && t.length > 1 ? last.toUpperCase() : '';
}

/**
 * Similarity of two team names, 0..1. Names differ wildly across documents
 * ("Kralupy C" / "TJ Kralupy nad Vltavou C", "Sokol Bakov nad Jizerou B" / "Šachový klub Bakov nad Jizerou B"),
 * so: two different team letters → 0; otherwise the share of significant words of the shorter name found
 * in the other. A letter missing on one side ("Aero Odolena voda" / "Odolena Voda A") is tolerated with a penalty.
 */
export function teamNameScore(a: string, b: string): number {
  if (fold(a) === fold(b)) return 1;
  const la = teamLetter(a);
  const lb = teamLetter(b);
  if (la && lb && la !== lb) return 0;
  const letterPenalty = la === lb ? 1 : 0.85;
  const sig = (n: string) => tokens(n).filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w) && !/^[a-z]$/.test(w));
  const ta = sig(a);
  const tb = sig(b);
  if (!ta.length || !tb.length) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const hits = short.filter((w) => long.some((x) => x === w || (w.length >= 5 && x.length >= 5 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))));
  return (hits.length / short.length) * 0.9 * letterPenalty;
}

/** Best match of `name` among candidates (score ≥ threshold), or null. */
export function bestTeamMatch<T>(name: string, candidates: T[], nameOf: (c: T) => string, threshold = 0.6): T | null {
  let best: T | null = null;
  let bestScore = threshold;
  for (const c of candidates) {
    const s = teamNameScore(name, nameOf(c));
    if (s > bestScore || (s === 1 && bestScore < 1)) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

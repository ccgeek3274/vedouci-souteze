// Light check of the contact names of a team (captain, deputy, communication, referees) against the rosters — no
// chess.cz. Rosters, chess.cz and the bulletins write "Příjmení Jméno"; a contact typed as "Jméno Příjmení" ends up
// in the bulletin (address book, referees) in the other order.
import { fold } from '../text';

/** Academic titles and ml./st. — not part of the name. */
const SKIP = new Set(['ing', 'mgr', 'bc', 'mudr', 'mvdr', 'judr', 'phdr', 'rndr', 'paeddr', 'csc', 'phd', 'doc', 'prof', 'dis', 'ml', 'st']);
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !SKIP.has(w));

export type ContactNameFinding = {
  /** index of the contact in the list given */
  index: number;
  text: string;
  /** name in the right order, when it can be derived */
  suggestion: string | null;
};

/**
 * `own` = player names on the team's roster, `others` = on the other rosters of the competition.
 * 1. A roster player with the same words in another order → the contact has them swapped (suggestion = roster name).
 * 2. Not on any roster: the first word is a first name on the rosters (last word there) and never a surname, the last
 *    word never a first name → probably "Jméno Příjmení" (suggestion = first word moved to the end).
 */
export function contactNameFindings(contacts: { role: string; name: string }[], own: string[], others: string[]): ContactNameFinding[] {
  const roster = [...own, ...others].map((n) => ({ name: n, w: words(n) })).filter((p) => p.w.length >= 2);
  const firstNames = new Set(roster.map((p) => p.w[p.w.length - 1]));
  const surnames = new Set(roster.map((p) => p.w[0]));
  const sorted = (w: string[]) => [...w].sort().join(' ');
  const out: ContactNameFinding[] = [];
  contacts.forEach((ct, index) => {
    const w = words(ct.name);
    if (w.length < 2 || roster.some((p) => p.w.join(' ') === w.join(' '))) return;
    const swapped = roster.find((p) => sorted(p.w) === sorted(w));
    if (swapped) {
      const where = own.includes(swapped.name) ? 'na soupisce' : 'na soupisce jiného družstva';
      out.push({ index, text: `„${ct.name.trim()}“ — ${where} „${swapped.name}“: přehozené jméno a příjmení?`, suggestion: swapped.name });
      return;
    }
    const first = w[0], last = w[w.length - 1];
    if (firstNames.has(first) && !surnames.has(first) && !firstNames.has(last)) {
      const parts = ct.name.trim().split(/\s+/);
      out.push({
        index,
        text: `„${ct.name.trim()}“ — vypadá jako Jméno Příjmení (soupisky a zpravodaj mají Příjmení Jméno)`,
        suggestion: parts.length === w.length ? [...parts.slice(1), parts[0]].join(' ') : null,
      });
    }
  });
  return out;
}

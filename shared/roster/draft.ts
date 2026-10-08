// Roster draft = the JSON format of sscr-soupiska (app "sscr-soupiska", version 1).
// It is the single interchange format for rosters: the xlsx parser produces it, captains'
// saved drafts are it, and the roster import API accepts it.

export const FLAG_CODES = ['K', 'ZK', 'H', 'V', 'C'] as const;
export type FlagCode = (typeof FLAG_CODES)[number];
const FLAG_GROUPS: FlagCode[][] = [['K', 'ZK'], ['H', 'V', 'C']];

export type DraftPlayer = {
  jmeno: string;
  rok: number | '';
  rokSrc?: 'api' | 'user' | '';
  lok: number | '';
  fide: number | '';
  ozn: string;          // space-joined subset of K ZK H V C (max one of K|ZK, one of H|V|C)
  z: boolean;           // starting line-up
  eloLok?: number | '';
  eloFide?: number | '';
  source?: string;
};

export type DraftContact = { jmeno: string; tel: string; email: string };

export type DraftExtra = {
  kapJmeno: string; kapTel: string; kapEmail: string;
  zastJmeno: string; zastTel: string; zastEmail: string;
  hraciMistnost: string;
  prezuvky: string;
  preferZacatek: string;
  pozadavkyLosovani: string;
  komunikace: DraftContact[];
  rozhodci: DraftContact[];
};

export type RosterDraft = {
  app: 'sscr-soupiska';
  version: 1;
  savedAt?: string;
  header: { kraj: string; soutez: string; druzstvo: string; oddil: string; krajKey?: string };
  zakladCount: number;
  players: DraftPlayer[];
  extra: DraftExtra;
};

export function emptyExtra(): DraftExtra {
  return {
    kapJmeno: '', kapTel: '', kapEmail: '', zastJmeno: '', zastTel: '', zastEmail: '',
    hraciMistnost: '', prezuvky: '', preferZacatek: '', pozadavkyLosovani: '',
    komunikace: [], rozhodci: [],
  };
}

/** Positive integer or '' (0 / null / garbage = missing, typically no FIDE id or birth year). */
export function numOrBlank(v: unknown): number | '' {
  const n = parseInt(String(v ?? ''), 10);
  return !Number.isNaN(n) && n > 0 ? n : '';
}

/** Toggle a flag respecting the groups (K|ZK and H|V|C are exclusive); returns sorted string. */
export function toggleFlag(current: string, v: string): string {
  const code = v.toUpperCase() as FlagCode;
  if (!FLAG_CODES.includes(code)) return current || '';
  let set = String(current || '').split(' ').filter(Boolean);
  if (set.includes(code)) {
    set = set.filter((x) => x !== code);
  } else {
    const group = FLAG_GROUPS.find((g) => g.includes(code)) ?? [];
    set = set.filter((x) => !group.includes(x as FlagCode));
    set.push(code);
  }
  set.sort((a, b) => FLAG_CODES.indexOf(a as FlagCode) - FLAG_CODES.indexOf(b as FlagCode));
  return set.join(' ');
}

/** Free-text flags ("H Z", "zk", "K, Z") → { ozn, z }. */
export function parseFlags(flags: unknown): { ozn: string; z: boolean } {
  let ozn = '';
  let z = false;
  String(flags ?? '').toUpperCase().split(/[\s,;/]+/).filter(Boolean).forEach((t) => {
    if (t === 'Z') z = true;
    else if ((FLAG_CODES as readonly string[]).includes(t)) ozn = toggleFlag(ozn, t);
  });
  return { ozn, z };
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());

function normContacts(list: unknown): DraftContact[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((c: any) => ({ jmeno: str(c?.jmeno), tel: str(c?.tel), email: str(c?.email) }))
    .filter((c) => c.jmeno || c.tel || c.email);
}

/**
 * Validate + normalize an untrusted draft (e.g. uploaded JSON). Throws with a Czech message
 * when it is not a roster draft. Mirrors sscr-soupiska applyDraft: only `players` is required.
 */
export function normalizeDraft(data: unknown): RosterDraft {
  if (!data || typeof data !== 'object' || !Array.isArray((data as any).players)) {
    throw new Error('Soubor neobsahuje platná data soupisky (chybí seznam hráčů).');
  }
  const d = data as any;
  const h = d.header ?? {};
  const e = d.extra ?? {};
  const players: DraftPlayer[] = d.players
    .map((p: any) => {
      const flags = parseFlags(p?.ozn);
      return {
        jmeno: str(p?.jmeno),
        rok: numOrBlank(p?.rok),
        rokSrc: p?.rokSrc === 'api' || p?.rokSrc === 'user' ? p.rokSrc : '',
        lok: numOrBlank(p?.lok),
        fide: numOrBlank(p?.fide),
        ozn: flags.ozn,
        z: p?.z === true || p?.z === 'Z' || flags.z,
        eloLok: numOrBlank(p?.eloLok),
        eloFide: numOrBlank(p?.eloFide),
        source: str(p?.source) || 'draft',
      } satisfies DraftPlayer;
    })
    .filter((p: DraftPlayer) => p.jmeno || p.lok !== '');
  const zCount = players.filter((p) => p.z).length;
  return {
    app: 'sscr-soupiska',
    version: 1,
    savedAt: str(d.savedAt) || undefined,
    header: { kraj: str(h.kraj), soutez: str(h.soutez), druzstvo: str(h.druzstvo), oddil: str(h.oddil) },
    zakladCount: parseInt(d.zakladCount, 10) > 0 ? parseInt(d.zakladCount, 10) : zCount || 8,
    players,
    extra: {
      ...emptyExtra(),
      ...Object.fromEntries(Object.entries(emptyExtra()).filter(([, v]) => typeof v === 'string').map(([k]) => [k, str(e[k])])),
      komunikace: normContacts(e.komunikace),
      rozhodci: normContacts(e.rozhodci),
    } as DraftExtra,
  };
}

/** Human-readable problems of a roster (shown during manual verification). */
export function draftWarnings(d: RosterDraft, boards: number, nowYear = new Date().getFullYear()): string[] {
  const out: string[] = [];
  if (!d.players.length) out.push('Soupiska neobsahuje žádné hráče.');
  const noLok = d.players.filter((p) => p.lok === '');
  if (noLok.length) out.push(`Bez čísla LOK: ${noLok.map((p) => p.jmeno).join(', ')}.`);
  const badYear = d.players.filter((p) => p.rok !== '' && (p.rok < 1900 || p.rok > nowYear));
  if (badYear.length) out.push(`Podezřelý rok narození: ${badYear.map((p) => `${p.jmeno} (${p.rok})`).join(', ')}.`);
  const lokSeen = new Map<number, string>();
  for (const p of d.players) {
    if (p.lok === '') continue;
    if (lokSeen.has(p.lok)) out.push(`Duplicitní LOK ${p.lok}: ${lokSeen.get(p.lok)} a ${p.jmeno}.`);
    lokSeen.set(p.lok, p.jmeno);
  }
  const exp = expectedBase(d.players.map((p) => ({ flags: p.ozn })), boards);
  const missingZ = d.players.filter((p, i) => exp[i] === true && !p.z).map((p) => p.jmeno);
  const extraZ = d.players.filter((p, i) => exp[i] === false && p.z).map((p) => p.jmeno);
  if (missingZ.length || extraZ.length) {
    out.push(`Základní sestava neodpovídá pravidlu (prvních ${boards} hráčů, nejvýše ${maxLetters(boards)} H/V/C, další písmenkoví se přeskočí)`
      + (missingZ.length ? ` — má mít Z: ${missingZ.join(', ')}` : '') + (extraZ.length ? ` — nemá mít Z: ${extraZ.join(', ')}` : '') + '.');
  }
  if (!d.players.some((p) => /\bK\b/.test(p.ozn)) && !d.extra.kapJmeno) out.push('Není uveden kapitán.');
  if (!d.extra.kapEmail && !d.extra.zastEmail && !d.extra.komunikace.some((c) => c.email)) out.push('Chybí e-mailový kontakt.');
  if (!d.extra.hraciMistnost) out.push('Chybí hrací místnost.');
  if (!d.extra.rozhodci.length) out.push('Není navržen rozhodčí.');
  return out;
}

/** true = in the starting line-up, false = not, 'optional' = a skipped letter player inside the line-up (grey zone). */
export type ExpectedZ = boolean | 'optional';

const isLetterPlayer = (flags: string) => flags.split(' ').some((f) => f === 'H' || f === 'V' || f === 'C');
export const maxLetters = (count: number) => Math.max(0, Math.ceil(count / 2) - 1);

/**
 * Expected starting line-up (Z) — sscr-soupiska `recalcZaklad`: from the top, `count` players, of which at most
 * ceil(count/2)−1 letter players (H/V/C); every further letter player is skipped and the line-up extends.
 * A skipped letter player may still be marked Z (he plays as if in Z but does not count) → 'optional'.
 * Struck players are left out (null).
 */
export function expectedBase(players: { flags: string; struck?: number }[], count: number): (ExpectedZ | null)[] {
  let assigned = 0;
  let letters = 0;
  return players.map((p) => {
    if (p.struck) return null;
    if (assigned >= count) return false;
    if (isLetterPlayer(p.flags)) {
      if (letters >= maxLetters(count)) return 'optional';
      letters++;
    }
    assigned++;
    return true;
  });
}

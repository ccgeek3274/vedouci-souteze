// Zpravodaj z kola (M9): port of sscr-zpravodaj (public/index.html) — results of the round from chess.cz
// (/round/N/matches merged with /schedule), standings (/table), referees under each match and the editable chapter
// "Různé". Draft config, chess.cz → model, formatting profiles. Pure functions shared by preview, DOCX and PDF.
import { asArray } from '../roster/verify';
import { czDateIso } from './source';
import { deltaBlocks, type DeltaOp, type RichBlock } from './rich';
import { issueDate, todayIso } from './initial';
import { refKey } from '../schedule';

// ── Config (stored as bulletins.config, key 'round-N') ──────────────────────────────────────────

export const PROFILE_KEYS = ['klasik', 'uredni', 'moderni'] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];
export const FONT_PTS = [9, 10, 11, 12] as const;
export const FONT_DEFAULT = 10;

export type RoundConfig = {
  date: string | null; // ISO date of issue; null = today
  withRef: boolean;
  profile: ProfileKey;
  fontPt: number;
  rozne: DeltaOp[] | null; // chapter Různé; null = the default text (follows the manager and the date)
};

/**
 * Data frozen in a save point (never in the draft): the standings as chess.cz returned them (whole rows) and every
 * referee of the round as printed (home team key → name). Stored as `snapshot` next to the config of the save point.
 */
export type RoundSnapshot = { standings: unknown[]; refs: Record<string, string> };

export function parseRoundSnapshot(raw: unknown): RoundSnapshot | null {
  const s = (raw && typeof raw === 'object' ? (raw as Record<string, any>).snapshot : null) as Record<string, any> | null;
  if (!s || typeof s !== 'object' || !Array.isArray(s.standings)) return null;
  const refs: Record<string, string> = {};
  if (s.refs && typeof s.refs === 'object') for (const [k, v] of Object.entries(s.refs)) if (typeof v === 'string') refs[k] = v;
  return { standings: s.standings, refs };
}

export function defaultRoundConfig(prefs: Partial<Pick<RoundConfig, 'profile' | 'fontPt' | 'withRef'>> = {}): RoundConfig {
  return {
    date: null, rozne: null,
    withRef: prefs.withRef ?? true,
    profile: PROFILE_KEYS.includes(prefs.profile as ProfileKey) ? prefs.profile! : 'klasik',
    fontPt: FONT_PTS.includes(prefs.fontPt as any) ? prefs.fontPt! : FONT_DEFAULT,
  };
}

/** Stored JSON → config (unknown / broken fields fall back to defaults; `prefs` = defaults of a new draft). */
export function normalizeRoundConfig(raw: unknown, prefs: Parameters<typeof defaultRoundConfig>[0] = {}): RoundConfig {
  const d = defaultRoundConfig(prefs);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  return {
    date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
    withRef: typeof r.withRef === 'boolean' ? r.withRef : d.withRef,
    profile: PROFILE_KEYS.includes(r.profile) ? r.profile : d.profile,
    fontPt: FONT_PTS.includes(r.fontPt) ? r.fontPt : d.fontPt,
    rozne: Array.isArray(r.rozne) ? r.rozne : null,
  };
}

// ── chess.cz results ──────────────────────────────────────────────────────────────────────────────

export type CzGame = {
  homePlayerName?: string | null; awayPlayerName?: string | null;
  homePlayerRating?: number | null; awayPlayerRating?: number | null;
  homePlayerResult?: number | null; awayPlayerResult?: number | null;
  gameForfeited?: number | null; awayPlayerId?: number | null;
};
export type CzMatch = {
  homeTeamId?: number | null; awayTeamId?: number | null;
  homeTeamName?: string; awayTeamName?: string;
  homeTeamScore?: number | null; awayTeamScore?: number | null;
  matchGames?: CzGame[] | CzGame;
};

const has = (n: unknown) => n != null && n !== '';

export function fmtHalf(v: unknown): string {
  if (v == null) return '0';
  const n = parseFloat(String(v));
  if (isNaN(n)) return String(v);
  const w = Math.floor(n), h = n - w >= 0.5;
  if (w === 0 && h) return '½';
  return h ? `${w}½` : String(w);
}
export const fmtScore = (h: unknown, a: unknown) => (h == null || a == null ? '' : `${fmtHalf(h)} – ${fmtHalf(a)}`);
/** Game result; a forfeited game (gameForfeited) as "0K : 1K" like chess.cz. */
export function fmtResult(h: unknown, a: unknown, forf?: unknown): string {
  if (Number(forf) === 1 && h != null && a != null) return `${fmtHalf(h)}K : ${fmtHalf(a)}K`;
  if (h === 1 && a === 0) return '1 : 0';
  if (h === 0 && a === 1) return '0 : 1';
  if (h === 0.5 && a === 0.5) return '½ : ½';
  return '';
}
/** Rating cell: an empty board (no player, "-", e.g. Volno) stays blank, an unrated player is 0. */
export const eloCell = (name: unknown, v: unknown) =>
  (name == null || name === '' || name === '-') && (v == null || v === '') ? '' : v != null && v !== '' ? String(v) : '0';

/** Entered neither score nor forfeits (Volno and forfeits keep a null score for good — those are not reported). */
export const isUnentered = (m: CzMatch) =>
  m.homeTeamScore == null && m.awayTeamScore == null && !asArray(m.matchGames as any).some((g: CzGame) => g && Number(g.gameForfeited) === 1);

/**
 * Games in board order as on chess.cz. The API sorts by the home roster and puts games without a home player first —
 * they belong to the last boards (3468/1, 3321/6, 3320/10). With the away roster the order is aligned with the away
 * team too (boards follow both rosters); where neither roster decides, the base order wins.
 */
export function boardOrder(games: CzGame[], awayRoster?: unknown): CzGame[] {
  const base = [...games.filter((g) => has(g.homePlayerName)), ...games.filter((g) => !has(g.homePlayerName))];
  const pos = new Map<number, number>();
  for (const r of asArray(awayRoster as any[])) if (r && r.playerId != null) pos.set(Number(r.playerId), Number(r.rosterPosition));
  const ap = (g: CzGame) => (has(g.awayPlayerName) && (pos.get(Number(g.awayPlayerId)) ?? 0) > 0 ? pos.get(Number(g.awayPlayerId))! : null);
  if (!base.some((g) => ap(g) != null)) return base;
  // chains: home in API order, away by roster position → edges i → j, then a topological sort
  const n = base.length;
  const next: number[][] = base.map(() => []);
  const indeg = base.map(() => 0);
  const chain = (idx: number[]) => { for (let k = 1; k < idx.length; k++) { next[idx[k - 1]].push(idx[k]); indeg[idx[k]]++; } };
  chain(base.flatMap((g, i) => (has(g.homePlayerName) ? [i] : [])));
  chain(base.flatMap((g, i) => (ap(g) != null ? [i] : [])).sort((a, b) => ap(base[a])! - ap(base[b])!));
  const out: CzGame[] = [];
  const done: boolean[] = [];
  while (out.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0) { pick = i; break; }
    if (pick < 0) return base; // inconsistent data → base order
    done[pick] = true;
    out.push(base[pick]);
    for (const j of next[pick]) indeg[j]--;
  }
  return out;
}

/** Board order + a missing player in a played match as "-"; a side without any player (Volno) stays empty. */
export function fixGames(m: CzMatch, awayRoster?: unknown): CzMatch {
  const games = asArray(m?.matchGames as any) as CzGame[];
  if (!games.length) return m;
  const homeAny = games.some((g) => has(g.homePlayerName));
  const awayAny = games.some((g) => has(g.awayPlayerName));
  return {
    ...m,
    matchGames: boardOrder(games, awayRoster).map((g) => ({
      ...g,
      homePlayerName: has(g.homePlayerName) || !homeAny ? g.homePlayerName : '-',
      awayPlayerName: has(g.awayPlayerName) || !awayAny ? g.awayPlayerName : '-',
    })),
  };
}

/** Does the away team need its roster to order the boards (a played match with a missing player)? */
export function needsAwayRoster(m: CzMatch): boolean {
  const gs = asArray(m.matchGames as any) as CzGame[];
  return gs.some((g) => !g.homePlayerName || !g.awayPlayerName) && gs.some((g) => g.homePlayerName) && gs.some((g) => g.awayPlayerName);
}

/** Matches of round `nr` from /schedule (pairs only, no score) and its date; null = the round is not there. */
export function scheduleRound(json: unknown, nr: number): { date: string; matches: CzMatch[] } | null {
  const r = asArray(json as any[]).find((x: any) => x && Number(x.roundNr) === nr);
  if (!r) return null;
  return {
    date: czDateIso(r.roundDate),
    matches: asArray(r.roundMatches as any[]).map((m: any) => ({
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeTeamName: m.homeTeamName || '', awayTeamName: m.awayTeamName || '',
      homeTeamScore: null, awayTeamScore: null, matchGames: [],
    })),
  };
}

/**
 * Results (/matches) merged with the schedule by team ids (else by exact names — "C" ≠ "Č"). Order and match numbers
 * follow the schedule; a match without a result stays as a pair without score and is listed in `missing`.
 */
export function mergeRound(results: CzMatch[], planned: CzMatch[] | null | undefined, rosters?: Record<number, unknown>):
  { matches: CzMatch[]; missing: string[] } {
  const res = asArray(results as any).map((m: CzMatch) => fixGames(m, rosters?.[Number(m.awayTeamId)]));
  const nkey = (m: CzMatch) => `n:${String(m.homeTeamName || '').trim().toLowerCase()}/${String(m.awayTeamName || '').trim().toLowerCase()}`;
  const key = (m: CzMatch) => (m.homeTeamId != null && m.awayTeamId != null ? `id:${m.homeTeamId}/${m.awayTeamId}` : nkey(m));
  const byKey = new Map<string, number>();
  res.forEach((m, i) => { byKey.set(key(m), i); byKey.set(nkey(m), i); });
  const used = new Set<number>();
  const out: CzMatch[] = [];
  for (const p of planned ?? []) {
    const i = byKey.get(key(p)) ?? byKey.get(nkey(p));
    if (i != null && !used.has(i)) { used.add(i); out.push(res[i]); } else out.push(p);
  }
  res.forEach((m, i) => { if (!used.has(i)) out.push(m); }); // a match outside the schedule is kept
  return { matches: out, missing: out.filter(isUnentered).map((m) => `${m.homeTeamName} – ${m.awayTeamName}`) };
}

/** Round to preselect: the last one dated today or earlier; null before the first round (→ úvodní zpravodaj). */
export function pickRound(rounds: { nr: number; date: string }[], today: string): number | null {
  let pick: number | null = null;
  for (const r of [...rounds].sort((a, b) => a.nr - b.nr)) if (/^\d{4}-\d{2}-\d{2}/.test(r.date) && r.date.slice(0, 10) <= today) pick = r.nr;
  return pick;
}

// ── Standings ─────────────────────────────────────────────────────────────────────────────────────

export const STAND_HDRS = ['P', 'Družstvo', 'Z', '+', '=', '−', 'B', 'Sk', 'V'];
export function standingsVals(t: any, idx: number): string[] {
  const n = (v: unknown) => String(v ?? 0);
  return [String(t.teamRank ?? idx + 1), String(t.teamName ?? ''), n(t.matchesPlayed), n(t.matchWins), n(t.matchDraws),
    n(t.matchLosses), n(t.points), fmtHalf(t.score), n(t.wonGames)];
}

// ── Profiles: page header, document head and chapter titles ───────────────────────────────────────

export type ProfileData = { kolo: number; compName: string; regionName: string; season: string };
export type PageHeader = { l?: string; c?: string; r?: string; size: number; color?: string; rule?: string };
export type TitleLine = { text: string; size: number; bold?: boolean; color?: string; align: 'left' | 'center'; after: number };
export type ChapterStyle = { labels: [string, string, string]; size: number; color?: string; rule?: string };
export type Profile = {
  name: string; hdr: (d: ProfileData) => PageHeader; title: (d: ProfileData) => TitleLine[]; titleRule?: string;
  chap: (d: ProfileData) => ChapterStyle;
};

/** "Kraj - Soutěž - Ročník" (missing parts left out). */
export const headerText = (d: ProfileData) => [d.regionName, d.compName, d.season].filter(Boolean).join(' - ');

export const PROFILES: Record<ProfileKey, Profile> = {
  klasik: {
    name: 'Klasický',
    hdr: (d) => ({ r: headerText(d), size: 9 }),
    title: (d) => [{ text: `Zpravodaj z kola č. ${d.kolo}`, size: 16, bold: true, align: 'center', after: 8 }],
    chap: () => ({ labels: ['1. Výsledky', '2. Pořadí družstev', '3. Různé a ostatní'], size: 10 }),
  },
  uredni: {
    name: 'Úřední',
    hdr: (d) => ({ l: [d.regionName, d.compName].filter(Boolean).join(' – '), r: d.season ? `Ročník ${d.season}` : '', size: 9, rule: '000000' }),
    title: (d) => [
      { text: d.compName, size: 18, bold: true, align: 'center', after: 3 },
      { text: [`Zpravodaj z kola č. ${d.kolo}`, d.season ? `ročník ${d.season}` : ''].filter(Boolean).join('  ·  '), size: 11, align: 'center', after: 10 },
    ],
    chap: (d) => ({ labels: [`I. VÝSLEDKY ${d.kolo}. KOLA`, 'II. POŘADÍ DRUŽSTEV', 'III. RŮZNÉ A OSTATNÍ'], size: 10, rule: '000000' }),
  },
  moderni: {
    name: 'Moderní',
    hdr: (d) => ({ c: [d.regionName, d.compName, d.season].filter(Boolean).join('  ·  '), size: 8, color: '808080' }),
    title: (d) => [
      { text: `${d.kolo}. kolo`, size: 20, bold: true, color: '2F5496', align: 'left', after: 0 },
      { text: d.compName, size: 11, color: '595959', align: 'left', after: 8 },
    ],
    titleRule: '2F5496',
    chap: () => ({ labels: ['Výsledky', 'Průběžné pořadí', 'Informace řídícího soutěže'], size: 12, color: '2F5496' }),
  },
};
export const profileOf = (key: unknown): Profile => PROFILES[key as ProfileKey] ?? PROFILES.klasik;

// ── Model ─────────────────────────────────────────────────────────────────────────────────────────

export const REF_LABEL = 'Rozhodčí: ';
export const refLine = (name: unknown) => REF_LABEL + String(name ?? '').trim();
export const DEFAULT_POZNAMKA = 'Prosím o kontrolu hráčů i výsledků, zda jsem někde neudělal chybu.';

/** Default text of Různé: the request to check results, the manager's name (bold) and the date of issue. */
export function defaultRozne(manager: string, date: string): DeltaOp[] {
  const ops: DeltaOp[] = [{ insert: `${DEFAULT_POZNAMKA}\n` }];
  if (manager) ops.push({ insert: manager, attributes: { bold: true } }, { insert: '\n' });
  ops.push({ insert: `${date}\n` });
  return ops;
}

export type GameRow = { home: string; homeElo: string; result: string; awayElo: string; away: string };
export type MatchView = {
  nr: string; home: string; away: string; score: string; games: GameRow[];
  key: string; // home team key — referee edits / RoundSnapshot.refs
  awayKey: string; // away team key (referee suggestions)
  ref: string; // referee in the document
  assigned: string; // referee from Nominace rozhodčích ('' = none)
};
export type RoundModel = {
  kolo: number; data: ProfileData; profile: Profile; fontPt: number; withRef: boolean;
  hdr: PageHeader; titles: TitleLine[]; chap: ChapterStyle;
  matches: MatchView[]; standings: string[][];
  rozne: { ops: DeltaOp[]; blocks: RichBlock[]; custom: boolean; defaults: DeltaOp[] };
  noResults: string | null; warnings: string[]; fileName: string; docTitle: string;
};

export type RoundInput = {
  kolo: number; compName: string; regionName: string; season: string; short: string; manager: string;
  results: CzMatch[]; // /round/N/matches ([] = none yet)
  planned: { date: string; matches: CzMatch[] } | null; // the round from /schedule
  rosters: Record<number, unknown>; // away rosters by chess.cz team id (board order)
  table: unknown; // /table
  keyOfCz: Map<number, string>; // chess.cz team id → app team key (refKey)
  assigned: Record<string, string>; // Nominace rozhodčích: refKey → name
  standingsLater: boolean; // a later round has been played → /table is not the standings after this round
  warnings?: string[];
};

/** Chapter title size follows the font switch, so a title is never smaller than the text under it. */
export function chapOf(p: Profile, d: ProfileData, fpt: number): ChapterStyle {
  const ch = p.chap(d);
  return { ...ch, size: ch.size + fpt - FONT_DEFAULT };
}

const czDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}. ${m}. ${y}`;
};

export function noResultsText(kolo: number, nr: { date?: string; partial?: boolean; missing?: string[]; total?: number }): string {
  if (nr.partial) {
    return `Výsledky jsou jen u ${nr.total! - nr.missing!.length} z ${nr.total} zápasů kola ${kolo}. `
      + `Bez výsledku (zatím nezadaný, nebo nehraný): ${nr.missing!.join('; ')}.`;
  }
  return `Kolo ${kolo} zatím nemá výsledky${nr.date ? ` (hraje se ${czDay(nr.date)})` : ''} — náhled ukazuje jen dvojice zápasů podle rozpisu.`;
}

const yy = (s: string) => String(parseInt(s, 10) % 100).padStart(2, '0');

/** Overrides of the live data: referees edited in the preview, standings from a restored save point. */
export type RoundOverrides = { refs?: Record<string, string>; standings?: unknown[] | null };

export function buildRoundModel(inp: RoundInput, cfg: RoundConfig, ov: RoundOverrides = {}): RoundModel {
  const d: ProfileData = { kolo: inp.kolo, compName: inp.compName, regionName: inp.regionName, season: inp.season };
  const p = profileOf(cfg.profile);
  const warnings = [...(inp.warnings ?? [])];

  const mg = mergeRound(inp.results, inp.planned?.matches, inp.rosters);
  let noResults: string | null = null;
  if (!inp.results.length) noResults = noResultsText(inp.kolo, { date: inp.planned?.date });
  else if (mg.missing.length) noResults = noResultsText(inp.kolo, { partial: true, missing: mg.missing, total: mg.matches.length });
  if (!mg.matches.length) warnings.push(`Kolo ${inp.kolo} nemá na chess.cz výsledky ani rozpis zápasů.`);
  if (inp.standingsLater && !ov.standings) warnings.push('Pořadí družstev je z chess.cz aktuální — po pozdějších kolech už neodpovídá stavu po tomto kole.');

  const matches: MatchView[] = mg.matches.map((m, i) => {
    const appKey = m.homeTeamId != null ? inp.keyOfCz.get(Number(m.homeTeamId)) : undefined;
    const key = appKey ?? `n:${m.homeTeamName ?? ''}`;
    const awayKey = (m.awayTeamId != null ? inp.keyOfCz.get(Number(m.awayTeamId)) : undefined) ?? `n:${m.awayTeamName ?? ''}`;
    const assigned = appKey ? (inp.assigned[refKey(inp.kolo, appKey)] ?? '').trim() : '';
    return {
      nr: `${inp.kolo}.${i + 1}`,
      home: m.homeTeamName || '', away: m.awayTeamName || '',
      score: fmtScore(m.homeTeamScore, m.awayTeamScore),
      games: (asArray(m.matchGames as any) as CzGame[]).map((g) => ({
        home: g.homePlayerName || '', homeElo: eloCell(g.homePlayerName, g.homePlayerRating),
        result: fmtResult(g.homePlayerResult, g.awayPlayerResult, g.gameForfeited),
        awayElo: eloCell(g.awayPlayerName, g.awayPlayerRating), away: g.awayPlayerName || '',
      })),
      key, awayKey, assigned,
      ref: ov.refs?.[key] ?? assigned,
    };
  });

  const date = issueDate(cfg.date ?? todayIso());
  const defaults = defaultRozne(inp.manager, date);
  const ops = cfg.rozne ?? defaults;
  const [y1, y2] = inp.season.split('/');
  return {
    kolo: inp.kolo, data: d, profile: p, fontPt: cfg.fontPt, withRef: cfg.withRef,
    hdr: p.hdr(d), titles: p.title(d), chap: chapOf(p, d, cfg.fontPt),
    matches,
    standings: asArray((ov.standings ?? inp.table) as any[]).map(standingsVals),
    rozne: { ops, blocks: deltaBlocks(ops), custom: !!cfg.rozne, defaults },
    noResults, warnings,
    fileName: `${(inp.short || 'soutez').toLowerCase()}_${yy(y1 ?? '')}_${yy(y2 ?? '')}_${String(inp.kolo).padStart(2, '0')}`,
    docTitle: `Zpravodaj z kola č. ${inp.kolo} — ${inp.compName}`,
  };
}

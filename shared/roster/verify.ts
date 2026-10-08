// Roster verification against chess.cz (M6). Ported and extended from sscr-soupiska `enrichRosterPlayers`
// and kontrolasoupisky: look players up (one club-members call per club, per-player fallback), keep a snapshot
// of the chess.cz record plus the matching hosting / foreigner registry rows and higher-competition roster
// entries, and derive the deficiencies: registration (rozpis: strike players without it), the roster letters
// (Z by the sscr-soupiska rule, H = other club, C = foreigner on chess.cz, V = in Z of a higher competition)
// and confirmed hosting permits / foreigner registrations.
import { fold, teamNameScore } from '../text';
import { sameCompetition, type ForeignerRow, type HostingRow } from '../registry';
import type { ExpectedZ } from './draft';

/** The subset of the chess.cz Member / ClubMember record kept with the roster player. */
export type CzMember = {
  fullName: string;
  birthYear: number | null;
  czeId: number | null;
  fideId: number | null;
  clubId: string;
  clubName: string;
  registration: string;
  feeYear: number | null;
  czeStdElo: number | null;
  fideStdElo: number | null;
};

/** found = record by LOK/FIDE id · not_found = id unknown to chess.cz · no_id = no id on the roster (candidates by name). */
export type CzCheck = {
  status: 'found' | 'not_found' | 'no_id';
  member?: CzMember;
  candidates?: CzMember[];
  /** Registry rows of the player (by LOK; pending hosting rows by name). Undefined = registries not loaded. */
  hosting?: HostingRow[];
  foreigner?: ForeignerRow[];
  /** Entries on rosters of higher competitions; undefined = not loaded. */
  higher?: HigherEntry[];
  /** Teams of the team's club found in higher competitions (context for the V check). */
  higherTeams?: string[];
};

export type HigherEntry = { compId: number; comp: string; team: string; z: boolean; h: boolean };

export type CheckPlayer = {
  name: string;
  birth_year: number | null;
  lok: number | null;
  fide: number | null;
  flags: string;
  guest_permit: number;
};

/** Async GET of a whitelisted chess.cz path (through the proxy); null = not found. */
export type ChessczGetter = (path: string) => Promise<unknown>;

export const asArray = <T>(d: T | T[] | null | undefined): T[] => (Array.isArray(d) ? d : d != null ? [d] : []);

const intOrNull = (v: unknown) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Normalize a Member / ClubMember (club members lack clubId/clubName → taken from the club). */
export function toCzMember(m: any, club?: { code: string; name: string }): CzMember {
  return {
    fullName: String(m?.fullName ?? '').trim(),
    birthYear: intOrNull(m?.birthYear),
    czeId: intOrNull(m?.czeId),
    fideId: intOrNull(m?.fideId),
    clubId: String(m?.clubId ?? club?.code ?? ''),
    clubName: String(m?.clubName ?? club?.name ?? '').trim(),
    registration: String(m?.registration ?? '').trim(),
    feeYear: intOrNull(m?.feeYear),
    czeStdElo: intOrNull(m?.czeStdElo),
    fideStdElo: intOrNull(m?.fideStdElo),
  };
}

const flagList = (flags: string) => flags.split(' ').filter(Boolean);
/** Guest (H) / foreigner (C) — not counted when deciding the team's club (as in sscr-soupiska). */
export const isHostPlayer = (p: Pick<CheckPlayer, 'flags'>) => flagList(p.flags).some((f) => f === 'H' || f === 'C');

const firstMember = (d: unknown) => asArray(d as any).find((m) => m && typeof m === 'object' && Object.keys(m).length) ?? null;

export type LookupResult = {
  checks: (CzCheck | null)[];    // null = not checked (lookup interrupted)
  clubCode: string;              // the team's club: given, or the majority club of non-guest players
  clubName: string;
  error: string | null;          // chess.cz unavailable → partial result
};

/**
 * Look all roster players up on chess.cz. With a known club code one /clubs/{code}/members call covers
 * most players; without it, the club of the first non-guest player is the anchor (max 2 club calls).
 * The rest (guests, transfers, players without LOK) are looked up one by one.
 */
export async function lookupRoster(
  players: CheckPlayer[],
  knownClub: string | null,
  get: ChessczGetter,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<LookupResult> {
  const checks: (CzCheck | null)[] = players.map(() => null);
  const votes = new Map<string, number>();
  const clubNames = new Map<string, string>();
  const vote = (m: CzMember, p: CheckPlayer) => {
    if (m.clubName) clubNames.set(m.clubId, m.clubName);
    if (m.clubId && !isHostPlayer(p)) votes.set(m.clubId, (votes.get(m.clubId) ?? 0) + 1);
  };
  let done = 0;
  const step = () => onProgress(++done, players.length);
  const fetchedClubs = new Set<string>();

  const fillFromClub = async (code: string) => {
    fetchedClubs.add(code);
    const members = asArray(await get(`/clubs/${code}/members`) as any);
    const byLok = new Map(members.map((m: any) => [intOrNull(m?.czeId), m]));
    players.forEach((p, i) => {
      if (checks[i] || !p.lok || !byLok.has(p.lok)) return;
      const m = toCzMember(byLok.get(p.lok), { code, name: clubNames.get(code) ?? '' });
      checks[i] = { status: 'found', member: m };
      vote(m, p);
      step();
    });
  };

  const lookupOne = async (p: CheckPlayer): Promise<CzCheck> => {
    if (p.lok) {
      const m = firstMember(await get(`/members/${p.lok}/cze`));
      return m ? { status: 'found', member: toCzMember(m) } : { status: 'not_found' };
    }
    if (p.fide) {
      const m = firstMember(await get(`/members/${p.fide}/fide`));
      return m ? { status: 'found', member: toCzMember(m) } : { status: 'not_found' };
    }
    const q = p.name.trim();
    if (q.length < 4) return { status: 'no_id', candidates: [] };
    const found = asArray(await get(`/members/name?search=${encodeURIComponent(q)}`) as any)
      .map((m) => toCzMember(m))
      .filter((m) => sameName(p.name, m.fullName));
    return { status: 'no_id', candidates: found.slice(0, 5) };
  };

  try {
    if (knownClub) {
      await fillFromClub(knownClub);
    } else {
      // Anchor = first unchecked non-guest player with LOK; his current club is fetched in bulk.
      for (let n = 0; n < 2; n++) {
        const i = players.findIndex((p, j) => !checks[j] && p.lok && !isHostPlayer(p));
        if (i < 0) break;
        const c = await lookupOne(players[i]);
        checks[i] = c;
        if (c.member) vote(c.member, players[i]);
        step();
        const code = c.member?.clubId;
        if (code && !fetchedClubs.has(code)) await fillFromClub(code);
      }
    }
    for (let i = 0; i < players.length; i++) {
      if (checks[i]) continue;
      const c = await lookupOne(players[i]);
      checks[i] = c;
      if (c.member) vote(c.member, players[i]);
      step();
    }
  } catch (e) {
    const clubCode = knownClub || majority(votes);
    return { checks, clubCode, clubName: clubNames.get(clubCode) ?? '', error: (e as Error)?.message || String(e) };
  }
  const clubCode = knownClub || majority(votes);
  return { checks, clubCode, clubName: clubNames.get(clubCode) ?? '', error: null };
}

function majority(votes: Map<string, number>): string {
  let best = '';
  for (const [code, n] of votes) if (n > (votes.get(best) ?? 0)) best = code;
  return best;
}

const NAME_SUFFIXES = new Set(['ml', 'st', 'jr', 'sr', 'nejml']);

/** Same person name regardless of word order, case and diacritics ("Novák Jan" = "Jan Novák"). */
export function sameName(a: string, b: string): boolean {
  // Generation suffixes ("Skalický Petr ml.") are kept on rosters but not on chess.cz.
  const words = (s: string) => fold(s).replace(/[.,]/g, ' ').split(' ').filter((w) => w && !NAME_SUFFIXES.has(w)).sort().join(' ');
  return words(a) === words(b);
}

// ---- Registries and higher competitions --------------------------------------------------------

export type Registry = { hosting: HostingRow[]; foreigners: ForeignerRow[] };

/** Registry rows of one player: by LOK (FIDE for foreigners); pending hosting rows carry no LOK → by name. */
export function registryRows(p: CheckPlayer, reg: Registry): Pick<CzCheck, 'hosting' | 'foreigner'> {
  return {
    hosting: reg.hosting.filter((r) => (r.lok ? r.lok === p.lok : sameName(r.name, p.name))).slice(0, 5),
    foreigner: reg.foreigners.filter((r) => (r.lok && r.lok === p.lok) || (r.fide && r.fide === p.fide) || (!r.lok && !r.fide && sameName(r.name, p.name))).slice(0, 5),
  };
}

/** chess.cz competition levels (compLevel) of our level codes; lower = higher competition. */
export const LEVEL_RANK: Record<string, number> = { KP: 3, KS: 4, RP: 5, RS: 6 };

/** Team name without the team letter ("Kralupy C" → "Kralupy") — for finding the club's other teams. */
export function clubPart(name: string): string {
  return name.trim().replace(/\s+[A-Za-z]$/, '');
}

type CompetitionSummary = { compId: number; compName: string; compLevel?: number; compYoungOrAdult?: string };
type Region = { regionCode: string; regionName: string; competitions: CompetitionSummary[] };

/**
 * Rosters of the adult competitions above ours (ŠSČR + our region) for the V check. Only teams whose name
 * resembles one of ours (club part, letters ignored) are fetched — a false positive costs one cached call,
 * the decision itself is by LOK and the Z/H flags on chess.cz.
 */
export async function collectHigherRosters(
  get: ChessczGetter,
  opts: { year: number; rank: number; region: string; teamNames: string[] },
  onProgress: (text: string) => void = () => {},
): Promise<{ byLok: Map<number, HigherEntry[]>; teams: { comp: string; team: string; ours: string[] }[] }> {
  const regions = Object.entries((await get(`/competitions/${opts.year}`)) as Record<string, Region> ?? {});
  const ours = regions.filter(([k, r]) => k === '98' || fold(r.regionName) === fold(opts.region) || fold(opts.region).includes(fold(r.regionCode)));
  const comps = ours.flatMap(([, r]) => r.competitions)
    .filter((c) => (c.compYoungOrAdult ?? 'A') === 'A' && c.compLevel != null && c.compLevel < opts.rank);
  const byLok = new Map<number, HigherEntry[]>();
  const teams: { comp: string; team: string; ours: string[] }[] = [];
  for (const [i, c] of comps.entries()) {
    onProgress(`vyšší soutěže ${i + 1}/${comps.length}`);
    const rows = asArray((await get(`/competitions/${c.compId}/table`)) as { teamId: number; teamName: string }[] | null);
    for (const row of rows) {
      const mine = opts.teamNames.filter((n) => teamNameScore(clubPart(n), clubPart(row.teamName)) >= 0.8);
      if (!mine.length) continue;
      teams.push({ comp: c.compName, team: row.teamName, ours: mine });
      const roster = asArray((await get(`/competitions/${c.compId}/team/${row.teamId}/roster`)) as any[] | null);
      for (const e of roster) {
        const lok = intOrNull(e?.playerId);
        if (!lok) continue;
        const f = String(e.playerFlags ?? '').split(/\s+/);
        const entry = { compId: c.compId, comp: c.compName, team: row.teamName, z: f.includes('Z'), h: f.includes('H') };
        byLok.set(lok, [...(byLok.get(lok) ?? []), entry]);
      }
    }
  }
  return { byLok, teams };
}

// ---- Rules ------------------------------------------------------------------------------------

export { expectedBase, type ExpectedZ } from './draft';

export type Issue = {
  level: 'bad' | 'warn';
  text: string;
  /** Reason to strike the player before the definitive bulletin (rozpis: registration, hosting permit). */
  strike?: boolean;
};

export type IssueContext = {
  clubCode: string | null;
  /** Our competition name (chess.cz form preferred) — registry rows are per competition. */
  compName: string;
  /** Expected Z by the rule; 'optional' = skipped letter player (may be marked Z); null = not evaluated. */
  expectedZ?: ExpectedZ | null;
  /** Size of the starting line-up (number of boards) — for the explanation of the Z rule. */
  base?: number;
};

export const describeMember = (m: CzMember) =>
  `${m.fullName} (${[m.birthYear, m.czeId && `LOK ${m.czeId}`, m.clubName].filter(Boolean).join(', ')})`;

/** Deficiencies of one roster player; empty when OK. Unchecked players only get the local checks (Z). */
export function playerIssues(p: CheckPlayer & { base?: number }, check: CzCheck | null, ctx: IssueContext): Issue[] {
  const out: Issue[] = [];
  const flags = flagList(p.flags);
  const guest = flags.includes('H');
  const foreign = flags.includes('C');
  const free = flags.includes('V');
  const m = check?.member;

  if (check?.status === 'no_id') {
    const c = check.candidates ?? [];
    out.push({
      level: 'bad',
      text: 'chybí č. LOK' + (c.length === 1 ? ` — na chess.cz ${describeMember(c[0])}` : c.length > 1 ? ` — na chess.cz ${c.length} hráči tohoto jména` : ' — na chess.cz nenalezen'),
    });
  } else if (check?.status === 'not_found') {
    out.push({ level: 'bad', text: `${p.lok ? `č. LOK ${p.lok}` : `FIDE ID ${p.fide}`} na chess.cz nenalezeno` });
  }

  // null = clubs unknown (not checked yet / team club not determined) → fall back to the H letter.
  let otherClub: boolean | null = null;
  if (m) {
    const reg = fold(m.registration);
    if (reg === 'cizinec') {
      if (!foreign) out.push({ level: 'bad', text: 'na chess.cz registrován jako cizinec — chybí označení C' });
    } else if (reg !== 'aktivni') {
      out.push({ level: 'bad', strike: true, text: `bez platné registrace v ŠSČR (${m.registration || 'neznámá'})` });
    }
    if (foreign && reg === 'aktivni') out.push({ level: 'bad', text: 'označen C, ale na chess.cz není registrován jako cizinec' });
    if (m.fullName && !sameName(p.name, m.fullName)) out.push({ level: 'warn', text: `na chess.cz jako „${m.fullName}“` });
    if (p.birth_year && m.birthYear && p.birth_year !== m.birthYear) out.push({ level: 'warn', text: `rok narození na chess.cz ${m.birthYear}` });
    if (p.fide && m.fideId && p.fide !== m.fideId) out.push({ level: 'warn', text: `FIDE ID na chess.cz ${m.fideId}` });
    if (ctx.clubCode && m.clubId) {
      otherClub = m.clubId !== ctx.clubCode;
      if (otherClub && !guest && !foreign) out.push({ level: 'bad', text: `člen oddílu ${m.clubName || m.clubId} — chybí označení H` });
      if (!otherClub && guest) out.push({ level: 'bad', text: 'označen H, ale je členem oddílu družstva' });
    }
  }

  // Hosting permit: registry (hostovani.appchess.cz) or a paper permit marked by the vedoucí.
  const needsPermit = !foreign && (otherClub ?? guest);
  if (needsPermit && check?.hosting) {
    const rows = check.hosting;
    const ok = rows.find((r) => !r.pending && r.hostClub === ctx.clubCode && sameCompetition(r.comp, ctx.compName));
    const sameClub = rows.find((r) => !r.pending && r.hostClub === ctx.clubCode);
    const pending = rows.find((r) => r.pending);
    if (ok) { /* confirmed */ }
    else if (p.guest_permit) { /* documented on paper */ }
    else if (sameClub) out.push({ level: 'warn', text: `hostování potvrzeno pro jinou soutěž (${sameClub.comp})` });
    else if (pending) out.push({ level: 'bad', strike: true, text: `hostování čeká na schválení (${pending.hostClubName}, ${pending.comp}; chybí: ${pending.pending})` });
    else if (rows.length) out.push({ level: 'bad', strike: true, text: `hostování potvrzeno jen pro ${rows.map((r) => `${r.hostClubName} (${r.comp})`).join(', ')}` });
    else out.push({ level: 'bad', strike: true, text: 'chybí povolení hostování' });
  } else if (needsPermit && guest && !p.guest_permit && !check?.hosting) {
    out.push({ level: 'bad', strike: true, text: 'chybí povolení hostování' });
  }

  // Foreigner registration (registracecizincu.appchess.cz) or a document marked by the vedoucí.
  if (foreign && check?.foreigner) {
    const rows = check.foreigner;
    const ok = rows.find((r) => !r.pending && r.club === ctx.clubCode && sameCompetition(r.comp, ctx.compName));
    const sameClub = rows.find((r) => !r.pending && r.club === ctx.clubCode);
    const pending = rows.find((r) => r.pending);
    if (ok || p.guest_permit) { /* confirmed */ }
    else if (sameClub) out.push({ level: 'warn', text: `registrace cizince potvrzena pro jinou soutěž (${sameClub.comp})` });
    else if (pending) out.push({ level: 'bad', text: `registrace cizince čeká na schválení (chybí: ${pending.pending})` });
    else if (rows.length) out.push({ level: 'bad', text: `registrace cizince jen pro ${rows.map((r) => `${r.clubName} (${r.comp})`).join(', ')}` });
    else out.push({ level: 'bad', text: 'chybí registrace cizince' });
  } else if (foreign && !p.guest_permit && !check?.foreigner) {
    out.push({ level: 'bad', text: 'chybí doklad cizince' });
  }

  // V = a player of the club who is in the starting line-up (Z) of the club's team in a higher competition.
  if (check?.higher) {
    const inZ = check.higher.filter((e) => e.z && !e.h);
    if (free && !inZ.length) {
      out.push({
        level: check.higherTeams?.length ? 'bad' : 'warn',
        text: check.higherTeams?.length ? 'označen V, ale není v základní sestavě vyšší soutěže'
          : 'označen V, ale družstvo oddílu ve vyšší soutěži nebylo nalezeno',
      });
    }
    if (!free && !guest && !foreign && inZ.length) {
      out.push({ level: 'bad', text: `v základní sestavě ${inZ.map((e) => `${e.team} (${e.comp})`).join(', ')} — chybí označení V` });
    }
  }

  if (typeof ctx.expectedZ === 'boolean' && ctx.expectedZ !== !!p.base) {
    const rule = ctx.base ? ` — Z = prvních ${ctx.base} hráčů, z nich nejvýše ${Math.max(0, Math.ceil(ctx.base / 2) - 1)} H/V/C` : '';
    out.push({ level: 'bad', text: (ctx.expectedZ ? 'má být v základní sestavě (Z)' : 'nemá být v základní sestavě (Z)') + rule });
  }
  return out;
}

/** Strike reason text from the issues (empty = no reason to strike). */
export function strikeReason(issues: Issue[]): string {
  return issues.filter((i) => i.strike).map((i) => i.text).join('; ');
}

/** Plain-text deficiency list per team — the section of the preliminary bulletin (rozpis: "zjištěné nedostatky"). */
export function deficiencyReport(teams: { name: string; players: { name: string; struck?: number; issues: Issue[] }[] }[]): string {
  return teams
    .map((t) => {
      const lines = t.players
        .filter((p) => !p.struck && p.issues.some((i) => i.level === 'bad'))
        .map((p) => `- ${p.name}: ${p.issues.filter((i) => i.level === 'bad').map((i) => i.text).join('; ')}`);
      return lines.length ? `${t.name}\n${lines.join('\n')}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

// Roster verification against chess.cz (M6). Ported and extended from sscr-soupiska `enrichRosterPlayers`
// and kontrolasoupisky: look players up (one club-members call per club, per-player fallback), keep a snapshot
// of the chess.cz record, and derive the deficiencies the rozpis requires the vedoucí to report and to strike:
// players without registration, without paid fee and guests without a hosting permit.
import { fold } from '../text';

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
export type CzCheck = { status: 'found' | 'not_found' | 'no_id'; member?: CzMember; candidates?: CzMember[] };

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

/** Fee year required for the season: the calendar year in which it starts (2026/2027 → 2026). */
export function requiredFeeYear(season: string): number {
  return parseInt(season.slice(0, 4), 10);
}

export type Issue = {
  level: 'bad' | 'warn';
  text: string;
  /** Reason to strike the player before the definitive bulletin (rozpis: registration, fee, permit). */
  strike?: boolean;
};

export type IssueContext = {
  clubCode: string | null;
  feeYear: number;
  /** Other teams of the same competition with this player on the current roster. */
  sameCompetition?: string[];
  /** Teams in the user's other competitions of the season. */
  elsewhere?: string[];
};

export const describeMember = (m: CzMember) =>
  `${m.fullName} (${[m.birthYear, m.czeId && `LOK ${m.czeId}`, m.clubName].filter(Boolean).join(', ')})`;

/** Deficiencies of one roster player; empty when OK. Unchecked players only get the local checks. */
export function playerIssues(p: CheckPlayer, check: CzCheck | null, ctx: IssueContext): Issue[] {
  const out: Issue[] = [];
  const flags = flagList(p.flags);
  const guest = flags.includes('H');
  const foreign = flags.includes('C');
  const m = check?.member;

  if (check?.status === 'no_id') {
    const c = check.candidates ?? [];
    out.push({
      level: foreign ? 'warn' : 'bad',
      text: 'chybí č. LOK' + (c.length === 1 ? ` — na chess.cz ${describeMember(c[0])}` : c.length > 1 ? ` — na chess.cz ${c.length} hráči tohoto jména` : ' — na chess.cz nenalezen'),
    });
  } else if (check?.status === 'not_found') {
    out.push({ level: 'bad', text: `${p.lok ? `č. LOK ${p.lok}` : `FIDE ID ${p.fide}`} na chess.cz nenalezeno` });
  }

  if (m) {
    const reg = fold(m.registration);
    if (reg === 'cizinec') {
      // Foreigners have their own registration status on chess.cz.
      if (!foreign) out.push({ level: 'warn', text: 'registrován jako cizinec — chybí označení C' });
    } else if (reg !== 'aktivni') {
      out.push({ level: 'bad', strike: true, text: `bez registrace v ŠSČR (${m.registration || 'neznámá'})` });
    }
    if (!m.feeYear || m.feeYear < ctx.feeYear) {
      out.push({ level: 'bad', strike: true, text: `nezaplacený příspěvek ${ctx.feeYear}` + (m.feeYear ? ` (naposledy ${m.feeYear})` : '') });
    }
    if (m.fullName && !sameName(p.name, m.fullName)) out.push({ level: 'warn', text: `na chess.cz jako „${m.fullName}“` });
    if (p.birth_year && m.birthYear && p.birth_year !== m.birthYear) out.push({ level: 'warn', text: `rok narození na chess.cz ${m.birthYear}` });
    if (p.fide && m.fideId && p.fide !== m.fideId) out.push({ level: 'warn', text: `FIDE ID na chess.cz ${m.fideId}` });
    if (ctx.clubCode && m.clubId) {
      const otherClub = m.clubId !== ctx.clubCode;
      if (otherClub && !guest && !foreign) {
        out.push({ level: 'bad', strike: !p.guest_permit, text: `člen oddílu ${m.clubName || m.clubId} — chybí označení H` });
      }
      if (!otherClub && guest) out.push({ level: 'warn', text: 'označen H, ale je členem oddílu družstva' });
    }
  }

  if ((guest || foreign) && !p.guest_permit) {
    out.push({ level: 'bad', strike: guest, text: guest ? 'chybí povolení hostování' : 'chybí doklad cizince' });
  }
  for (const t of ctx.sameCompetition ?? []) out.push({ level: 'bad', text: `také na soupisce ${t}` });
  for (const t of ctx.elsewhere ?? []) out.push({ level: 'warn', text: `také na soupisce ${t}` });
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

// Bulletin input from chess.cz responses (the source of truth for rosters and the schedule) and, when chess.cz
// has nothing yet and the vedoucí confirms it, from the app (rosters, draw numbers → Berger). Pure functions.
import { asArray } from '../roster/verify';
import { flagParts } from '../roster/draft';
import { fixtures } from '../draw/check';
import type { BPlayer, BRound } from './initial';

export type CzTeam = { id: number; name: string; rank: number };
export type CzRound = { nr: number; date: string; matches: { home: number; away: number }[] };

/** '18.10.2026' → '2026-10-18' ('' when unparsable). */
export function czDateIso(s: unknown): string {
  const m = /^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(String(s ?? ''));
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

export function parseCzTable(json: unknown): CzTeam[] {
  return asArray(json as any[])
    .filter((t: any) => t && t.teamId != null)
    .map((t: any, i: number) => ({ id: Number(t.teamId), name: String(t.teamName ?? '').trim(), rank: Number(t.teamRank) || i + 1 }));
}

export function parseCzSchedule(json: unknown): CzRound[] {
  return asArray(json as any[])
    .filter((r: any) => r && r.roundNr != null)
    .map((r: any) => ({
      nr: Number(r.roundNr),
      date: czDateIso(r.roundDate),
      matches: asArray(r.roundMatches as any[]).map((m: any) => ({ home: Number(m.homeTeamId), away: Number(m.awayTeamId) })),
    }))
    .sort((a, b) => a.nr - b.nr);
}

/** Round 1 of a Berger table pairs i with N+1−i (N = team count rounded up to even). */
export function bergerRound1Ok(round1: CzRound | undefined, stc: Map<number, number>, n: number): boolean {
  const N = n + (n % 2);
  if (!round1?.matches.length) return false;
  return round1.matches.every((m) => {
    const a = stc.get(m.home), b = stc.get(m.away);
    return a != null && b != null && a + b === N + 1;
  });
}

/**
 * Start numbers: chess.cz does not return them. Teams are imported from Swiss-Manager in start-number order,
 * so teamId ascending is tried first, then the table order; each is verified against round 1 (uvodni-zpravodaj).
 * Falls back to the app's draw numbers (by chess.cz team id) when given.
 */
export function czStartNumbers(teams: CzTeam[], rounds: CzRound[], appNumbers?: Map<number, number>):
  { stc: Map<number, number>; source: 'teamId' | 'tabulka' | 'aplikace' | null } {
  const r1 = rounds.find((r) => r.nr === 1);
  const mapOf = (list: CzTeam[]) => new Map(list.map((t, i) => [t.id, i + 1]));
  const byId = mapOf([...teams].sort((a, b) => a.id - b.id));
  if (bergerRound1Ok(r1, byId, teams.length)) return { stc: byId, source: 'teamId' };
  const byRank = mapOf([...teams].sort((a, b) => a.rank - b.rank));
  if (bergerRound1Ok(r1, byRank, teams.length)) return { stc: byRank, source: 'tabulka' };
  if (appNumbers && teams.every((t) => appNumbers.has(t.id))) return { stc: appNumbers, source: 'aplikace' };
  return { stc: byId, source: null };
}

/** chess.cz flags " H K Z" → Z, letter H/V/C and captain K/ZK (separate bulletin columns Z, P, K). */
export function splitFlags(s: unknown): { z: boolean; letter: string; cap: string } {
  const t = String(s ?? '').trim().split(/\s+/).filter(Boolean);
  return { z: t.includes('Z'), ...flagParts(t.join(' ')) };
}

export type AppPlayer = { lok: number | null; name: string; birth_year: number | null; struck: number };

/**
 * chess.cz roster → bulletin players. Birth years (st./ml.) and strikes come from the app's roster by LOK
 * (a struck player stays on chess.cz until the vedoucí removes him there).
 */
export function czRoster(json: unknown, app: AppPlayer[] = []): BPlayer[] {
  const byLok = new Map(app.filter((p) => p.lok).map((p) => [p.lok!, p]));
  return asArray(json as any[])
    .map((p: any, i: number) => {
      const f = splitFlags(p.playerFlags);
      const a = byLok.get(Number(p.playerId));
      return {
        pos: p.rosterPosition != null ? Number(p.rosterPosition) : i + 1,
        name: String(p.playerName ?? '').trim(),
        nrtg: Number(p.playerCzeElo) || 0,
        irtg: Number(p.playerFideElo) || 0,
        z: f.z, letter: f.letter, cap: f.cap,
        birthYear: a?.birth_year ?? null,
        struck: !!a?.struck,
      };
    })
    .sort((a, b) => a.pos - b.pos);
}

/** App roster (latest version) → bulletin players; ratings from the last chess.cz check. */
export function appRoster(players: (AppPlayer & { position: number; flags: string; base: number; cz?: { member?: { czeStdElo: number | null; fideStdElo: number | null } } | null })[]): BPlayer[] {
  return players.map((p) => ({
    pos: p.position,
    name: p.name,
    nrtg: p.cz?.member?.czeStdElo ?? 0,
    irtg: p.cz?.member?.fideStdElo ?? 0,
    z: !!p.base,
    ...flagParts(p.flags),
    birthYear: p.birth_year,
    struck: !!p.struck,
  }));
}

/** App schedule: Berger table from the draw numbers and the round dates (byes left out). Null = numbers incomplete. */
export function appSchedule(teams: { id: string; name: string; club_code: string | null; club_name: string; draw_no: number | null }[],
  roundDates: Map<number, string>): BRound[] | null {
  if (!teams.length || teams.some((t) => t.draw_no == null)) return null;
  return fixtures(teams).map((ms, i) => ({
    nr: i + 1,
    date: roundDates.get(i + 1) ?? '',
    matches: ms.filter((m) => m.home && m.away).sort((a, b) => a.board - b.board).map((m) => ({ home: m.home!, away: m.away! })),
  }));
}

// Runs the chess.cz roster check (shared/roster/verify.ts) in the browser through the Worker proxy
// and stores the snapshots. Sequential calls only — the proxy spaces them to ~3 req/s.
import { api, ApiError, apiErrorText } from './api';
import { lookupRoster, playerIssues, type Issue, type LookupResult } from '../../../shared/roster/verify';
import type { RosterCheckData, RosterPlayer } from './types';

async function chessczGet(path: string): Promise<unknown> {
  try {
    return (await api.get<{ data: unknown }>(`/chesscz${path}`)).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw new Error(apiErrorText(e) ?? 'chess.cz je nedostupné');
  }
}

export async function checkTeamRoster(
  team: { id: string; club_code: string | null },
  players: RosterPlayer[],
  onProgress?: (done: number, total: number) => void,
): Promise<LookupResult> {
  const r = await lookupRoster(players, team.club_code, chessczGet, onProgress);
  await api.put(`/teams/${team.id}/roster-check`, {
    club_code: r.clubCode,
    club_name: r.clubName,
    players: players.map((p, i) => ({ id: p.id, cz: r.checks[i] })).filter((x) => x.cz),
  });
  return r;
}

/** Issues of every player of the competition (duplicates across its teams and the user's other competitions included). */
export function competitionIssues(data: RosterCheckData): Map<number, Issue[]> {
  const teamsOfLok = new Map<number, string[]>();
  for (const t of data.teams) for (const p of t.players ?? []) if (p.lok) teamsOfLok.set(p.lok, [...(teamsOfLok.get(p.lok) ?? []), t.name]);
  const out = new Map<number, Issue[]>();
  for (const t of data.teams) {
    for (const p of t.players ?? []) {
      out.set(p.id, playerIssues(p, p.cz, {
        clubCode: t.club_code,
        feeYear: data.feeYear,
        sameCompetition: p.lok ? (teamsOfLok.get(p.lok) ?? []).filter((n) => n !== t.name) : [],
        elsewhere: p.lok ? data.elsewhere[p.lok] ?? [] : [],
      }));
    }
  }
  return out;
}

/** Oldest check time of a roster (null = some player not checked yet). */
export function checkedAt(players: RosterPlayer[]): number | null {
  if (!players.length || players.some((p) => !p.cz_checked_at)) return null;
  return Math.min(...players.map((p) => p.cz_checked_at!));
}

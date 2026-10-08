// Runs the roster check (shared/roster/verify.ts) in the browser: chess.cz through the Worker proxy
// (sequential, the proxy spaces calls to ~3 req/s), registries through /registry (cached 1 h on the server).
import { api, ApiError, apiErrorText } from './api';
import {
  collectHigherRosters, expectedBase, LEVEL_RANK, lookupRoster, playerIssues, registryRows,
  type Issue, type LookupResult, type Registry, type VCheck,
} from '../../../shared/roster/verify';
import type { Competition, RosterCheckData, RosterPlayer } from './types';

export async function chessczGet(path: string): Promise<unknown> {
  try {
    return (await api.get<{ data: unknown }>(`/chesscz${path}`)).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw new Error(apiErrorText(e) ?? 'chess.cz je nedostupné');
  }
}

/** Data shared by all teams of one check run. */
export type CheckContext = { registry: Registry | null; warnings: string[] };

type TeamRef = { id: string; name: string; club_name: string; club_code: string | null };

export async function prepareCheck(c: Competition, onProgress: (t: string) => void = () => {}): Promise<CheckContext> {
  const warnings: string[] = [];
  onProgress('registr hostování a cizinců');
  let registry: Registry | null = null;
  try {
    const r = await api.get<Registry & { errors: string[] }>(`/registry?season=${encodeURIComponent(c.season)}`);
    registry = { hosting: r.hosting, foreigners: r.foreigners };
    warnings.push(...r.errors);
  } catch (e) {
    warnings.push(`Registr hostování / cizinců nedostupný: ${apiErrorText(e)}`);
  }
  return { registry, warnings };
}

/**
 * Separate, competition-wide V check (approximate): rosters of the club's teams in higher competitions
 * (found by team name) → for every player his entries there. Stored apart from the regular check.
 */
export async function runVCheck(c: Competition, data: RosterCheckData, onProgress: (t: string) => void = () => {}): Promise<number> {
  const rank = LEVEL_RANK[c.level];
  if (!rank) throw new Error('Kontrola V je jen pro KP, KS, RP a RS.');
  const names = [...new Set(data.teams.flatMap((t) => [t.name, t.club_name]).filter(Boolean))];
  const higher = await collectHigherRosters(chessczGet, { year: parseInt(c.season, 10), rank, region: c.region, teamNames: names }, onProgress);
  const players = data.teams.flatMap((t) => {
    const higherTeams = higher.teams.filter((x) => x.ours.includes(t.name) || (t.club_name && x.ours.includes(t.club_name)))
      .map((x) => `${x.team} (${x.comp})`);
    return (t.players ?? []).map((p) => ({ id: p.id, v: { higher: p.lok ? higher.byLok.get(p.lok) ?? [] : [], higherTeams } satisfies VCheck }));
  });
  await api.put(`/competitions/${c.id}/v-check`, { players });
  return higher.teams.length;
}

export async function checkTeamRoster(
  team: TeamRef,
  players: RosterPlayer[],
  ctx: CheckContext,
  onProgress?: (done: number, total: number) => void,
): Promise<LookupResult> {
  const r = await lookupRoster(players, team.club_code, chessczGet, onProgress);
  await api.put(`/teams/${team.id}/roster-check`, {
    club_code: r.clubCode,
    club_name: r.clubName,
    players: players.map((p, i) => {
      const cz = r.checks[i];
      if (!cz) return { id: p.id, cz: null };
      return { id: p.id, cz: { ...cz, ...(ctx.registry ? registryRows(p, ctx.registry) : {}) } };
    }).filter((x) => x.cz),
  });
  return r;
}

/** Issues of every player of the competition. */
export function competitionIssues(data: RosterCheckData, c: Competition): Map<number, Issue[]> {
  const out = new Map<number, Issue[]>();
  for (const t of data.teams) {
    const players = t.players ?? [];
    const z = expectedBase(players, c.boards);
    players.forEach((p, i) => {
      out.set(p.id, p.struck ? [] : playerIssues(p, p.cz, { clubCode: t.club_code, compName: c.name, expectedZ: z[i], base: c.boards, v: p.v }));
    });
  }
  return out;
}

/** Oldest check time of a roster (null = some player not checked yet). */
export function checkedAt(players: RosterPlayer[]): number | null {
  if (!players.length || players.some((p) => !p.cz_checked_at)) return null;
  return Math.min(...players.map((p) => p.cz_checked_at!));
}

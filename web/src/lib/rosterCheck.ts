// Runs the roster check (shared/roster/verify.ts) in the browser: chess.cz through the Worker proxy
// (sequential, the proxy spaces calls to ~3 req/s), registries through /registry (cached 1 h on the server).
import { api, ApiError, apiErrorText } from './api';
import {
  collectHigherRosters, expectedBase, LEVEL_RANK, lookupRoster, playerIssues, registryRows,
  type HigherEntry, type Issue, type LookupResult, type Registry,
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
export type CheckContext = {
  registry: Registry | null;
  higher: { byLok: Map<number, HigherEntry[]>; teams: { comp: string; team: string; ours: string[] }[] } | null;
  warnings: string[];
};

type TeamRef = { id: string; name: string; club_name: string; club_code: string | null };

export async function prepareCheck(c: Competition, teams: TeamRef[], onProgress: (t: string) => void = () => {}): Promise<CheckContext> {
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
  let higher: CheckContext['higher'] = null;
  const rank = LEVEL_RANK[c.level];
  if (rank) {
    try {
      const names = [...new Set(teams.flatMap((t) => [t.name, t.club_name]).filter(Boolean))];
      higher = await collectHigherRosters(chessczGet, { year: parseInt(c.season, 10), rank, region: c.region, teamNames: names }, onProgress);
    } catch (e) {
      warnings.push(`Soupisky vyšších soutěží se nepodařilo načíst: ${(e as Error).message}`);
    }
  }
  return { registry, higher, warnings };
}

export async function checkTeamRoster(
  team: TeamRef,
  players: RosterPlayer[],
  ctx: CheckContext,
  onProgress?: (done: number, total: number) => void,
): Promise<LookupResult> {
  const r = await lookupRoster(players, team.club_code, chessczGet, onProgress);
  const higherTeams = ctx.higher?.teams.filter((t) => t.ours.includes(team.name) || (team.club_name && t.ours.includes(team.club_name)))
    .map((t) => `${t.team} (${t.comp})`);
  await api.put(`/teams/${team.id}/roster-check`, {
    club_code: r.clubCode,
    club_name: r.clubName,
    players: players.map((p, i) => {
      const cz = r.checks[i];
      if (!cz) return { id: p.id, cz: null };
      return {
        id: p.id,
        cz: {
          ...cz,
          ...(ctx.registry ? registryRows(p, ctx.registry) : {}),
          ...(ctx.higher ? { higher: p.lok ? ctx.higher.byLok.get(p.lok) ?? [] : [], higherTeams } : {}),
        },
      };
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
      out.set(p.id, p.struck ? [] : playerIssues(p, p.cz, { clubCode: t.club_code, compName: c.name, expectedZ: z[i], base: c.boards }));
    });
  }
  return out;
}

/** Oldest check time of a roster (null = some player not checked yet). */
export function checkedAt(players: RosterPlayer[]): number | null {
  if (!players.length || players.some((p) => !p.cz_checked_at)) return null;
  return Math.min(...players.map((p) => p.cz_checked_at!));
}

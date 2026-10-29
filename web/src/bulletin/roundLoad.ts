// Loads the input of the zpravodaj z kola from chess.cz (through the Worker proxy, sequential calls): results of the
// round, the schedule (pairs of matches without results yet), standings and — only for matches with a missing
// player — the away roster (board order). Referees come from the app (karta Nominace rozhodčích).
import { api } from '../lib/api';
import { chessczGet } from '../lib/rosterCheck';
import type { CompetitionDetail } from '../lib/types';
import { asArray } from '../../../shared/roster/verify';
import { parseCzSchedule, parseCzTable } from '../../../shared/bulletin/source';
import { signatureName } from '../../../shared/bulletin/initial';
import { needsAwayRoster, scheduleRound, type CzMatch, type RoundInput } from '../../../shared/bulletin/round';
import { pairCzTeams } from '../../../shared/schedule';

export type RoundCz = {
  details: { compName?: string; regionName?: string; compManagerName?: string } | null;
  schedule: unknown; table: unknown; results: CzMatch[]; rosters: Record<number, unknown>;
};

const PATHS = (id: number, nr: number) => ({
  details: `/competitions/${id}/details`, schedule: `/competitions/${id}/schedule`,
  matches: `/competitions/${id}/round/${nr}/matches`, table: `/competitions/${id}/table`,
});

export async function loadRoundCz(compId: number, nr: number, onProgress: (t: string) => void = () => {}): Promise<RoundCz> {
  const p = PATHS(compId, nr);
  onProgress('soutěž');
  const details = (await chessczGet(p.details)) as RoundCz['details'];
  onProgress('rozpis');
  const schedule = await chessczGet(p.schedule);
  onProgress('výsledky');
  const results = asArray((await chessczGet(p.matches)) as CzMatch[]); // 404 (no results yet) → []
  onProgress('pořadí');
  const table = await chessczGet(p.table);
  const rosters: Record<number, unknown> = {};
  for (const m of results) {
    const away = Number(m.awayTeamId);
    if (!needsAwayRoster(m) || m.awayTeamId == null || rosters[away]) continue;
    onProgress(`soupiska ${m.awayTeamName ?? ''}`);
    rosters[away] = await chessczGet(`/competitions/${compId}/team/${away}/roster`).catch(() => null); // without it: base order
  }
  return { details, schedule, table, results, rosters };
}

/** Bypasses the proxy cache for the round's data (results are entered over the days after the round). */
export async function refreshRoundCz(compId: number, nr: number, cz: RoundCz | undefined) {
  const p = PATHS(compId, nr);
  for (const path of [p.details, p.schedule, p.matches, p.table]) await api.get(`/chesscz${path}?refresh=true`).catch(() => null);
  for (const id of Object.keys(cz?.rosters ?? {})) await api.get(`/chesscz/competitions/${compId}/team/${id}/roster?refresh=true`).catch(() => null);
}

export function roundInput(detail: CompetitionDetail, cz: RoundCz, nr: number, assigned: Record<string, string>, today: string): RoundInput {
  const c = detail.competition;
  const czTeams = parseCzTable(cz.table);
  const appOf = pairCzTeams(czTeams, detail.teams.filter((t) => t.status === 'active'));
  const keyOfCz = new Map(czTeams.map((t) => [t.id, appOf.get(t.id)?.id ?? `cz:${t.id}`])); // keys of Nominace rozhodčích
  const dates = [...parseCzSchedule(cz.schedule).map((r) => ({ nr: r.nr, date: r.date })), ...detail.rounds.map((r) => ({ nr: r.round, date: r.date }))];
  const warnings: string[] = [];
  for (const t of czTeams) if (!appOf.has(t.id)) warnings.push(`Družstvo ${t.name} z chess.cz není v aplikaci — bez nominovaného rozhodčího`);
  return {
    kolo: nr,
    compName: cz.details?.compName || c.name,
    regionName: cz.details?.regionName || c.region,
    season: c.season,
    short: c.short,
    manager: signatureName(c.manager_name || cz.details?.compManagerName || ''),
    results: cz.results,
    planned: scheduleRound(cz.schedule, nr),
    rosters: cz.rosters,
    table: cz.table,
    keyOfCz,
    assigned,
    standingsLater: dates.some((r) => r.nr > nr && /^\d{4}-\d{2}-\d{2}/.test(r.date) && r.date <= today),
    warnings,
  };
}

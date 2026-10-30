// Loads and assembles the input of the úvodní zpravodaj: rosters and the schedule from chess.cz (through the
// Worker proxy), venues / contacts / referees / start-time exceptions from the app. App rosters and the app
// schedule (draw numbers → Berger) are used only where chess.cz has nothing and the vedoucí confirmed it.
import { chessczGet, competitionIssues } from '../lib/rosterCheck';
import type { CompetitionDetail, RosterCheckData } from '../lib/types';
import { competitionSchedule } from '../../../shared/schedule';
import { sameClubGroups } from '../../../shared/draw/check';
import { strikeReason } from '../../../shared/roster/verify';
import { appRoster, czRoster, parseCzSchedule, parseCzTable, type CzRound, type CzTeam } from '../../../shared/bulletin/source';
import type { BPlayer, BTeam, BulletinData, InitialConfig } from '../../../shared/bulletin/initial';

export type CzSources = {
  details: { compName?: string; regionName?: string; compWww?: string } | null;
  teams: CzTeam[];
  rounds: CzRound[];
  rosters: Map<number, unknown>;
};

/** chess.cz data of the competition (sequential calls; the proxy spaces and caches them). */
export async function loadChesscz(compId: number | null, onProgress: (t: string) => void = () => {}, withRosters = true): Promise<CzSources> {
  const out: CzSources = { details: null, teams: [], rounds: [], rosters: new Map() };
  if (!compId) return out;
  onProgress('soutěž');
  out.details = (await chessczGet(`/competitions/${compId}/details`)) as CzSources['details'];
  onProgress('družstva');
  out.teams = parseCzTable(await chessczGet(`/competitions/${compId}/table`));
  onProgress('rozlosování');
  out.rounds = parseCzSchedule(await chessczGet(`/competitions/${compId}/schedule`));
  if (withRosters) for (const [i, t] of out.teams.entries()) {
    onProgress(`soupiska ${i + 1}/${out.teams.length}`);
    out.rosters.set(t.id, await chessczGet(`/competitions/${compId}/team/${t.id}/roster`));
  }
  return out;
}

export type Availability = {
  czTeams: boolean; czSchedule: boolean; czRosters: number; // number of teams with a chess.cz roster
  appSchedule: boolean; appRosters: number;
  missingCzRosters: string[];
};

export function assemble(detail: CompetitionDetail, check: RosterCheckData | undefined, cz: CzSources, cfg: InitialConfig, refs: Record<string, string>):
  { data: BulletinData; availability: Availability } {
  const c = detail.competition;
  const warnings: string[] = [];
  const active = detail.teams.filter((t) => t.status === 'active');
  const checkTeam = new Map((check?.teams ?? []).map((t) => [t.id, t]));

  const sched = competitionSchedule(active, cz, new Map(detail.rounds.map((r) => [r.round, r.date])), cfg.appData.schedule);
  warnings.push(...sched.warnings);
  const teams: BTeam[] = sched.teams.map((t) => ({
    key: t.key, stc: t.stc, name: t.name,
    venue: t.app?.venue ?? '',
    contacts: (t.app?.contacts ?? []).map((x) => ({ role: x.role, name: x.name, phone: x.phone, email: x.email })),
    startHome: t.app?.start_home ?? null,
    startAway: t.app?.start_away ?? null,
    startHomeSkip: t.app?.start_home_skip ?? '',
    startAwaySkip: t.app?.start_away_skip ?? '',
  }));
  const rounds = sched.rounds;

  // Rosters.
  const appPlayers = (teamId: string | undefined) => (teamId ? checkTeam.get(teamId)?.players ?? null : null);
  const rosters: Record<string, BPlayer[] | null> = {};
  let czRosters = 0;
  let appRosters = 0;
  const missingCzRosters: string[] = [];
  for (const t of teams) {
    const czId = sched.teams.find((x) => x.key === t.key)?.czId;
    const raw = czId != null ? cz.rosters.get(czId) : null;
    const app = appPlayers(t.key.startsWith('cz:') ? undefined : t.key);
    if (app?.length) appRosters++;
    if (Array.isArray(raw) && raw.length) {
      czRosters++;
      rosters[t.key] = czRoster(raw, app ?? []);
    } else {
      missingCzRosters.push(t.name);
      rosters[t.key] = cfg.appData.rosters && app?.length ? appRoster(app) : null;
    }
  }

  // Roster check findings (preliminary bulletin).
  const deficiencies: BulletinData['deficiencies'] = [];
  if (check) {
    const issues = competitionIssues(check, c);
    for (const t of teams) {
      const players = appPlayers(t.key) ?? [];
      const lines = players.flatMap((p) => {
        if (p.struck) return [`${p.name}: bude vyškrtnut${p.struck_reason ? ` — ${p.struck_reason}` : ''}`];
        const list = (issues.get(p.id) ?? []).filter((i) => !i.accepted && (i.level === 'bad' || i.strike));
        if (!list.length) return [];
        const strike = strikeReason(list);
        return [`${p.name}: ${list.map((i) => i.text).join('; ')}${strike ? ' (k vyškrtnutí)' : ''}`];
      });
      if (lines.length) deficiencies.push({ team: t.name, lines });
    }
  }

  // Same-club pairs (keys of app teams).
  const sameClub: [string, string][] = [];
  for (const g of sameClubGroups(active)) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) sameClub.push([g[i].id, g[j].id]);
  }
  const inBulletin = new Set(teams.map((t) => t.key));

  return {
    data: {
      compName: cz.details?.compName || c.name,
      short: c.short,
      region: cz.details?.regionName || c.region,
      season: c.season,
      chessczId: c.chesscz_comp_id,
      www: cz.details?.compWww || null,
      defaultStart: c.default_start,
      lastStart: c.last_start ?? '',
      timeControl: c.time_control,
      manager: { name: c.manager_name, email: c.manager_email, phone: c.manager_phone },
      teams,
      rosters,
      rounds,
      refs,
      deficiencies,
      sameClub: sameClub.filter(([a, b]) => inBulletin.has(a) && inBulletin.has(b)),
      warnings,
    },
    availability: {
      czTeams: cz.teams.length > 0, czSchedule: cz.rounds.length > 0, czRosters,
      appSchedule: sched.appAvailable, appRosters, missingCzRosters,
    },
  };
}

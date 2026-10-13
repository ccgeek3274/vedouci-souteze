// Loads and assembles the input of the úvodní zpravodaj: rosters and the schedule from chess.cz (through the
// Worker proxy), venues / contacts / referees / start-time exceptions from the app. App rosters and the app
// schedule (draw numbers → Berger) are used only where chess.cz has nothing and the vedoucí confirmed it.
import { chessczGet, competitionIssues } from '../lib/rosterCheck';
import type { CompetitionDetail, RosterCheckData } from '../lib/types';
import { bestTeamMatch } from '../../../shared/text';
import { sameClubGroups } from '../../../shared/draw/check';
import { strikeReason } from '../../../shared/roster/verify';
import { appRoster, appSchedule, czRoster, czStartNumbers, parseCzSchedule, parseCzTable, type CzRound, type CzTeam } from '../../../shared/bulletin/source';
import type { BPlayer, BRound, BTeam, BulletinData, InitialConfig } from '../../../shared/bulletin/initial';

export type CzSources = {
  details: { compName?: string; regionName?: string; compWww?: string } | null;
  teams: CzTeam[];
  rounds: CzRound[];
  rosters: Map<number, unknown>;
};

/** chess.cz data of the competition (sequential calls; the proxy spaces and caches them). */
export async function loadChesscz(compId: number | null, onProgress: (t: string) => void = () => {}): Promise<CzSources> {
  const out: CzSources = { details: null, teams: [], rounds: [], rosters: new Map() };
  if (!compId) return out;
  onProgress('soutěž');
  out.details = (await chessczGet(`/competitions/${compId}/details`)) as CzSources['details'];
  onProgress('družstva');
  out.teams = parseCzTable(await chessczGet(`/competitions/${compId}/table`));
  onProgress('rozlosování');
  out.rounds = parseCzSchedule(await chessczGet(`/competitions/${compId}/schedule`));
  for (const [i, t] of out.teams.entries()) {
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

export function assemble(detail: CompetitionDetail, check: RosterCheckData | undefined, cz: CzSources, cfg: InitialConfig):
  { data: BulletinData; availability: Availability } {
  const c = detail.competition;
  const warnings: string[] = [];
  const active = detail.teams.filter((t) => t.status === 'active');
  const checkTeam = new Map((check?.teams ?? []).map((t) => [t.id, t]));

  // Pair chess.cz teams with the app's (team id, else unique best name match).
  const appOf = new Map<number, (typeof active)[number]>();
  for (const t of cz.teams) {
    const a = active.find((x) => x.chesscz_team_id === t.id) ?? bestTeamMatch(t.name, active.filter((x) => !x.chesscz_team_id), (x) => x.name);
    if (a) appOf.set(t.id, a);
    else warnings.push(`Družstvo ${t.name} z chess.cz není v aplikaci — chybí místnost, kontakty a rozhodčí`);
  }
  const keyOfCz = (id: number) => appOf.get(id)?.id ?? `cz:${id}`;

  const toTeam = (a: (typeof active)[number] | undefined, key: string, name: string, stc: number | null): BTeam => ({
    key, stc, name,
    venue: a?.venue ?? '',
    contacts: (a?.contacts ?? []).map((x) => ({ role: x.role, name: x.name, phone: x.phone, email: x.email })),
    startHome: a?.start_home ?? null,
    startAway: a?.start_away ?? null,
    startHomeSkip: a?.start_home_skip ?? '',
    startAwaySkip: a?.start_away_skip ?? '',
  });

  let teams: BTeam[];
  if (cz.teams.length) {
    const appNumbers = new Map(cz.teams.filter((t) => appOf.get(t.id)?.draw_no != null).map((t) => [t.id, appOf.get(t.id)!.draw_no!]));
    const { stc, source } = czStartNumbers(cz.teams, cz.rounds, appNumbers);
    if (!source) warnings.push('Startovní čísla nelze z chess.cz ověřit (1. kolo neodpovídá Bergerovým tabulkám) — použito pořadí podle ID družstev');
    for (const t of cz.teams) {
      const a = appOf.get(t.id);
      if (a?.draw_no != null && stc.get(t.id) !== a.draw_no) warnings.push(`${t.name}: startovní číslo na chess.cz (${stc.get(t.id)}) se liší od losovacího čísla v aplikaci (${a.draw_no})`);
    }
    teams = cz.teams.map((t) => toTeam(appOf.get(t.id), keyOfCz(t.id), t.name, stc.get(t.id) ?? null)).sort((a, b) => (a.stc ?? 99) - (b.stc ?? 99));
  } else {
    teams = [...active].sort((a, b) => (a.draw_no ?? 99) - (b.draw_no ?? 99) || a.position - b.position).map((a) => toTeam(a, a.id, a.name, a.draw_no));
  }

  // Schedule.
  const roundDates = new Map(detail.rounds.map((r) => [r.round, r.date]));
  const appRounds = appSchedule(active, roundDates);
  let rounds: BRound[] = [];
  if (cz.rounds.length) rounds = cz.rounds.map((r) => ({ nr: r.nr, date: r.date, matches: r.matches.map((m) => ({ home: keyOfCz(m.home), away: keyOfCz(m.away) })) }));
  else if (cfg.appData.schedule && appRounds) rounds = appRounds;

  // Rosters.
  const appPlayers = (teamId: string | undefined) => (teamId ? checkTeam.get(teamId)?.players ?? null : null);
  const rosters: Record<string, BPlayer[] | null> = {};
  let czRosters = 0;
  let appRosters = 0;
  const missingCzRosters: string[] = [];
  for (const t of teams) {
    const czId = cz.teams.find((x) => keyOfCz(x.id) === t.key)?.id;
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
        const list = (issues.get(p.id) ?? []).filter((i) => i.level === 'bad' || i.strike);
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
      deficiencies,
      sameClub: sameClub.filter(([a, b]) => inBulletin.has(a) && inBulletin.has(b)),
      warnings,
    },
    availability: {
      czTeams: cz.teams.length > 0, czSchedule: cz.rounds.length > 0, czRosters,
      appSchedule: !!appRounds, appRosters, missingCzRosters,
    },
  };
}

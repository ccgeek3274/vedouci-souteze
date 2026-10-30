// Competition schedule shared by the referee assignment page, the public schedule page and the bulletins:
// chess.cz teams paired with the app's teams + the chess.cz rounds, or — when chess.cz has no schedule yet — the
// app's Berger draw (draw numbers). Team keys: app team id, or `cz:<chess.cz team id>` for a team not in the app.
import { bestTeamMatch, fold } from './text';
import { matchStart, shortTime, type StartTeam } from './startTime';
import { appSchedule, czStartNumbers, type CzRound, type CzTeam } from './bulletin/source';
import type { BRound } from './bulletin/initial';

export type SchedAppTeam = StartTeam & {
  id: string; name: string; chesscz_team_id: number | null; draw_no: number | null; position: number;
  club_code: string | null; club_name: string;
};
export type SchedTeam<T> = { key: string; stc: number | null; name: string; czId: number | null; app: T | null };
export type Schedule<T> = {
  teams: SchedTeam<T>[]; // in start-number order
  rounds: BRound[];
  source: 'chesscz' | 'app' | null; // where the rounds come from (null = none yet)
  appAvailable: boolean; // the app's draw numbers are complete (Berger schedule possible)
  warnings: string[];
};

/** chess.cz team → app team: the stored chess.cz team id, else the unique best name match among unpaired teams. */
export function pairCzTeams<T extends { chesscz_team_id: number | null; name: string }>(cz: CzTeam[], app: T[]): Map<number, T> {
  const out = new Map<number, T>();
  for (const t of cz) {
    const a = app.find((x) => x.chesscz_team_id === t.id) ?? bestTeamMatch(t.name, app.filter((x) => !x.chesscz_team_id), (x) => x.name);
    if (a) out.set(t.id, a);
  }
  return out;
}

/**
 * Teams and rounds of the competition. `useApp` allows the app's Berger schedule when chess.cz has no rounds
 * (the bulletin asks the vedoucí to confirm it; the referee page and the public page use it right away).
 */
export function competitionSchedule<T extends SchedAppTeam>(
  active: T[], cz: { teams: CzTeam[]; rounds: CzRound[] }, roundDates: Map<number, string>, useApp: boolean,
): Schedule<T> {
  const warnings: string[] = [];
  const appOf = pairCzTeams(cz.teams, active);
  for (const t of cz.teams) if (!appOf.has(t.id)) warnings.push(`Družstvo ${t.name} z chess.cz není v aplikaci — chybí místnost, kontakty a rozhodčí`);
  const keyOfCz = (id: number) => appOf.get(id)?.id ?? `cz:${id}`;

  let teams: SchedTeam<T>[];
  if (cz.teams.length) {
    const appNumbers = new Map(cz.teams.filter((t) => appOf.get(t.id)?.draw_no != null).map((t) => [t.id, appOf.get(t.id)!.draw_no!]));
    const { stc, source } = czStartNumbers(cz.teams, cz.rounds, appNumbers);
    if (!source) warnings.push('Startovní čísla nelze z chess.cz ověřit (1. kolo neodpovídá Bergerovým tabulkám) — použito pořadí podle ID družstev');
    for (const t of cz.teams) {
      const a = appOf.get(t.id);
      if (a?.draw_no != null && stc.get(t.id) !== a.draw_no) warnings.push(`${t.name}: startovní číslo na chess.cz (${stc.get(t.id)}) se liší od losovacího čísla v aplikaci (${a.draw_no})`);
    }
    teams = cz.teams
      .map((t) => ({ key: keyOfCz(t.id), stc: stc.get(t.id) ?? null, name: t.name, czId: t.id, app: appOf.get(t.id) ?? null }))
      .sort((a, b) => (a.stc ?? 99) - (b.stc ?? 99));
  } else {
    teams = [...active]
      .sort((a, b) => (a.draw_no ?? 99) - (b.draw_no ?? 99) || a.position - b.position)
      .map((a) => ({ key: a.id, stc: a.draw_no, name: a.name, czId: a.chesscz_team_id, app: a }));
  }

  const appRounds = appSchedule(active, roundDates);
  let rounds: BRound[] = [];
  let source: Schedule<T>['source'] = null;
  if (cz.rounds.length) {
    rounds = cz.rounds.map((r) => ({ nr: r.nr, date: r.date, matches: r.matches.map((m) => ({ home: keyOfCz(m.home), away: keyOfCz(m.away) })) }));
    source = 'chesscz';
  } else if (useApp && appRounds) {
    rounds = appRounds;
    source = 'app';
  }
  return { teams, rounds, source, appAvailable: !!appRounds, warnings };
}

export type SchedMatch = {
  board: number; home: string; away: string;
  time: string; // actual start ("9:00")
  exception: boolean; conflict: boolean; // start differs from the round's start / home and away exceptions disagree
};
export type SchedRound = { nr: number; date: string; start: string; last: boolean; matches: SchedMatch[] };

/** Round "on the programme": the first one dated today or later (null when all are past or undated). */
export function currentRoundNr(rounds: { nr: number; date: string }[], today: string): number | null {
  const next = [...rounds].sort((a, b) => a.nr - b.nr).find((r) => /^\d{4}-\d{2}-\d{2}/.test(r.date) && r.date.slice(0, 10) >= today);
  return next?.nr ?? null;
}

/** Rounds with the start of every match (start-time exceptions, the last round at lastStart). */
export function scheduleRounds<T extends StartTeam>(s: { teams: SchedTeam<T>[]; rounds: BRound[] }, defaultStart: string, lastStart = ''): SchedRound[] {
  const team = new Map(s.teams.map((t) => [t.key, t.app]));
  const lastNr = s.rounds.length ? Math.max(...s.rounds.map((r) => r.nr)) : null;
  return [...s.rounds].sort((a, b) => a.nr - b.nr).map((r) => {
    const last = r.nr === lastNr;
    return {
      nr: r.nr, date: r.date, last,
      start: shortTime(last && lastStart ? lastStart : defaultStart),
      matches: r.matches.map((m, i) => {
        const st = matchStart(team.get(m.home) ?? null, team.get(m.away) ?? null, defaultStart, { nr: r.nr, last, lastStart });
        return { board: i + 1, home: m.home, away: m.away, time: shortTime(st.time), exception: st.exception, conflict: st.conflict };
      }),
    };
  });
}

// ── Referees ──────────────────────────────────────────────────────────────────────────────────────

export const refKey = (round: number, homeKey: string) => `${round}:${homeKey}`;

type RefTeam = { key: string; contacts: { role: string; name: string }[] };

/** Referees of a team from its contacts (e-soupiska order). */
export const teamReferees = (contacts: { role: string; name: string }[]) =>
  contacts.filter((c) => c.role === 'rozhodci' && c.name.trim()).map((c) => c.name.trim());

/** Automatic assignment: each team's home matches go round-robin through its referees (in contact order). */
export function rotatedReferees(data: { teams: RefTeam[]; rounds: BRound[] }): Map<string, string> {
  const refs = new Map(data.teams.map((t) => [t.key, teamReferees(t.contacts)]));
  const count = new Map<string, number>();
  const out = new Map<string, string>();
  for (const r of [...data.rounds].sort((a, b) => a.nr - b.nr)) {
    for (const m of r.matches) {
      const list = refs.get(m.home) ?? [];
      if (!list.length) continue;
      const i = count.get(m.home) ?? 0;
      out.set(refKey(r.nr, m.home), list[i % list.length]);
      count.set(m.home, i + 1);
    }
  }
  return out;
}

/** Name comparison independent of word order, case, diacritics and punctuation ("Jílek Jakub" = "Jakub Jílek"). */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');
  return norm(a) !== '' && norm(a) === norm(b);
}

/**
 * Nominated referees written otherwise than in the contacts (word order, diacritics, case — e.g. after fixing
 * a contact on Kontrola soupisek) → the contact's spelling. The home team's contacts first, then any team's.
 * Only the spelling changes, never who referees the match.
 */
export function respelledReferees(assignments: Record<string, string>, teams: RefTeam[]): { next: Record<string, string>; changes: { from: string; to: string }[] } {
  const names = (t: RefTeam | undefined) => (t?.contacts ?? []).map((c) => c.name.trim()).filter(Boolean);
  const all = teams.flatMap(names);
  const next = { ...assignments };
  const changes: { from: string; to: string }[] = [];
  for (const [key, value] of Object.entries(assignments)) {
    const v = value.trim();
    if (!v) continue;
    const home = teams.find((t) => refKey(Number(key.split(':')[0]), t.key) === key);
    const to = [...names(home), ...all].find((n) => sameName(n, v));
    if (!to || to === v) continue;
    next[key] = to;
    if (!changes.some((c) => c.from === v && c.to === to)) changes.push({ from: v, to });
  }
  return { next, changes };
}

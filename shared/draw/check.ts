// Draw-meeting checks (M7): rules and conditions evaluated on the Berger draw for given draw numbers,
// and the "controlled draw" helper — for teams without a number, the cost of every free number.
// The application never draws by itself; it only shows consequences of numbers entered by the user.
import { fold } from '../text';
import { bergerRounds, type Pairing } from './berger';

export type ConstraintKind = 'draw_no' | 'home' | 'away' | 'meet' | 'alternate' | 'same';

/** Structured part of a draw request (requests.kind = 'draw_no'); `kind` null = not specified yet. */
export type DrawConstraint = {
  id: number;
  team_id: string;
  kind: ConstraintKind | null;
  round: number | null;
  value: number | null;
  other_team_id: string | null;
  ext_name: string;
  ext_no: number | null;
  ext_teams: number | null;
};

/** Request row fields needed for the draw (subset of the requests table). */
export type DrawRequestFields = {
  id: number; team_id: string | null; kind: string; status: string; round: number | null;
  draw_kind: string | null; value: number | null; other_team_id: string | null; ext_name: string; ext_no: number | null; ext_teams: number | null;
};

/** Draw conditions = draw requests of a team that are not rejected. */
export function drawConstraints(requests: DrawRequestFields[]): DrawConstraint[] {
  return requests.filter((r) => r.kind === 'draw_no' && r.status !== 'rejected' && r.team_id).map((r) => ({
    id: r.id, team_id: r.team_id!, kind: (CONSTRAINT_KINDS as string[]).includes(r.draw_kind ?? '') ? (r.draw_kind as ConstraintKind) : null,
    round: r.round, value: r.value, other_team_id: r.other_team_id, ext_name: r.ext_name ?? '', ext_no: r.ext_no, ext_teams: r.ext_teams,
  }));
}

/** What is still missing in the condition (null = complete and checkable). */
export function missingSpec(c: DrawConstraint): string | null {
  switch (c.kind) {
    case null: return 'není určen druh podmínky';
    case 'draw_no': return c.value ? null : 'chybí požadované číslo';  // out of range → simply never met
    case 'home':
    case 'away': return c.round ? null : 'chybí kolo';
    case 'meet': return !c.other_team_id ? 'chybí soupeř' : !c.round ? 'chybí kolo' : null;
    case 'alternate':
    case 'same':
      if (c.other_team_id) return null;
      return !c.ext_teams && !c.ext_no ? 'chybí číslo a počet družstev druhé soutěže'
        : !c.ext_no ? 'chybí losovací číslo družstva druhé soutěže' : !c.ext_teams ? 'chybí počet družstev druhé soutěže'
        : c.ext_teams < 2 || c.ext_no > tableSize(c.ext_teams) ? 'číslo druhé soutěže mimo rozsah' : null;
  }
}

/** Human description of the condition (Czech). */
export function describeDraw(c: Omit<DrawConstraint, 'id' | 'team_id'>, name: (id: string | null) => string): string {
  const q = (v: unknown) => (v == null || v === '' ? '?' : String(v));
  switch (c.kind) {
    case null: return 'neurčeno';
    case 'draw_no': return `losovací číslo ${q(c.value)}`;
    case 'home': return `doma v ${q(c.round)}. kole`;
    case 'away': return `nehrát doma v ${q(c.round)}. kole`;
    case 'meet': return `vzájemný zápas s ${c.other_team_id ? name(c.other_team_id) : '?'} v ${q(c.round)}. kole`;
    case 'alternate':
    case 'same': {
      const other = c.other_team_id ? name(c.other_team_id)
        : `${c.ext_name || 'družstvo jiné soutěže'} (č. ${q(c.ext_no)} z ${q(c.ext_teams)} družstev)`;
      return c.kind === 'alternate' ? `protičíslo k ${other}` : `souběžně s ${other}`;
    }
  }
}

/** Guess the kind of a free-text draw request (e-soupiska); null when unclear. */
export function guessDrawKind(text: string): ConstraintKind | null {
  const f = fold(text);
  if (/proti\s*cisl|opacn|stridav/.test(f)) return 'alternate';
  if (/soubez/.test(f)) return 'same';
  return null;
}

export type DrawTeam = { id: string; name: string; club_code: string | null; club_name: string; draw_no: number | null };

export type DrawInput = {
  teams: DrawTeam[];
  constraints: DrawConstraint[];
  roundDates: (string | undefined)[]; // ISO date of round r at index r-1
  deadline: string | null;            // same-club teams must meet by this date (inclusive)
};

export type Violation = { teams: string[]; text: string; weight: number; constraintId?: number };

export const CONSTRAINT_KINDS: ConstraintKind[] = ['draw_no', 'home', 'away', 'meet', 'alternate', 'same'];

export const CONSTRAINT_LABEL: Record<ConstraintKind, string> = {
  draw_no: 'Losovací číslo',
  home: 'Doma v kole',
  away: 'Venku (nebo volno) v kole',
  meet: 'Vzájemný zápas v kole',
  alternate: 'Protičíslo (nehrát doma současně)',
  same: 'Souběžně (doma ve stejných kolech)',
};

// Weights for the controlled-draw ranking: hard requests first, pattern clashes count per round.
const W = { draw_no: 10, home: 3, away: 3, meet: 5, alternate: 1, same: 1, mutual: 10 };

/** Berger table size (even). */
export const tableSize = (teams: number) => teams + (teams % 2);

/** Default deadline for same-club matches: 31. 12. of the first season year. */
export function defaultDeadline(season: string): string {
  return `${parseInt(season, 10)}-12-31`;
}

/** Club key of a team: chess.cz code, else the folded club name (teams of one club share it). */
export function clubKey(t: Pick<DrawTeam, 'club_code' | 'club_name'>): string {
  return t.club_code ? `#${t.club_code}` : fold(t.club_name).replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Groups of teams of the same club (≥ 2). */
export function sameClubGroups<T extends DrawTeam>(teams: T[]): T[][] {
  const by = new Map<string, T[]>();
  for (const t of teams) {
    const k = clubKey(t);
    if (k) by.set(k, [...(by.get(k) ?? []), t]);
  }
  return [...by.values()].filter((g) => g.length > 1);
}

/** Precomputed Berger data for a table of size N (even). */
export class Table {
  readonly rounds: Pairing[][];
  private pattern = new Map<number, (boolean | null)[]>();
  constructor(readonly size: number) {
    this.rounds = bergerRounds(size);
  }
  /** Home (true) / away (false) per round; `empty` = numbers without a team (their opponents have a bye → null). */
  homes(no: number, empty: Set<number> = new Set()): (boolean | null)[] {
    const key = no * 1000 + [...empty].reduce((a, b) => a + b * 31, 0);
    let p = this.pattern.get(key);
    if (!p) {
      p = this.rounds.map((ms) => {
        const m = ms.find((x) => x.home === no || x.away === no)!;
        const opp = m.home === no ? m.away : m.home;
        return opp === null || empty.has(opp) ? null : m.home === no;
      });
      this.pattern.set(key, p);
    }
    return p;
  }
  /** Round (1-based) of the match between numbers a and b and whether a is at home. */
  meeting(a: number, b: number): { round: number; aHome: boolean } {
    for (let r = 0; r < this.rounds.length; r++) {
      for (const m of this.rounds[r]) {
        if (m.home === a && m.away === b) return { round: r + 1, aHome: true };
        if (m.home === b && m.away === a) return { round: r + 1, aHome: false };
      }
    }
    throw new Error(`numbers ${a} and ${b} never meet`);
  }
}

const tableCache = new Map<number, Table>();
export function table(size: number): Table {
  let t = tableCache.get(size);
  if (!t) tableCache.set(size, (t = new Table(size)));
  return t;
}

const roundsText = (rs: number[]) => (rs.length === 1 ? `v ${rs[0]}. kole` : `v kolech ${rs.join(', ')}`);

/**
 * Violations of the rules and conditions for the given assignment (team id → number).
 * Only conditions whose teams all have a number are evaluated. `empty` = numbers known to have no team
 * (bye of their opponents); while numbers are still being drawn it is unknown, then every number counts as a team.
 */
export function violations(input: DrawInput, assign: Map<string, number>, empty: Set<number> = new Set()): Violation[] {
  const n = input.teams.length;
  const T = table(tableSize(n));
  const name = new Map(input.teams.map((t) => [t.id, t.name]));
  const out: Violation[] = [];
  for (const c of input.constraints) {
    const a = assign.get(c.team_id);
    if (a == null || missingSpec(c)) continue;
    const who = name.get(c.team_id) ?? '?';
    const pa = T.homes(a, empty);
    switch (c.kind) {
      case 'draw_no':
        if (c.value != null && a !== c.value) out.push({ teams: [c.team_id], text: `${who}: požadováno číslo ${c.value}, má ${a}`, weight: W.draw_no, constraintId: c.id });
        break;
      case 'home':
      case 'away': {
        const r = c.round ?? 0;
        const h = pa[r - 1];
        if (r < 1 || r > pa.length) break;
        if (c.kind === 'home' && h !== true) out.push({ teams: [c.team_id], text: `${who}: má hrát doma v ${r}. kole, ale ${h === null ? 'má volno' : 'hraje venku'}`, weight: W.home, constraintId: c.id });
        if (c.kind === 'away' && h === true) out.push({ teams: [c.team_id], text: `${who}: nemá hrát doma v ${r}. kole, ale hraje doma`, weight: W.away, constraintId: c.id });
        break;
      }
      case 'meet': {
        const b = c.other_team_id ? assign.get(c.other_team_id) : undefined;
        if (b == null || c.round == null) break;
        const m = T.meeting(a, b);
        if (m.round !== c.round) out.push({ teams: [c.team_id, c.other_team_id!], text: `${who} – ${name.get(c.other_team_id!)}: vzájemný zápas má být v ${c.round}. kole, vychází v ${m.round}. kole`, weight: W.meet, constraintId: c.id });
        break;
      }
      case 'alternate':
      case 'same': {
        let pb: (boolean | null)[];
        let other: string;
        let skip = 0; // round of the mutual match (same group): the two can never play "the same way" then
        if (c.other_team_id) {
          const b = assign.get(c.other_team_id);
          if (b == null) break;
          pb = T.homes(b, empty);
          other = name.get(c.other_team_id) ?? '?';
          skip = T.meeting(a, b).round;
        } else {
          const size = tableSize(c.ext_teams!);
          pb = table(size).homes(c.ext_no!, c.ext_teams! % 2 ? new Set([size]) : new Set());
          other = `${c.ext_name || 'družstvo jiné soutěže'} (č. ${c.ext_no})`;
        }
        const bad: number[] = [];
        for (let r = 0; r < Math.min(pa.length, pb.length); r++) {
          if (r + 1 === skip || pa[r] === null || pb[r] === null) continue;
          if (c.kind === 'alternate' ? pa[r] && pb[r] : pa[r] !== pb[r]) bad.push(r + 1);
        }
        if (bad.length) {
          out.push({
            teams: [c.team_id, ...(c.other_team_id ? [c.other_team_id] : [])],
            text: c.kind === 'alternate'
              ? `${who} a ${other} hrají oba doma ${roundsText(bad)}`
              : `${who} a ${other} nehrají souběžně ${roundsText(bad)}`,
            weight: W[c.kind] * bad.length,
            constraintId: c.id,
          });
        }
        break;
      }
    }
  }
  // Rule: teams of one club must meet by the deadline.
  if (input.deadline) {
    for (const g of sameClubGroups(input.teams)) {
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          const a = assign.get(g[i].id);
          const b = assign.get(g[j].id);
          if (a == null || b == null) continue;
          const r = T.meeting(a, b).round;
          const date = input.roundDates[r - 1];
          if (date && date > input.deadline) {
            out.push({ teams: [g[i].id, g[j].id], text: `${g[i].name} – ${g[j].name} (stejný oddíl) se utkají až v ${r}. kole (${date}), mají do ${input.deadline}`, weight: W.mutual });
          }
        }
      }
    }
  }
  return out;
}

/** Teams that take part in a condition or in the same-club rule (only these influence the cost). */
export function involvedTeams(input: DrawInput): Set<string> {
  const s = new Set<string>();
  for (const c of input.constraints) {
    if (missingSpec(c)) continue;
    s.add(c.team_id);
    if (c.other_team_id) s.add(c.other_team_id);
  }
  if (input.deadline) for (const g of sameClubGroups(input.teams)) for (const t of g) s.add(t.id);
  return s;
}

export type Suggestion = {
  /** team id → number → lowest reachable total cost when that team takes the number */
  cost: Map<string, Map<number, number>>;
  /** cost of the best completion of the current assignment */
  best: number;
  /** search was cut off (too many teams with conditions): costs are only an estimate */
  partial: boolean;
};

/**
 * Controlled draw: for every team with a condition and without a number, the lowest total cost reachable
 * with each free number (exhaustive over the involved teams; others do not influence the cost).
 */
export function suggestNumbers(input: DrawInput, limit = 400_000): Suggestion {
  const size = tableSize(input.teams.length);
  const assign = new Map<string, number>();
  for (const t of input.teams) if (t.draw_no != null && t.draw_no >= 1 && t.draw_no <= size) assign.set(t.id, t.draw_no);
  const used = new Set(assign.values());
  const free = Array.from({ length: size }, (_, i) => i + 1).filter((x) => !used.has(x));
  const involved = involvedTeams(input);
  const open = input.teams.filter((t) => involved.has(t.id) && !assign.has(t.id)).map((t) => t.id);
  // Conditions whose teams are all assigned already add a constant.
  const cost = new Map(open.map((id) => [id, new Map<number, number>()]));
  let best = Infinity;
  let leaves = 0;
  let partial = false;
  const taken = new Set<number>();
  const chosen: number[] = [];
  const dfs = (i: number) => {
    if (partial) return;
    if (i === open.length) {
      if (++leaves > limit) { partial = true; return; }
      const total = violations(input, assign).reduce((s, v) => s + v.weight, 0);
      best = Math.min(best, total);
      open.forEach((id, k) => {
        const m = cost.get(id)!;
        if (!(m.get(chosen[k])! <= total)) m.set(chosen[k], total);
      });
      return;
    }
    for (const no of free) {
      if (taken.has(no)) continue;
      taken.add(no);
      chosen[i] = no;
      assign.set(open[i], no);
      dfs(i + 1);
      assign.delete(open[i]);
      taken.delete(no);
    }
  };
  if (open.length && free.length >= open.length) dfs(0);
  else best = violations(input, assign).reduce((s, v) => s + v.weight, 0);
  return { cost, best: best === Infinity ? 0 : best, partial };
}

/** One match of the generated draw. */
export type Fixture = { round: number; board: number; home: string | null; away: string | null };

/** Draw by rounds; numbers without a team give their opponent a bye (null side). */
export function fixtures(teams: DrawTeam[]): Fixture[][] {
  const size = tableSize(teams.length);
  const byNo = new Map(teams.filter((t) => t.draw_no != null).map((t) => [t.draw_no!, t.id]));
  return table(size).rounds.map((ms, r) => ms.map((m) => ({
    round: r + 1, board: m.board, home: byNo.get(m.home) ?? null, away: m.away == null ? null : byNo.get(m.away) ?? null,
  })));
}

/** Problems of the entered numbers themselves (range, duplicates). */
export function numberProblems(teams: DrawTeam[]): string[] {
  const size = tableSize(teams.length);
  const out: string[] = [];
  const seen = new Map<number, string>();
  for (const t of teams) {
    if (t.draw_no == null) continue;
    if (t.draw_no < 1 || t.draw_no > size) out.push(`${t.name}: číslo ${t.draw_no} mimo rozsah 1–${size}`);
    else if (seen.has(t.draw_no)) out.push(`Číslo ${t.draw_no} má ${seen.get(t.draw_no)} i ${t.name}`);
    else seen.set(t.draw_no, t.name);
  }
  return out;
}

/** Numbers without a team once every team has one (odd count → the bye number); otherwise unknown (empty). */
export function emptyNumbers(teams: DrawTeam[]): Set<number> {
  if (teams.some((t) => t.draw_no == null)) return new Set();
  const used = new Set(teams.map((t) => t.draw_no));
  return new Set(Array.from({ length: tableSize(teams.length) }, (_, i) => i + 1).filter((x) => !used.has(x)));
}

export type ConditionState = { state: 'ok' | 'violated' | 'unresolved' | 'waiting'; text: string };

/** State of every condition for the current numbers: nevyřešeno (incomplete) / čeká na čísla / splněno / porušeno. */
export function conditionStates(input: DrawInput, assign: Map<string, number>, empty: Set<number> = new Set()): Map<number, ConditionState> {
  const viol = violations(input, assign, empty);
  const out = new Map<number, ConditionState>();
  for (const c of input.constraints) {
    const miss = missingSpec(c);
    if (miss) { out.set(c.id, { state: 'unresolved', text: `nevyřešeno — ${miss}` }); continue; }
    const v = viol.find((x) => x.constraintId === c.id);
    if (v) { out.set(c.id, { state: 'violated', text: v.text }); continue; }
    const needs = [c.team_id, ...(c.kind === 'meet' || c.other_team_id ? [c.other_team_id] : [])];
    out.set(c.id, needs.every((id) => id && assign.has(id)) ? { state: 'ok', text: 'splněno' } : { state: 'waiting', text: 'čeká na losovací čísla' });
  }
  return out;
}

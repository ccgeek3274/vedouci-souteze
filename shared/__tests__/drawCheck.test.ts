import { describe, it, expect } from 'vitest';
import { conditionStates, guessDrawKind, emptyNumbers, fixtures, numberProblems, sameClubGroups, suggestNumbers, violations, type DrawConstraint, type DrawInput, type DrawTeam } from '../draw/check';

const team = (id: string, club: string, draw_no: number | null = null): DrawTeam => ({ id, name: id, club_code: club, club_name: '', draw_no });
const con = (c: Partial<DrawConstraint> & Pick<DrawConstraint, 'team_id' | 'kind'>): DrawConstraint =>
  ({ id: 1, round: null, value: null, other_team_id: null, ext_name: '', ext_no: null, ext_teams: null, ...c });
// 10 rounds of RPB 2026/27; round 4 = 6. 12. 2026, round 5 = 10. 1. 2027.
const DATES = ['2026-10-18', '2026-11-08', '2026-11-22', '2026-12-06', '2027-01-10', '2027-01-24', '2027-02-07', '2027-02-21', '2027-03-14'];
const assignOf = (teams: DrawTeam[]) => new Map(teams.filter((t) => t.draw_no != null).map((t) => [t.id, t.draw_no!]));

describe('draw checks', () => {
  const teams = Array.from({ length: 10 }, (_, i) => team(`T${i + 1}`, `c${i + 1}`, i + 1));
  it('same-club teams must meet by the deadline', () => {
    teams[4].club_code = 'D'; teams[5].club_code = 'D'; // 5–6 meet in round 1
    const input: DrawInput = { teams, constraints: [], roundDates: DATES, deadline: '2026-12-31' };
    expect(sameClubGroups(teams)).toHaveLength(1);
    expect(violations(input, assignOf(teams))).toEqual([]);
    teams[5].club_code = 'c6'; teams[9].club_code = 'D'; // 5–10 meet in round 9
    expect(violations(input, assignOf(teams))[0].text).toMatch(/až v 9\. kole/);
    teams[9].club_code = 'c10'; teams[4].club_code = 'c5';
  });
  it('home / away / meet / draw number conditions', () => {
    const input: DrawInput = {
      teams, roundDates: DATES, deadline: null, constraints: [
        con({ team_id: 'T1', kind: 'home', round: 1 }),          // 1–10 in round 1: home → ok
        con({ team_id: 'T10', kind: 'home', round: 1 }),         // away → violation
        con({ team_id: 'T2', kind: 'away', round: 2 }),          // 1–2: 2 away → ok
        con({ team_id: 'T3', kind: 'meet', other_team_id: 'T1', round: 3 }), // 3–1 in round 3 → ok
        con({ team_id: 'T4', kind: 'draw_no', value: 7 }),
      ],
    };
    const v = violations(input, assignOf(teams));
    expect(v.map((x) => x.text)).toEqual(['T10: má hrát doma v 1. kole, ale hraje venku', 'T4: požadováno číslo 7, má 4']);
  });
  it('alternate with a team of another competition (protičíslo)', () => {
    const c = (no: number) => con({ team_id: 'T1', kind: 'alternate', ext_name: 'Kralupy A', ext_no: no, ext_teams: 10 });
    const clashes = (no: number) => violations({ teams, roundDates: DATES, deadline: null, constraints: [c(no)] }, assignOf(teams));
    // some number of the same table is a perfect counterpart of number 1
    const perfect = [2, 3, 4, 5, 6, 7, 8, 9, 10].filter((no) => clashes(no).length === 0);
    expect(perfect.length).toBeGreaterThan(0);
    expect(clashes(1)[0].text).toMatch(/hrají oba doma/);
  });
  it('controlled draw ranks free numbers', () => {
    const open = teams.map((t) => ({ ...t, draw_no: t.id === 'T5' || t.id === 'T6' ? null : t.draw_no }));
    open[4].club_code = 'D'; open[5].club_code = 'D';
    const input: DrawInput = { teams: open, constraints: [], roundDates: DATES, deadline: '2026-12-31' };
    const s = suggestNumbers(input);
    expect(s.best).toBe(0);
    expect([...s.cost.get('T5')!.values()].every((x) => x === 0)).toBe(true); // 5 and 6 left: they meet in round 1 either way
  });
  it('numbers, byes and fixtures', () => {
    const odd = Array.from({ length: 5 }, (_, i) => team(`T${i + 1}`, `c${i}`, i + 2)); // numbers 2..6, number 1 empty
    expect(emptyNumbers(odd)).toEqual(new Set([1]));
    const f = fixtures(odd);
    expect(f).toHaveLength(5);
    expect(f[0][0]).toEqual({ round: 1, board: 1, home: null, away: 'T5' }); // 1–6: T5 has a bye
    expect(numberProblems([team('a', 'x', 3), team('b', 'y', 3), team('c', 'z', 9)])).toEqual(['Číslo 3 má a i b', 'c: číslo 9 mimo rozsah 1–4']);
  });
  it('condition states: incomplete requests are unresolved', () => {
    const half = teams.map((t) => ({ ...t, draw_no: t.id === 'T2' ? null : t.draw_no }));
    const input: DrawInput = {
      teams: half, roundDates: DATES, deadline: null, constraints: [
        con({ id: 1, team_id: 'T1', kind: 'alternate', ext_name: 'Kralupy A' }),
        con({ id: 2, team_id: 'T1', kind: null }),
        con({ id: 3, team_id: 'T1', kind: 'same', other_team_id: 'T2' }),
        con({ id: 4, team_id: 'T1', kind: 'home', round: 1 }),
      ],
    };
    const st = conditionStates(input, assignOf(half));
    expect(st.get(1)).toEqual({ state: 'unresolved', text: 'nevyřešeno — chybí číslo a počet družstev druhé soutěže' });
    expect(st.get(2)!.state).toBe('unresolved');
    expect(st.get(3)!.state).toBe('waiting');
    expect(st.get(4)!.state).toBe('ok');
    expect(guessDrawKind('protičíslo ke Kralupy A (KP)')).toBe('alternate');
    expect(guessDrawKind('jsou v souvislosti s losováním KP')).toBeNull();
  });
});

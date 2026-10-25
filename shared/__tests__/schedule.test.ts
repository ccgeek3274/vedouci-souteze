import { describe, expect, it } from 'vitest';
import { competitionSchedule, currentRoundNr, pairCzTeams, rotatedReferees, sameName, scheduleRounds, type SchedAppTeam } from '../schedule';

const app = (id: string, name: string, draw_no: number | null, extra: Partial<SchedAppTeam> = {}): SchedAppTeam =>
  ({ id, name, chesscz_team_id: null, draw_no, position: draw_no ?? 0, club_code: null, club_name: '', ...extra });

describe('schedule', () => {
  it('pairs chess.cz teams by id, else by name', () => {
    const teams = [app('a', 'Sokol Mšeno', 1), app('b', 'Kralupy C', 2, { chesscz_team_id: 7 })];
    const m = pairCzTeams([{ id: 7, name: 'Cokoli', rank: 1 }, { id: 8, name: 'Sokol Mšeno', rank: 2 }, { id: 9, name: 'Neznámý D', rank: 3 }], teams);
    expect(m.get(7)?.id).toBe('b');
    expect(m.get(8)?.id).toBe('a');
    expect(m.has(9)).toBe(false);
  });

  it('chess.cz schedule with app keys; unpaired team keyed cz:<id>', () => {
    const teams = [app('a', 'Tým A', 1), app('b', 'Tým B', 2)];
    const s = competitionSchedule(teams, {
      teams: [{ id: 11, name: 'Tým A', rank: 1 }, { id: 12, name: 'Tým B', rank: 2 }, { id: 13, name: 'Cizí C', rank: 3 }, { id: 14, name: 'Tým X', rank: 4 }],
      rounds: [{ nr: 1, date: '2026-10-18', matches: [{ home: 11, away: 14 }, { home: 12, away: 13 }] }],
    }, new Map(), false);
    expect(s.source).toBe('chesscz');
    expect(s.rounds[0].matches[0]).toEqual({ home: 'a', away: 'cz:14' });
    expect(s.warnings.some((w) => w.includes('Cizí C'))).toBe(true);
  });

  it('app Berger schedule only when allowed; starts with exceptions and the last round', () => {
    const teams = [app('a', 'A', 1, { start_home: '10:00' }), app('b', 'B', 2), app('c', 'C', 3), app('d', 'D', 4)];
    const dates = new Map([[1, '2026-10-18'], [2, '2026-11-08'], [3, '2026-11-22']]);
    expect(competitionSchedule(teams, { teams: [], rounds: [] }, dates, false).rounds).toEqual([]);
    const s = competitionSchedule(teams, { teams: [], rounds: [] }, dates, true);
    expect(s.source).toBe('app');
    const rounds = scheduleRounds(s, '09:00', '08:30');
    const homeA = rounds.filter((r) => !r.last).flatMap((r) => r.matches).filter((m) => m.home === 'a');
    expect(homeA.every((m) => m.time === '10:00' && m.exception)).toBe(true);
    const last = rounds[rounds.length - 1];
    expect(last.start).toBe('8:30');
    expect(last.matches.every((m) => m.time === '8:30' && !m.exception)).toBe(true);
  });

  it('rotates referees and compares names regardless of order', () => {
    const r = rotatedReferees({
      teams: [{ key: 'a', contacts: [{ role: 'rozhodci', name: 'R1' }, { role: 'kapitan', name: 'K' }, { role: 'rozhodci', name: 'R2' }] }],
      rounds: [1, 2, 3].map((nr) => ({ nr, date: '', matches: [{ home: 'a', away: 'b' }] })),
    });
    expect([...r.values()]).toEqual(['R1', 'R2', 'R1']);
    expect(sameName('Jakub Jílek', 'Jílek Jakub')).toBe(true);
    expect(sameName('Meca Viktor,st.', 'Meca Viktor st.')).toBe(true);
    expect(sameName('Meca Viktor', 'Meca Viktor st.')).toBe(false);
    expect(sameName('', '')).toBe(false);
  });

  it('current round = first round dated today or later', () => {
    const rounds = [{ nr: 2, date: '2026-11-08' }, { nr: 1, date: '2026-10-11' }, { nr: 3, date: '' }];
    expect(currentRoundNr(rounds, '2026-10-11')).toBe(1);
    expect(currentRoundNr(rounds, '2026-10-12')).toBe(2);
    expect(currentRoundNr(rounds, '2026-11-09')).toBe(null);
  });
});

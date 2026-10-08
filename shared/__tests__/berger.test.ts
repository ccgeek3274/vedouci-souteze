import { describe, it, expect } from 'vitest';
import { bergerRounds, homePattern, meeting } from '../draw/berger';

// RPB 2026/27 from chess.cz (competition 3468), teams by start number.
const RPB = [
  [[1, 10], [2, 9], [3, 8], [4, 7], [5, 6]],
  [[10, 6], [7, 5], [8, 4], [9, 3], [1, 2]],
  [[2, 10], [3, 1], [4, 9], [5, 8], [6, 7]],
  [[10, 7], [8, 6], [9, 5], [1, 4], [2, 3]],
  [[3, 10], [4, 2], [5, 1], [6, 9], [7, 8]],
  [[10, 8], [9, 7], [1, 6], [2, 5], [3, 4]],
  [[4, 10], [5, 3], [6, 2], [7, 1], [8, 9]],
  [[10, 9], [1, 8], [2, 7], [3, 6], [4, 5]],
  [[5, 10], [6, 4], [7, 3], [8, 2], [9, 1]],
];

describe('Berger tables', () => {
  it('matches the real chess.cz draw for 10 teams', () => {
    expect(bergerRounds(10).map((r) => r.map((p) => [p.home, p.away]))).toEqual(RPB);
  });
  it('every pair meets exactly once, home games balanced', () => {
    for (const n of [4, 5, 8, 11, 12]) {
      const rounds = bergerRounds(n);
      expect(rounds.length).toBe(n - 1 + (n % 2));
      for (let a = 1; a <= n; a++) {
        for (let b = a + 1; b <= n; b++) expect(meeting(rounds, a, b)).not.toBeNull();
        const home = homePattern(rounds, a).filter((x) => x === true).length;
        expect(Math.abs(home - (n - 1) / 2)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('odd number of teams: one bye per round', () => {
    const rounds = bergerRounds(11);
    for (const r of rounds) expect(r.filter((p) => p.away === null)).toHaveLength(1);
    expect(rounds[0][0]).toEqual({ board: 1, home: 1, away: null });
    expect(homePattern(rounds, 1)[0]).toBeNull();
  });
});

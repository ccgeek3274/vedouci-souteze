import { describe, it, expect } from 'vitest';
import { bestTeamMatch, formatPhone, teamLetter, teamNameScore } from '../text';
import { normalizeDraft, parseFlags, toggleFlag } from '../roster/draft';

describe('team name matching', () => {
  it('matches the same team across documents', () => {
    expect(teamNameScore('Kralupy C', 'TJ Kralupy nad Vltavou C')).toBeGreaterThan(0.6);
    expect(teamNameScore('Sokol Bakov nad Jizerou B', 'Šachový klub Bakov nad Jizerou B')).toBeGreaterThan(0.6);
    expect(teamNameScore('Odolena Voda A', 'TJ AERO Odolena Voda A')).toBeGreaterThan(0.6);
    // letter missing on one side is tolerated (with a penalty)
    expect(teamNameScore('Aero Odolena voda', 'Odolena Voda A')).toBeGreaterThan(0.6);
    expect(teamNameScore('Aero Odolena voda', 'Odolena Voda A')).toBeLessThan(teamNameScore('Odolena Voda A', 'TJ AERO Odolena Voda A'));
  });
  it('never matches different team letters', () => {
    expect(teamNameScore('Šachklub města Dobrovice D', 'Šachklub města Dobrovice E')).toBe(0);
    expect(teamLetter('ŠK Český Brod B')).toBe('B');
    expect(teamLetter('Mšeno')).toBe('');
  });
  it('picks the best candidate', () => {
    const teams = ['TJ Neratovice D', 'Šachklub města Dobrovice D', 'Šachklub města Dobrovice E'];
    expect(bestTeamMatch('Dobrovice E', teams, (t) => t)).toBe('Šachklub města Dobrovice E');
    expect(bestTeamMatch('Kolín A', teams, (t) => t)).toBeNull();
  });
});

describe('helpers', () => {
  it('formats phones', () => {
    expect(formatPhone('604409805')).toBe('604 409 805');
    expect(formatPhone('+420 604 409 805')).toBe('604 409 805');
    expect(formatPhone('viz e-mail')).toBe('viz e-mail');
  });
  it('parses and toggles flags', () => {
    expect(parseFlags(' Z K')).toEqual({ ozn: 'K', z: true });
    expect(parseFlags('zk h')).toEqual({ ozn: 'ZK H', z: false });
    expect(toggleFlag('K', 'ZK')).toBe('ZK');
    expect(toggleFlag('ZK H', 'H')).toBe('ZK');
  });
  it('normalizes an sscr-soupiska draft', () => {
    const d = normalizeDraft({ players: [{ jmeno: ' Novák Jan ', lok: '708', fide: 0, ozn: 'K', z: true }, { jmeno: '' }] });
    expect(d.players).toEqual([expect.objectContaining({ jmeno: 'Novák Jan', lok: 708, fide: '', ozn: 'K', z: true })]);
    expect(d.zakladCount).toBe(1);
    expect(() => normalizeDraft({ foo: 1 })).toThrow(/soupisky/);
  });
});

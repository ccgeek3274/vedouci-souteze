import { describe, expect, it } from 'vitest';
import { lookupRoster, playerIssues, requiredFeeYear, sameName, strikeReason, type CheckPlayer, type CzMember } from '../roster/verify';

const member = (over: Partial<CzMember> & Record<string, unknown>) => ({
  fullName: 'Novák Jan ', birthYear: 1980, czeId: 100, fideId: 0, registration: 'Aktivní', feeYear: 2026,
  czeStdElo: 1700, fideStdElo: 0, ...over,
});
const player = (over: Partial<CheckPlayer>): CheckPlayer => ({ name: 'Novák Jan', birth_year: 1980, lok: 100, fide: null, flags: '', guest_permit: 0, ...over });

describe('lookupRoster', () => {
  const db: Record<string, unknown> = {
    '/members/100/cze': member({ czeId: 100, clubId: '12003', clubName: 'TJ Jawa Brodce' }),
    '/clubs/12003/members': [member({ czeId: 100 }), member({ czeId: 101, fullName: 'Dvořák Petr ' })],
    '/members/200/cze': member({ czeId: 200, fullName: 'Host Karel ', clubId: '12402', clubName: 'TJ AERO Odolena Voda' }),
    '/members/999/cze': [],
    [`/members/name?search=${encodeURIComponent('Svoboda Eva')}`]: [member({ czeId: 300, fullName: 'Svoboda Eva ', clubId: '12003' }), member({ czeId: 301, fullName: 'Svobodová Eva ' })],
  };
  const calls: string[] = [];
  const get = async (path: string) => { calls.push(path); return path in db ? db[path] : []; };

  it('uses the club members call for the team and falls back per player', async () => {
    const players = [
      player({}),
      player({ name: 'Dvořák Petr', lok: 101 }),
      player({ name: 'Host Karel', lok: 200, flags: 'H' }),
      player({ name: 'Neznámý Hráč', lok: 999 }),
      player({ name: 'Svoboda Eva', lok: null }),
    ];
    const r = await lookupRoster(players, null, get);
    expect(r.error).toBeNull();
    expect(r.clubCode).toBe('12003');
    expect(r.clubName).toBe('TJ Jawa Brodce');
    expect(calls.filter((c) => c.startsWith('/clubs/'))).toEqual(['/clubs/12003/members']);
    expect(calls).not.toContain('/members/101/cze');
    expect(r.checks.map((c) => c?.status)).toEqual(['found', 'found', 'found', 'not_found', 'no_id']);
    expect(r.checks[1]?.member?.clubId).toBe('12003');
    expect(r.checks[4]?.candidates?.map((m) => m.czeId)).toEqual([300]);
  });

  it('returns a partial result when chess.cz fails', async () => {
    const failing = async (path: string) => { if (path === '/members/200/cze') throw new Error('chess.cz neodpovídá'); return get(path); };
    const r = await lookupRoster([player({}), player({ name: 'Host Karel', lok: 200, flags: 'H' })], '12003', failing);
    expect(r.error).toBe('chess.cz neodpovídá');
    expect(r.checks[0]?.status).toBe('found');
    expect(r.checks[1]).toBeNull();
  });
});

describe('playerIssues', () => {
  const ctx = { clubCode: '12003', feeYear: 2026 };
  const found = (over: Partial<CzMember>) => ({ status: 'found' as const, member: { ...member({ clubId: '12003', clubName: 'TJ Jawa Brodce' }), ...over } as CzMember });

  it('is empty for a registered member of the team club', () => {
    expect(playerIssues(player({}), found({}), ctx)).toEqual([]);
  });

  it('flags registration and fee as reasons to strike', () => {
    const issues = playerIssues(player({}), found({ registration: 'Neaktivní', feeYear: 2025 }), ctx);
    expect(strikeReason(issues)).toBe('bez registrace v ŠSČR (Neaktivní); nezaplacený příspěvek 2026 (naposledy 2025)');
  });

  it('accepts the foreigner registration for C players', () => {
    expect(playerIssues(player({ flags: 'C', guest_permit: 1 }), found({ registration: 'Cizinec' }), ctx)).toEqual([]);
    expect(playerIssues(player({}), found({ registration: 'Cizinec' }), ctx).map((i) => i.level)).toEqual(['warn']);
  });

  it('requires H and a permit for players of another club', () => {
    const other = found({ clubId: '12402', clubName: 'TJ AERO Odolena Voda' });
    expect(playerIssues(player({}), other, ctx).map((i) => i.text)).toEqual(['člen oddílu TJ AERO Odolena Voda — chybí označení H']);
    expect(strikeReason(playerIssues(player({ flags: 'H' }), other, ctx))).toBe('chybí povolení hostování');
    expect(playerIssues(player({ flags: 'H', guest_permit: 1 }), other, ctx)).toEqual([]);
    expect(playerIssues(player({ flags: 'H', guest_permit: 1 }), found({}), ctx).map((i) => i.level)).toEqual(['warn']);
  });

  it('warns about name, birth year and FIDE differences', () => {
    const issues = playerIssues(player({ name: 'Jan Novak', birth_year: 1981, fide: 5 }), found({ fideId: 6 }), ctx);
    expect(issues.map((i) => i.text)).toEqual(['rok narození na chess.cz 1980', 'FIDE ID na chess.cz 6']);
  });

  it('reports duplicates and missing ids', () => {
    const issues = playerIssues(player({ lok: null }), { status: 'no_id', candidates: [] }, { ...ctx, sameCompetition: ['Kralupy C'], elsewhere: ['RPA · Kralupy D'] });
    expect(issues.map((i) => [i.level, i.text])).toEqual([
      ['bad', 'chybí č. LOK — na chess.cz nenalezen'],
      ['bad', 'také na soupisce Kralupy C'],
      ['warn', 'také na soupisce RPA · Kralupy D'],
    ]);
  });
});

describe('helpers', () => {
  it('compares names independent of order and diacritics', () => {
    expect(sameName('Pšenička Oldřich', 'Oldrich Psenicka ')).toBe(true);
    expect(sameName('Novák Jan', 'Nováková Jana')).toBe(false);
    expect(sameName('Skalický Petr ml.', 'Skalický Petr ')).toBe(true);
  });
  it('derives the fee year from the season', () => {
    expect(requiredFeeYear('2026/2027')).toBe(2026);
  });
});

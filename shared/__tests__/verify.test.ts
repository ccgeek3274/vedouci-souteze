import { describe, expect, it } from 'vitest';
import { expectedBase, lookupRoster, playerIssues, registryRows, sameName, strikeReason, type CheckPlayer, type CzCheck, type CzMember } from '../roster/verify';
import { sameCompetition, type HostingRow } from '../registry';

const member = (over: Partial<CzMember> & Record<string, unknown>) => ({
  fullName: 'Novák Jan ', birthYear: 1980, czeId: 100, fideId: 0, registration: 'Aktivní', feeYear: 2026,
  czeStdElo: 1700, fideStdElo: 0, ...over,
});
const player = (over: Partial<CheckPlayer & { base: number }>): CheckPlayer & { base?: number } => ({ name: 'Novák Jan', birth_year: 1980, lok: 100, fide: null, flags: '', guest_permit: 0, ...over });

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
  const ctx = { clubCode: '12003', compName: 'Regionální přebor B' };
  const found = (over: Partial<CzMember>, extra: Partial<CzCheck> = {}): CzCheck =>
    ({ status: 'found', member: { ...member({ clubId: '12003', clubName: 'TJ Jawa Brodce' }), ...over } as CzMember, ...extra });
  const permit = (over: Partial<HostingRow>): HostingRow => ({
    lok: 100, name: 'Novák Jan', clubName: 'TJ AERO Odolena Voda', club: '12402', hostClubName: 'TJ Jawa Brodce', hostClub: '12003',
    comp: "Regionální přebor 'B'", org: 'SŠS', season: '2026/2027', date: '2026-09-15', pending: '', ...over,
  });
  const other = { clubId: '12402', clubName: 'TJ AERO Odolena Voda' };

  it('is empty for a registered member of the team club', () => {
    expect(playerIssues(player({}), found({}), ctx)).toEqual([]);
  });

  it('strikes players without a valid registration and ignores the fee', () => {
    const issues = playerIssues(player({}), found({ registration: 'Neaktivní', feeYear: 2020 }), ctx);
    expect(strikeReason(issues)).toBe('bez platné registrace v ŠSČR (Neaktivní)');
  });

  it('checks C against the chess.cz profile', () => {
    expect(playerIssues(player({}), found({ registration: 'Cizinec' }), ctx).map((i) => i.text)).toEqual(['na chess.cz registrován jako cizinec — chybí označení C']);
    expect(playerIssues(player({ flags: 'C', guest_permit: 1 }), found({}), ctx).map((i) => i.text)).toEqual(['označen C, ale na chess.cz není registrován jako cizinec']);
  });

  it('checks H against the club and the hosting registry', () => {
    expect(playerIssues(player({}), found(other), ctx).map((i) => i.text)).toEqual(['člen oddílu TJ AERO Odolena Voda — chybí označení H']);
    expect(playerIssues(player({ flags: 'H' }), found({}), ctx).map((i) => i.text)).toEqual(['označen H, ale je členem oddílu družstva']);
    expect(playerIssues(player({ flags: 'H' }), found(other, { hosting: [permit({})] }), ctx)).toEqual([]);
    const missing = playerIssues(player({ flags: 'H' }), found(other, { hosting: [] }), ctx);
    expect(missing.map((i) => [i.level, i.text])).toEqual([['warn', 'chybí potvrzení hostování']]);
    expect(strikeReason(missing)).toBe('chybí potvrzení hostování');
    expect(playerIssues(player({ flags: 'H', guest_permit: 1 }), found(other, { hosting: [] }), ctx)).toEqual([]);
    expect(playerIssues(player({ flags: 'H' }), found(other, { hosting: [permit({ comp: "Krajská soutěž 'A'" })] }), ctx).map((i) => i.level)).toEqual(['warn']);
    expect(playerIssues(player({ flags: 'H' }), found(other, { hosting: [permit({ hostClub: '99999', hostClubName: 'Jiný' })] }), ctx)[0].text)
      .toBe("hostování potvrzeno jen pro Jiný (Regionální přebor 'B')");
    expect(playerIssues(player({ flags: 'H' }), found(other, { hosting: [permit({ lok: null, club: '', hostClub: '', pending: 'hostitelský oddíl' })] }), ctx)[0].text)
      .toMatch(/^hostování čeká na schválení/);
  });

  it('checks the foreigner registry', () => {
    const f = { lok: 100, fide: null, name: 'Novák Jan', federation: 'Slovakia', clubName: 'Dobrovice', club: '12302', comp: "Krajská soutěž 'A'", org: 'SŠS', season: '2026/2027', date: '', pending: '' };
    expect(playerIssues(player({ flags: 'C' }), found({ registration: 'Cizinec' }, { foreigner: [f] }), ctx).map((i) => i.text))
      .toEqual(["registrace cizince jen pro Dobrovice (Krajská soutěž 'A')"]);
    expect(playerIssues(player({ flags: 'C' }), found({ registration: 'Cizinec' }, { foreigner: [{ ...f, club: '12003', comp: 'Regionální přebor (bez určení skupiny)' }] }), ctx)).toEqual([]);
  });

  it('checks V against the starting line-ups of higher competitions', () => {
    const kp = { compId: 1, comp: 'Krajský přebor SŠS', team: 'Jawa Brodce A', z: true, h: false };
    expect(playerIssues(player({}), found({}, { higher: [kp], higherTeams: ['Jawa Brodce A'] }), ctx)[0].text).toMatch(/chybí označení V$/);
    expect(playerIssues(player({ flags: 'V' }), found({}, { higher: [kp], higherTeams: ['Jawa Brodce A'] }), ctx)).toEqual([]);
    expect(playerIssues(player({ flags: 'V' }), found({}, { higher: [{ ...kp, z: false }], higherTeams: ['Jawa Brodce A'] }), ctx).map((i) => [i.level, i.text]))
      .toEqual([['bad', 'označen V, ale není v základní sestavě vyšší soutěže']]);
    expect(playerIssues(player({ flags: 'V' }), found({}, { higher: [], higherTeams: [] }), ctx).map((i) => i.level)).toEqual(['warn']);
  });

  it('checks Z against the expected line-up', () => {
    expect(playerIssues(player({ base: 1, flags: 'H', guest_permit: 1 }), null, { ...ctx, expectedZ: 'optional' })).toEqual([]);
    expect(playerIssues(player({ base: 0, flags: 'H', guest_permit: 1 }), null, { ...ctx, expectedZ: 'optional' })).toEqual([]);
    expect(playerIssues(player({ base: 0 }), found({}), { ...ctx, expectedZ: true })[0].text).toBe('má být v základní sestavě (Z)');
    expect(playerIssues(player({ base: 1 }), null, { ...ctx, expectedZ: false })[0].text).toBe('nemá být v základní sestavě (Z)');
  });

  it('treats a name differing from the id as a deficiency', () => {
    expect(playerIssues(player({ name: 'Novák Josef' }), found({}), ctx).map((i) => [i.level, i.text])).toEqual([['bad', 'jméno nesouhlasí s ID — na chess.cz „Novák Jan“']]);
  });

  it('reports missing ids', () => {
    expect(playerIssues(player({ lok: null }), { status: 'no_id', candidates: [] }, ctx).map((i) => i.text)).toEqual(['chybí č. LOK — na chess.cz nenalezen']);
  });
});

describe('helpers', () => {
  it('compares names independent of order and diacritics', () => {
    expect(sameName('Pšenička Oldřich', 'Oldrich Psenicka ')).toBe(true);
    expect(sameName('Novák Jan', 'Nováková Jana')).toBe(false);
    expect(sameName('Skalický Petr ml.', 'Skalický Petr ')).toBe(true);
  });

  it('computes the starting line-up like sscr-soupiska recalcZaklad', () => {
    const f = (s: string) => s.split('').map((x) => ({ flags: x === '.' ? '' : x }));
    // 8 boards → max 3 letter players; further letter players are skipped (may be marked Z), the line-up extends
    expect(expectedBase(f('HH.VC...H..'), 8)).toEqual([true, true, true, true, 'optional', true, true, true, 'optional', true, false]);
    expect(expectedBase([{ flags: '' }, { flags: '', struck: 1 }, { flags: '' }], 2)).toEqual([true, null, true]);
  });

  it('matches competitions across naming variants', () => {
    expect(sameCompetition("Regionální přebor 'B'", 'Regionální přebor B')).toBe(true);
    expect(sameCompetition('Regionální přebor (bez určení skupiny)', "Regionální přebor 'B'")).toBe(true);
    expect(sameCompetition('Krajský přebor SŠS', 'Krajský přebor')).toBe(true);
    expect(sameCompetition("Regionální soutěž 'B'", "Regionální přebor 'B'")).toBe(false);
  });

  it('finds registry rows by LOK and pending hosting by name', () => {
    const rows = registryRows(player({}), {
      hosting: [{ lok: 100 } as HostingRow, { lok: 7 } as HostingRow, { lok: null, name: 'Jan Novák' } as HostingRow],
      foreigners: [],
    });
    expect(rows.hosting?.length).toBe(2);
  });
});

describe('parseZCell', () => {
  it('accepts yes in various forms and reports extra words', async () => {
    const { parseZCell } = await import('../roster/xlsx');
    expect(parseZCell('ano')).toEqual({ z: true, unusual: false });
    expect(parseZCell(' ANO ')).toEqual({ z: true, unusual: false });
    expect(parseZCell('')).toEqual({ z: false, unusual: false });
    expect(parseZCell('ano,ml.')).toEqual({ z: true, unusual: true });
    expect(parseZCell('Z')).toEqual({ z: true, unusual: false });
    expect(parseZCell('x')).toEqual({ z: true, unusual: true });
    expect(parseZCell('ne')).toEqual({ z: false, unusual: true });
    expect(parseZCell('st.')).toEqual({ z: false, unusual: true });
  });
});

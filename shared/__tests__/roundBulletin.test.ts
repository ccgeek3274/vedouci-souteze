import { describe, expect, it } from 'vitest';
import {
  buildRoundModel, defaultRozne, eloCell, fixGames, fmtHalf, fmtResult, headerText, mergeRound, noResultsText,
  normalizeRoundConfig, parseRoundSnapshot, pickRound, profileOf, refLine, scheduleRound, type CzGame, type CzMatch, type RoundInput,
} from '../bulletin/round';
import { matchCols, matchLayout, standingsLayout, sum } from '../bulletin/roundLayout';
import { deltaBlocks } from '../bulletin/rich';

// Ported from sscr-zpravodaj test/pure.test.js.

describe('formatting', () => {
  it('fmtHalf — whole, halves, zero half, invalid input', () => {
    expect([null, 0, 0.5, 1, 1.5, 2.5, '3', 'abc'].map(fmtHalf)).toEqual(['0', '0', '½', '1', '1½', '2½', '3', 'abc']);
  });
  it('fmtResult — forfeits with K, normal results', () => {
    expect(fmtResult(0, 1, 1)).toBe('0K : 1K');
    expect(fmtResult(1, 0, 1)).toBe('1K : 0K');
    expect(fmtResult(0, 0, 1)).toBe('0K : 0K');
    expect(fmtResult(0.5, 0.5, 0)).toBe('½ : ½');
    expect(fmtResult(1, 0)).toBe('1 : 0');
  });
  it('eloCell — empty board blank, unrated player 0', () => {
    expect([eloCell(null, null), eloCell('', null), eloCell('Novák Jan', null), eloCell('Novák Jan', 0), eloCell('Novák Jan', 1830)])
      .toEqual(['', '', '0', '0', '1830']);
  });
  it('refLine', () => {
    expect(refLine('')).toBe('Rozhodčí: ');
    expect(refLine(null)).toBe('Rozhodčí: ');
    expect(refLine('  Jan Novák ')).toBe('Rozhodčí: Jan Novák');
  });
});

describe('profiles', () => {
  const d = { kolo: 2, season: '2025/2026', compName: 'KP', regionName: 'JmKŠS' };
  it('Klasický = original look, unknown key → Klasický', () => {
    const k = profileOf('klasik');
    expect(k.hdr(d).r).toBe(headerText(d));
    expect(k.title(d)[0].text).toBe('Zpravodaj z kola č. 2');
    expect(k.chap(d).labels).toEqual(['1. Výsledky', '2. Pořadí družstev', '3. Různé a ostatní']);
    expect(profileOf('neexistuje')).toBe(k);
    expect(profileOf(null)).toBe(k);
  });
  it('Úřední and Moderní', () => {
    expect(profileOf('uredni').hdr(d).r).toBe('Ročník 2025/2026');
    expect(profileOf('uredni').hdr({ ...d, season: '' }).r).toBe('');
    expect(profileOf('uredni').chap(d).labels[0]).toBe('I. VÝSLEDKY 2. KOLA');
    const t = profileOf('uredni').title({ ...d, compName: 'Krajský přebor' });
    expect(t[0].text).toBe('Krajský přebor');
    expect(t[1].text).toBe('Zpravodaj z kola č. 2  ·  ročník 2025/2026');
    expect(profileOf('moderni').title(d)[0].text).toBe('2. kolo');
  });
  it('headerText leaves out missing parts', () => {
    expect(headerText({ kolo: 1, regionName: '', compName: 'Extraliga', season: '' })).toBe('Extraliga');
  });
});

describe('rounds', () => {
  it('pickRound — last round dated ≤ today, before the season null (úvodní)', () => {
    const rs = [{ nr: 2, date: '2025-11-09' }, { nr: 1, date: '2025-10-19' }, { nr: 3, date: '2025-11-23' }];
    expect(pickRound(rs, '2025-09-01')).toBeNull();
    expect(pickRound(rs, '2025-10-19')).toBe(1);
    expect(pickRound(rs, '2025-11-20')).toBe(2);
    expect(pickRound(rs, '2026-06-01')).toBe(3);
    expect(pickRound([], '2026-06-01')).toBeNull();
  });
  it('scheduleRound — pairs without score, missing round → null', () => {
    const json = [
      { roundNr: 1, roundDate: '31.10.2026', roundMatches: [{ homeTeamName: 'Stelar OAZA Praha', awayTeamName: '1. Novoborský ŠK' }] },
      { roundNr: 2, roundDate: '01.11.2026', roundMatches: { homeTeamName: 'A', awayTeamName: 'B' } }];
    const r1 = scheduleRound(json, 1)!;
    expect(r1.date).toBe('2026-10-31');
    expect(r1.matches[0]).toMatchObject({ homeTeamName: 'Stelar OAZA Praha', homeTeamScore: null, matchGames: [] });
    expect(scheduleRound(json, 2)!.matches).toHaveLength(1);
    expect(scheduleRound(json, 3)).toBeNull();
    expect(noResultsText(1, { date: r1.date })).toBe('Kolo 1 zatím nemá výsledky (hraje se so 31. 10. 2026) — náhled ukazuje jen dvojice zápasů podle rozpisu.');
  });
  it('noResultsText — partial round lists the missing matches', () => {
    expect(noResultsText(8, { partial: true, total: 5, missing: ['nezúčastní se – ŠK Loko Praha C'] }))
      .toBe('Výsledky jsou jen u 4 z 5 zápasů kola 8. Bez výsledku (zatím nezadaný, nebo nehraný): nezúčastní se – ŠK Loko Praha C.');
  });
});

describe('mergeRound', () => {
  const plan: CzMatch[] = [
    { homeTeamId: 1, awayTeamId: 2, homeTeamName: 'A', awayTeamName: 'B', homeTeamScore: null, awayTeamScore: null, matchGames: [] },
    { homeTeamId: 3, awayTeamId: 4, homeTeamName: 'C', awayTeamName: 'D', homeTeamScore: null, awayTeamScore: null, matchGames: [] },
    { homeTeamId: 5, awayTeamId: 6, homeTeamName: 'E', awayTeamName: 'F', homeTeamScore: null, awayTeamScore: null, matchGames: [] }];
  const res: CzMatch[] = [
    { homeTeamId: 5, awayTeamId: 6, homeTeamName: 'E', awayTeamName: 'F', homeTeamScore: 3, awayTeamScore: 1, matchGames: [{}] },
    { homeTeamId: 1, awayTeamId: 2, homeTeamName: 'A', awayTeamName: 'B', homeTeamScore: 2, awayTeamScore: 2, matchGames: [{}] }];

  it('schedule order, a missing match as a pair without score', () => {
    const m = mergeRound(res, plan);
    expect(m.matches.map((x) => `${x.homeTeamName}${x.homeTeamScore}`)).toEqual(['A2', 'Cnull', 'E3']);
    expect(m.missing).toEqual(['C – D']);
    expect(mergeRound([...res, { ...plan[1], homeTeamScore: 1, awayTeamScore: 3 }], plan).missing).toEqual([]);
    expect(mergeRound(res, null).matches).toHaveLength(2);
    expect(mergeRound([], plan).missing).toHaveLength(3);
  });
  it('unentered is reported, Volno / forfeit is not', () => {
    const noScore: CzMatch = { ...plan[1], matchGames: [{ homePlayerResult: null, awayPlayerResult: null }] };
    expect(mergeRound([...res, noScore], plan).missing).toEqual(['C – D']);
    const volno: CzMatch = { ...noScore, homeTeamName: 'Volno', matchGames: [{ homePlayerResult: 0, awayPlayerResult: 0, gameForfeited: 1 }] };
    expect(mergeRound([...res, volno], plan).missing).toEqual([]);
  });
  it('pairs by exact names without ids; a match outside the schedule is kept', () => {
    const byName = mergeRound(
      [{ homeTeamName: 'Č', awayTeamName: 'D', homeTeamScore: 1, awayTeamScore: 0 }, { homeTeamName: 'X', awayTeamName: 'Y', homeTeamScore: 1, awayTeamScore: 0 }],
      [{ homeTeamId: 3, awayTeamId: 4, homeTeamName: 'C', awayTeamName: 'D' }, { homeTeamId: 7, awayTeamId: 8, homeTeamName: 'Č', awayTeamName: 'D' }]);
    expect(byName.matches.map((x) => `${x.homeTeamName}${x.homeTeamScore}`)).toEqual(['Cundefined', 'Č1', 'X1']);
  });
});

describe('fixGames', () => {
  const g = (h: string | null, a: string | null, f = 0): CzGame => ({
    homePlayerName: h, awayPlayerName: a, homePlayerRating: h ? 1500 : null, awayPlayerRating: a ? 1500 : null, gameForfeited: f,
  });
  const names = (m: CzMatch) => (m.matchGames as CzGame[]).map((x) => `${x.homePlayerName}/${x.awayPlayerName}`);

  it('missing home player to the end, "-" for a missing player (3468/1)', () => {
    const m: CzMatch = { matchGames: [g(null, 'Rössler', 1), g('Burda', 'Pšenička'), g('Prokop', 'Križan')] };
    const out = fixGames(m);
    expect(names(out)).toEqual(['Burda/Pšenička', 'Prokop/Križan', '-/Rössler']);
    const last = (out.matchGames as CzGame[])[2];
    expect(eloCell(last.homePlayerName, last.homePlayerRating)).toBe('');
    expect((m.matchGames as CzGame[])[0].homePlayerName).toBeNull(); // input unchanged
    expect(names(fixGames({ matchGames: [g('A', 'B'), g('C', null, 1)] }))).toEqual(['A/B', 'C/-']);
    expect((fixGames({ matchGames: [g('A', null, 1), g('C', null, 1)] }).matchGames as CzGame[]).map((x) => x.awayPlayerName)).toEqual([null, null]);
  });
  it('with the away roster: order by both rosters', () => {
    const gg = (h: string | null, a: string | null, aid?: number): CzGame => ({ homePlayerName: h, awayPlayerName: a, awayPlayerId: aid, gameForfeited: h && a ? 0 : 1 });
    const roster = [1, 2, 3, 4, 5].map((p) => ({ rosterPosition: p, playerId: 100 + p }));
    expect(names(fixGames({ matchGames: [gg(null, 'B2', 102), gg('A1', 'B1', 101), gg('A3', 'B3', 103)] }, roster))).toEqual(['A1/B1', '-/B2', 'A3/B3']);
    expect(names(fixGames({ matchGames: [gg(null, 'B4', 104), gg('A1', 'B1', 101), gg('A2', 'B2', 102), gg('A3', null)] }, roster)))
      .toEqual(['A1/B1', 'A2/B2', 'A3/-', '-/B4']);
    expect(names(fixGames({ matchGames: [gg(null, 'B5', 105), gg(null, 'B4', 104), gg('A1', 'B1', 101)] }, roster))).toEqual(['A1/B1', '-/B4', '-/B5']);
    expect(names(fixGames({ matchGames: [gg(null, 'B2', 102), gg('A1', 'B1', 101)] }))).toEqual(['A1/B1', '-/B2']);
  });
});

describe('layout', () => {
  const game = (h: string, a: string) => ({ home: h, homeElo: '1800', result: '1 : 0', awayElo: '2100', away: a });
  const match = (games: ReturnType<typeof game>[], home = 'A', away = 'B', nr = '1.1') =>
    ({ nr, home, away, score: '2½ – 1½', games, key: home, ref: '', assigned: '' });

  it('matchLayout — bounds, monotonic, default widths at 10 pt', () => {
    expect(matchLayout([], 10)).toEqual({ board: 460, name: 1200, elo: 640, result: 1120, fits: true });
    const short = matchLayout([match([game('Jan', 'Eva')])], 10).name;
    const long = matchLayout([match([game('Bartoloměj Nejdelší-Příjmení', 'Eva')])], 10).name;
    expect(long).toBeGreaterThanOrEqual(short);
    const big = matchLayout([match([game('Z'.repeat(200), '')], 'X'.repeat(200))], 10);
    expect(big.fits).toBe(false);
    expect(sum(matchCols(big))).toBeLessThanOrEqual(10204);
  });
  it('matchLayout — larger font = wider columns, match number "11.6" fits', () => {
    const ms = [1, 2, 3, 4, 5, 6].map((i) => match([game('Procházka, Jiří', 'Kučera, Martin')], 'ŠK Lokomotiva Brno B', 'TJ Bohunice', `11.${i}`));
    const l10 = matchLayout(ms, 10), l12 = matchLayout(ms, 12);
    expect(l12.name).toBeGreaterThan(l10.name);
    expect(l10.board).toBeGreaterThan(460);
    expect(l12.fits).toBe(true);
    expect(sum(matchCols(l12))).toBeLessThanOrEqual(10204);
  });
  it('standingsLayout — sum = content width, Družstvo takes the rest', () => {
    expect(standingsLayout([], 10).cols).toEqual([480, 5704, 520, 520, 520, 520, 620, 700, 620]);
    const rows = [['12', 'ŠK Lokomotiva Brno B', '11', '10', '1', '0', '31', '62½', '120']];
    for (const f of [9, 10, 11, 12]) {
      const w = standingsLayout(rows, f).cols;
      expect(sum(w)).toBe(10204);
      expect(w[1]).toBeGreaterThan(3000);
    }
    expect(standingsLayout([['1', 'X'.repeat(200)]], 10).fits).toBe(false);
  });
});

describe('model', () => {
  const input = (extra: Partial<RoundInput> = {}): RoundInput => ({
    kolo: 2, compName: 'Regionální přebor B', regionName: 'SŠS', season: '2026/2027', short: 'RPB', manager: 'Karel Jukl',
    results: [{ homeTeamId: 11, awayTeamId: 12, homeTeamName: 'A', awayTeamName: 'B', homeTeamScore: 3, awayTeamScore: 1,
      matchGames: [{ homePlayerName: 'Novák', awayPlayerName: 'Dvořák', homePlayerRating: 1700, awayPlayerRating: null, homePlayerResult: 1, awayPlayerResult: 0 }] }],
    planned: { date: '2026-11-08', matches: [
      { homeTeamId: 11, awayTeamId: 12, homeTeamName: 'A', awayTeamName: 'B' }, { homeTeamId: 13, awayTeamId: 14, homeTeamName: 'C', awayTeamName: 'D' }] },
    rosters: {}, table: [{ teamRank: 1, teamName: 'A', points: 3, score: 3 }],
    keyOfCz: new Map([[11, 'a'], [13, 'c']]), assigned: { '2:a': 'Rozhodčí A', '1:c': 'Jiné kolo' },
    standingsLater: false, ...extra,
  });

  it('matches, referees from the assignment, edits from the overrides', () => {
    const m = buildRoundModel(input(), normalizeRoundConfig(null), { refs: { c: 'Ručně' } });
    expect(m.matches.map((x) => [x.nr, x.score, x.ref, x.assigned])).toEqual([['2.1', '3 – 1', 'Rozhodčí A', 'Rozhodčí A'], ['2.2', '', 'Ručně', '']]);
    expect(m.matches[0].games[0]).toEqual({ home: 'Novák', homeElo: '1700', result: '1 : 0', awayElo: '0', away: 'Dvořák' });
    expect(m.noResults).toMatch(/^Výsledky jsou jen u 1 z 2 zápasů kola 2/);
    expect(m.standings[0]).toEqual(['1', 'A', '0', '0', '0', '0', '3', '3', '0']);
    expect(m.fileName).toBe('rpb_26_27_02');
    expect(m.matches.map((x) => [x.key, x.awayKey])).toEqual([['a', 'n:B'], ['c', 'n:D']]);
  });
  it('standings from a save point replace the live table (no "later round" warning)', () => {
    const m = buildRoundModel(input({ standingsLater: true }), normalizeRoundConfig(null), { standings: [{ teamRank: 1, teamName: 'B', points: 2 }] });
    expect(m.standings.map((r) => r[1])).toEqual(['B']);
    expect(m.warnings.some((w) => w.startsWith('Pořadí družstev'))).toBe(false);
  });
  it('parseRoundSnapshot — only a valid snapshot', () => {
    expect(parseRoundSnapshot({ fontPt: 10, snapshot: { standings: [{ a: 1 }], refs: { a: 'X', b: 2 } } })).toEqual({ standings: [{ a: 1 }], refs: { a: 'X' } });
    expect(parseRoundSnapshot({ fontPt: 10 })).toBeNull();
    expect(parseRoundSnapshot({ snapshot: { refs: {} } })).toBeNull();
  });
  it('Různé — default text follows the manager and the date until edited', () => {
    const m = buildRoundModel(input(), normalizeRoundConfig({ date: '2026-11-10' }));
    expect(m.rozne.custom).toBe(false);
    expect(deltaBlocks(m.rozne.ops).map((b) => b.runs.map((r) => (r.b ? `*${r.text}` : r.text)).join(''))).toEqual([
      'Prosím o kontrolu hráčů i výsledků, zda jsem někde neudělal chybu.', '*Karel Jukl', '10. 11. 2026']);
    expect(defaultRozne('', '1. 1. 2027')).toHaveLength(2);
    const own = [{ insert: 'Vlastní\n' }];
    expect(buildRoundModel(input(), normalizeRoundConfig({ rozne: own })).rozne).toMatchObject({ custom: true, ops: own });
  });
  it('round without results and standings after a later round are reported', () => {
    const m = buildRoundModel(input({ results: [], standingsLater: true }), normalizeRoundConfig(null));
    expect(m.noResults).toBe('Kolo 2 zatím nemá výsledky (hraje se ne 8. 11. 2026) — náhled ukazuje jen dvojice zápasů podle rozpisu.');
    expect(m.matches).toHaveLength(2);
    expect(m.warnings.some((w) => w.startsWith('Pořadí družstev'))).toBe(true);
  });
  it('normalizeRoundConfig — defaults from prefs, broken fields ignored', () => {
    expect(normalizeRoundConfig({ profile: 'x', fontPt: 13, refs: { b: 'B' }, snapshot: { standings: [] } }, { profile: 'moderni', fontPt: 11 }))
      .toEqual({ date: null, withRef: true, profile: 'moderni', fontPt: 11, rozne: null });
  });
});

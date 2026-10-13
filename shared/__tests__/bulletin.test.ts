import { describe, expect, it } from 'vitest';
import {
  buildModel, defaultConfig, normalizeConfig, rosterDisplay, rotatedReferees, calendarMonths, type BPlayer, type BulletinData,
} from '../bulletin/initial';
import { deltaBlocks, textDelta } from '../bulletin/rich';
import { czDateIso, czRoster, czStartNumbers, parseCzSchedule, splitFlags } from '../bulletin/source';

const player = (pos: number, name: string, extra: Partial<BPlayer> = {}): BPlayer =>
  ({ pos, name, nrtg: 1500, irtg: 0, z: pos <= 2, letter: '', cap: '', birthYear: null, struck: false, ...extra });

function data(): BulletinData {
  const team = (key: string, stc: number, refs: string[], startHome: string | null = null) => ({
    key, stc, name: `Tým ${key}`, venue: `Místnost ${key}`, startHome, startAway: null,
    contacts: [{ role: 'kapitan' as const, name: `Kapitán ${key}`, phone: '', email: '' }, ...refs.map((r) => ({ role: 'rozhodci' as const, name: r, phone: '', email: '' }))],
  });
  return {
    compName: 'Regionální přebor B', short: 'RPB', region: 'SŠS', season: '2026/2027', chessczId: 3468, www: null,
    defaultStart: '09:00', timeControl: '', manager: { name: 'Jukl Karel', email: 'k@x.cz', phone: '1' },
    teams: [team('a', 1, ['R1', 'R2'], '10:00'), team('b', 2, ['S1']), team('c', 3, []), team('d', 4, ['T1'])],
    rosters: { a: [player(1, 'Novák Jan'), player(2, 'Struck Petr', { struck: true })], b: [player(1, 'X')], c: null, d: [player(1, 'Y')] },
    rounds: [
      { nr: 1, date: '2026-10-18', matches: [{ home: 'a', away: 'd' }, { home: 'b', away: 'c' }] },
      { nr: 2, date: '2026-11-08', matches: [{ home: 'a', away: 'c' }, { home: 'd', away: 'b' }] },
      { nr: 3, date: '2026-11-22', matches: [{ home: 'a', away: 'b' }, { home: 'c', away: 'd' }] },
    ],
    deficiencies: [{ team: 'Tým a', lines: ['Struck Petr: bude vyškrtnut'] }],
    sameClub: [['a', 'b']],
    warnings: [],
  };
}

describe('rich text', () => {
  it('delta → blocks with lists and links, trailing empty lines dropped', () => {
    const b = deltaBlocks([{ insert: 'Ahoj ' }, { insert: 'světe', attributes: { bold: true, link: 'https://x' } }, { insert: '\nbod' }, { insert: '\n', attributes: { list: 'bullet' } }, { insert: '\n\n' }]);
    expect(b).toEqual([
      { list: null, runs: [{ text: 'Ahoj ' }, { text: 'světe', b: true, link: 'https://x' }] },
      { list: 'bullet', runs: [{ text: 'bod' }] },
    ]);
  });
  it('default text paragraphs round-trip', () => {
    expect(deltaBlocks(textDelta(['A', '• B'])).map((x) => [x.list, x.runs[0].text])).toEqual([[null, 'A'], ['bullet', 'B']]);
  });
});

describe('config', () => {
  it('normalizes stored JSON', () => {
    expect(normalizeConfig(null)).toEqual(defaultConfig());
    const c = normalizeConfig({ kind: 'definitive', date: '2026-10-06', refs: { '1:a': 'X', bad: 3 }, texts: { intro: [{ insert: 'x\n' }], nope: [] }, withRef: false });
    expect(c.kind).toBe('definitive');
    expect(c.refs).toEqual({ '1:a': 'X' });
    expect(Object.keys(c.texts)).toEqual(['intro']);
    expect(c.withRef).toBe(false);
  });
});

describe('model', () => {
  it('rotates the home referees per team', () => {
    const r = rotatedReferees(data());
    expect([r.get('1:a'), r.get('2:a'), r.get('3:a')]).toEqual(['R1', 'R2', 'R1']);
    expect(r.get('1:b')).toBe('S1');
    expect(r.has('3:c')).toBe(false);
  });

  it('st./ml. by birth year', () => {
    const rows = rosterDisplay([player(1, 'Meca Viktor', { birthYear: 1960 }), player(2, 'Meca Viktor', { birthYear: 1990 })]);
    expect(rows.map((r) => r.display)).toEqual(['Meca Viktor st.', 'Meca Viktor ml.']);
  });

  it('preliminary: deficiencies chapter, all players, exceptions in red, last round without exceptions', () => {
    const m = buildModel(data(), { ...defaultConfig(), refs: { '2:a': 'Jiný Rozhodčí' } });
    const titles = m.chapters.map((c) => c.title);
    expect(titles).toContain('Nedostatky soupisek');
    const rosters = m.chapters.find((c) => c.title === 'Soupisky družstev')!.sections[0] as any;
    expect(rosters.teams[0].players).toHaveLength(2);
    const rounds = (m.chapters.find((c) => c.title === 'Rozlosování soutěže')!.sections[0] as any).rounds;
    expect(rounds[0].header).toBe('Kolo 1 dne 18.10.2026 v 9:00 hodin, pokud není uvedeno jinak');
    expect(rounds[0].rows[0].time).toBe('10:00');
    expect(rounds[1].rows[0].ref).toBe('Jiný Rozhodčí');
    expect(rounds[2].header).toBe('Kolo 3 dne 22.11.2026 v 9:00 hodin (poslední kolo, všechna utkání musí začínat v 9:00)');
    expect(rounds[2].rows[0].time).toBe('');
    expect(m.warnings.some((w) => w.includes('posledním kole'))).toBe(true);
    expect(m.warnings).toContain('Tým c: chybí soupiska');
    expect(m.warnings.some((w) => w.includes('bez rozhodčího: Tým c'))).toBe(true);
    expect(m.subtitles[1]).toBe('Předběžný úvodní zpravodaj – ročník 2026/2027');
    expect(m.fileName).toBe('rpb_26_27_uz_predbezny');
    const ann = m.chapters.find((c) => c.title === 'Další oznámení')!.sections[0] as any;
    expect(ann.blocks[0].runs[0].text).toContain('Tým a a Tým b spolu sehrají vzájemný zápas v 3. kole');
  });

  it('definitive: struck players left out, no deficiencies chapter, custom text kept', () => {
    const m = buildModel(data(), { ...defaultConfig(), kind: 'definitive', calendar: false, texts: { referees: textDelta(['Vlastní text']) } });
    expect(m.chapters.map((c) => c.title)).not.toContain('Nedostatky soupisek');
    expect(m.chapters.map((c) => c.title)).not.toContain('Kalendář soutěže');
    const rosters = m.chapters.find((c) => c.title === 'Soupisky družstev')!.sections[0] as any;
    expect(rosters.teams[0].players.map((p: any) => p.name)).toEqual(['Novák Jan']);
    const refs = m.chapters.find((c) => c.title === 'Rozhodčí')!.sections[0] as any;
    expect(refs.custom).toBe(true);
    expect(refs.blocks[0].runs[0].text).toBe('Vlastní text');
    expect(m.fileName).toBe('rpb_26_27_uz');
  });

  it('calendar months between the first and the last round', () => {
    const months = calendarMonths(data().rounds);
    expect(months.map((m) => m.name)).toEqual(['Říjen 2026', 'Listopad 2026']);
    const oct18 = months[0].weeks.flat().find((d) => d?.d === 18);
    expect(oct18?.rounds).toEqual([1]);
    expect(months[0].weeks[0][3]?.d).toBe(1); // 1. 10. 2026 is a Thursday
  });
});

describe('chess.cz source', () => {
  it('dates, flags and roster', () => {
    expect(czDateIso('08.11.2026')).toBe('2026-11-08');
    expect(splitFlags(' H K Z')).toEqual({ z: true, letter: 'H', cap: 'K' });
    expect(splitFlags('ZK V')).toEqual({ z: false, letter: 'V', cap: 'ZK' });
    const r = czRoster([{ rosterPosition: 2, playerId: 5, playerName: 'B ', playerCzeElo: 1500, playerFideElo: null, playerFlags: ' Z' }, { rosterPosition: 1, playerId: 7, playerName: 'A', playerFlags: '' }],
      [{ lok: 5, name: 'B', birth_year: 1980, struck: 1 }]);
    expect(r.map((p) => [p.pos, p.name, p.z, p.birthYear, p.struck])).toEqual([[1, 'A', false, null, false], [2, 'B', true, 1980, true]]);
  });

  it('start numbers verified by round 1 of the Berger table', () => {
    const teams = [10, 11, 12, 13].map((id, i) => ({ id, name: `T${id}`, rank: 4 - i }));
    const rounds = parseCzSchedule([{ roundNr: 1, roundDate: '1.1.2027', roundMatches: [{ homeTeamId: 10, awayTeamId: 13 }, { homeTeamId: 11, awayTeamId: 12 }] }]);
    expect(czStartNumbers(teams, rounds).source).toBe('teamId');
    const bad = parseCzSchedule([{ roundNr: 1, roundMatches: [{ homeTeamId: 10, awayTeamId: 11 }, { homeTeamId: 12, awayTeamId: 13 }] }]);
    expect(czStartNumbers(teams, bad, new Map([[10, 1], [11, 4], [12, 2], [13, 3]])).source).toBe('aplikace');
    expect(czStartNumbers(teams, bad).source).toBe(null);
  });
});

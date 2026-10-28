import { describe, it, expect } from 'vitest';
import sample from './fixtures/sm-turnaj.json';
import { buildSmExport, samePerson, smCaptainText, smExportFileName, smInfoAuto, smLetters, type SmSourcePlayer, type SmSourceTeam } from '../export/swissManager';

const player = (name: string, lok: number | null, flags = '', base = 1, extra: Partial<SmSourcePlayer> = {}): SmSourcePlayer =>
  ({ name, birth_year: null, lok, fide: null, flags, base, struck: 0, cz: null, ...extra });

const team = (name: string, draw_no: number | null, position: number, players: SmSourcePlayer[] | null, extra: Partial<SmSourceTeam> = {}): SmSourceTeam => ({
  name, short_name: name.replace(/^Sokol /, ''), club_code: '12003', draw_no, position, venue: 'Sokolovna, Příčná 12',
  contacts: [
    { role: 'kapitan', position: 1, name: players?.[0]?.name ?? '', phone: '725 746 358', email: 'k@example.cz' },
    { role: 'zastupce', position: 1, name: players?.[1]?.name ?? '', phone: '602 123 971', email: 'z@example.cz' },
  ],
  roster: players ? { version: 3, players } : null,
  ...extra,
});

const full = (prefix: string, lok0: number) => [
  player(`${prefix} Kapitán`, lok0, 'K'),
  player(`${prefix} Zástupce`, lok0 + 1, 'ZK'),
  player(`${prefix} Host`, lok0 + 2, 'H', 0),
];

const comp = { id: 'c1', name: 'Regionální přebor B', season: '2026/2027', boards: 2 };
const savedAt = '2026-10-24T10:00:00.000Z';

describe('Swiss-Manager export', () => {
  it('letters in canonical order: Z, H/V/C, K/ZK', () => {
    expect(smLetters({ flags: 'ZK H', base: 1 })).toEqual(['Z', 'H', 'ZK']);
    expect(smLetters({ flags: 'K', base: 0 })).toEqual(['K']);
    expect(smLetters({ flags: '', base: 0 })).toEqual([]);
  });

  it('builds the file in the format of swiss-manager-automat', () => {
    const { file, issues } = buildSmExport({ competition: comp, savedAt, teams: [team('Sokol Vzorov A', 1, 1, full('A', 100))] });
    expect(issues).toEqual([{ level: 'info', team: 'Sokol Vzorov A', text: expect.stringMatching(/Neověřeno.*3 hráčů/) }]);
    expect(file).toEqual({
      app: 'vedouci-souteze', version: 1, savedAt,
      turnaj: { id: 'c1', nazev: 'Regionální přebor B 2026/2027', zaklad: 2 },
      druzstva: [{
        nazev: 'Sokol Vzorov A', zkratka: 'Vzorov A', los: 1, cislo_klubu: '12003', soupiska_verze: 3,
        extra: {
          kapJmeno: 'A Kapitán', kapTel: '', kapEmail: '', zastJmeno: '', zastTel: '', zastEmail: '',
          hraciMistnost: 'Sokolovna, Příčná 12',
        },
        hraci: [
          { poradi: 1, lok: 100, jmeno: 'A Kapitán', pismenka: ['Z', 'K'] },
          { poradi: 2, lok: 101, jmeno: 'A Zástupce', pismenka: ['Z', 'ZK'] },
          { poradi: 3, lok: 102, jmeno: 'A Host', pismenka: ['H'] },
        ],
      }],
    });
    expect(Object.keys(file.druzstva[0])).toEqual(['nazev', 'zkratka', 'los', 'cislo_klubu', 'soupiska_verze', 'extra', 'hraci']);
  });

  it('matches the sample of swiss-manager-automat (priklady/turnaj.json) apart from our extra keys and the options', () => {
    const src = sample.druzstva[0];
    const t: SmSourceTeam = {
      name: src.nazev, club_code: src.cislo_klubu, draw_no: null, position: 1, venue: src.extra.hraciMistnost,
      contacts: [
        { role: 'kapitan', name: src.extra.kapJmeno, phone: src.extra.kapTel, email: src.extra.kapEmail },
        { role: 'zastupce', name: src.extra.zastJmeno, phone: src.extra.zastTel, email: src.extra.zastEmail },
      ],
      roster: {
        version: 1,
        players: src.hraci.map((h) => {
          const letters: string[] = h.pismenka;
          return player(h.jmeno, h.lok, letters.filter((x) => x !== 'Z').join(' '), letters.includes('Z') ? 1 : 0);
        }),
      },
    };
    const build = (options: Parameters<typeof buildSmExport>[0]['options']) => {
      const { file } = buildSmExport({ competition: { id: 'x', name: sample.turnaj.nazev, season: '', boards: sample.turnaj.zaklad }, savedAt: sample.savedAt, teams: [t], options });
      const { id, ...turnaj } = file.turnaj;
      const { soupiska_verze, ...team } = file.druzstva[0];
      return { ...file, turnaj, druzstva: [team] };
    };
    // Default options: captain's name only.
    expect(build(undefined)).toEqual({ ...sample, druzstva: [{ ...src, extra: { ...src.extra, kapTel: '', kapEmail: '', zastJmeno: '', zastTel: '', zastEmail: '' } }] });
    // Everything: the extra fields as in the sample, the SM cell holds both people with contacts.
    expect(build({ captain: true, deputy: true, contacts: true })).toEqual({ ...sample, druzstva: [{ ...src, extra: { ...src.extra,
      kapJmeno: `${src.extra.kapJmeno}, ${src.extra.kapTel}, ${src.extra.kapEmail}; zást. ${src.extra.zastJmeno}, ${src.extra.zastTel}, ${src.extra.zastEmail}` } }] });
  });

  it('orders teams by draw number, teams without one last', () => {
    const { file, issues } = buildSmExport({
      competition: comp, savedAt,
      teams: [team('A', 2, 1, full('A', 100)), team('B', null, 2, full('B', 200)), team('C', 1, 3, full('C', 300))],
    });
    expect(file.druzstva.map((t) => [t.nazev, t.los])).toEqual([['C', 1], ['A', 2], ['B', undefined]]);
    expect(issues.some((i) => i.level === 'warn' && /Bez losovacího čísla.*B/.test(i.text))).toBe(true);
  });

  it('flags duplicate draw numbers and duplicate player ids', () => {
    const { issues } = buildSmExport({ competition: comp, savedAt, teams: [team('A', 1, 1, full('A', 100)), team('B', 1, 2, full('A', 100))] });
    expect(issues.filter((i) => i.level === 'error').map((i) => i.text)).toEqual([
      'Losovací číslo 1 má víc družstev: A, B.',
      expect.stringMatching(/stejné ID je už na soupisce A/),
      expect.stringMatching(/stejné ID/),
      expect.stringMatching(/stejné ID/),
    ]);
  });

  it('skips struck players and renumbers, uses chess.cz data for missing ids and control values', () => {
    const cz = { status: 'found' as const, member: { fullName: 'X', birthYear: 1975, czeId: 10792, fideId: 345296, clubId: '', clubName: '', registration: '', feeYear: null, czeStdElo: 1714, fideStdElo: 1861 } };
    const players = [
      player('Vyškrtnutý', 50, '', 1, { struck: 1 }),
      ...full('A', 100),
      player('Jukl Karel', null, '', 0, { cz }),
    ];
    const { file, issues } = buildSmExport({ competition: comp, savedAt, teams: [team('A', 1, 1, players)] });
    const hraci = file.druzstva[0].hraci;
    expect(hraci.map((h) => h.poradi)).toEqual([1, 2, 3, 4]);
    expect(hraci[0].jmeno).toBe('A Kapitán');
    expect(Object.keys(hraci[3])).toEqual(['poradi', 'lok', 'fide', 'jmeno', 'pismenka', 'elo_cr', 'elo_fide', 'rok']);
    expect(hraci[3]).toEqual({ poradi: 4, lok: 10792, fide: 345296, jmeno: 'Jukl Karel', pismenka: [], elo_cr: 1714, elo_fide: 1861, rok: 1975 });
    expect(issues.some((i) => /vyškrtnutých hráčů: 1/.test(i.text))).toBe(true);
  });

  it('reports what Automat will complain about', () => {
    const players = [player('Bez ID', null, 'K'), player('Druhý', 2, '', 0)];
    const t = team('A', 1, 1, players, { club_code: null, venue: 'x'.repeat(80) });
    t.contacts[0].name = 'Někdo Jiný';
    const { issues } = buildSmExport({ competition: comp, savedAt, teams: [t, team('Bez soupisky', 2, 2, null)] });
    const texts = issues.map((i) => `${i.level} ${i.team}: ${i.text}`);
    expect(texts).toEqual(expect.arrayContaining([
      expect.stringMatching(/^error A: 1\. Bez ID: chybí LOK i FIDE ID/),
      expect.stringMatching(/^warn A: Chybí číslo klubu/),
      expect.stringMatching(/^info A: Info \(hrací místnost a začátek\) má 80 znaků/),
      expect.stringMatching(/^warn A: Základ má 1 hráčů/),
      expect.stringMatching(/^warn A: Na soupisce není zástupce kapitána/),
      expect.stringMatching(/^info A: K na soupisce je Bez ID, v kontaktech Někdo Jiný/),
      expect.stringMatching(/^warn Bez soupisky: Nemá soupisku/),
    ]));
  });

  it('Info: venue + nonstandard home start, truncated to 70 chars unless edited', () => {
    expect(smInfoAuto({ venue: 'Sokolovna', start_home: '10:00', start_home_skip: '3,7' }, '09:00')).toBe('Sokolovna (začátek 10:00, neplatí v 3. a 7. kole)');
    expect(smInfoAuto({ venue: 'Sokolovna', start_home: '09:00' }, '9:00')).toBe('Sokolovna');
    expect(smInfoAuto({ venue: '', start_home: '10:00' }, '09:00')).toBe('začátek 10:00');
    const long = team('A', 1, 1, full('A', 100), { venue: 'x'.repeat(80) });
    const edited = team('B', 2, 2, full('B', 200), { venue: 'x'.repeat(80), sm_info: 'Moje info' });
    const { file, teams } = buildSmExport({ competition: comp, savedAt, teams: [long, edited] });
    expect(file.druzstva.map((d) => d.extra.hraciMistnost)).toEqual(['x'.repeat(70), 'Moje info']);
    expect(teams.map((v) => [v.infoAuto.length, v.infoSaved])).toEqual([[80, null], [80, 'Moje info']]);
  });

  it('captain cell by the options', () => {
    const kap = { role: 'kapitan', name: 'Novák Jan', phone: '602 111 222', email: 'jan@example.cz' };
    const zast = { role: 'zastupce', name: 'Dvořák Petr', phone: '', email: 'petr@example.cz' };
    expect(smCaptainText(kap, zast, { captain: true, deputy: false, contacts: false })).toBe('Novák Jan');
    expect(smCaptainText(kap, zast, { captain: true, deputy: true, contacts: false })).toBe('Novák Jan; zást. Dvořák Petr');
    expect(smCaptainText(kap, zast, { captain: false, deputy: true, contacts: true })).toBe('zást. Dvořák Petr, petr@example.cz');
    expect(smCaptainText(undefined, zast, { captain: true, deputy: false, contacts: true })).toBe('');
  });

  it('warns about missing and duplicate short names', () => {
    const { issues } = buildSmExport({ competition: comp, savedAt, teams: [
      team('A', 1, 1, full('A', 100), { short_name: 'Vzorov' }), team('B', 2, 2, full('B', 200), { short_name: 'vzorov' }),
      team('C', 3, 3, full('C', 300), { short_name: null }),
    ] });
    expect(issues.map((i) => i.text)).toEqual(expect.arrayContaining(['Stejný zkrácený název mají: A, B.', expect.stringMatching(/^Chybí zkrácený název/)]));
  });

  it('captain names match regardless of word order and suffixes', () => {
    expect(samePerson('Roman Šoltys', 'Šoltys Roman')).toBe(true);
    expect(samePerson('Meca Viktor, st.', 'Meca Viktor')).toBe(true);
    expect(samePerson('Novák Petr', 'Novák Jan')).toBe(false);
    expect(samePerson('', 'Novák Jan')).toBe(false);
  });

  it('file name', () => {
    expect(smExportFileName('RPB', '2026/2027')).toBe('RPB_2026-2027_swiss-manager.json');
  });
});

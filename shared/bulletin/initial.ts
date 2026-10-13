// Úvodní zpravodaj (M8): config of the draft, input data (chess.cz + app) and the document model shared by
// the HTML preview, DOCX and PDF renderers. Layout and wording follow uvodni-zpravodaj and the real
// RPB 2026/27 bulletin (doc/soupisky/rpb_26_27_uz_v3.docx).
import { matchStart, roundsText, shortTime, type StartTeam } from '../startTime';
import { deltaBlocks, textDelta, type DeltaOp, type RichBlock } from './rich';

export const TEXT_KEYS = ['intro', 'requirements', 'referees', 'announcements', 'results'] as const;
export type TextKey = (typeof TEXT_KEYS)[number];

/** What the vedoucí sets on the draft (stored; save points copy it). Everything else is generated. */
export type InitialConfig = {
  kind: 'preliminary' | 'definitive';
  date: string | null; // ISO date of issue; null = today
  texts: Partial<Record<TextKey, DeltaOp[]>>; // missing = the default text (follows the data)
  refs: Record<string, string>; // refKey → referee, overrides the rotation ('' = none)
  withRef: boolean;
  calendar: boolean;
  lastNote: string | null; // note of the last round header; null = default
  appData: { schedule: boolean; rosters: boolean }; // app data confirmed where chess.cz has none yet
};

export function defaultConfig(): InitialConfig {
  return { kind: 'preliminary', date: null, texts: {}, refs: {}, withRef: true, calendar: true, lastNote: null, appData: { schedule: false, rosters: false } };
}

/** Stored JSON → config (unknown / broken fields fall back to defaults). */
export function normalizeConfig(raw: unknown): InitialConfig {
  const d = defaultConfig();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const texts: InitialConfig['texts'] = {};
  for (const k of TEXT_KEYS) if (Array.isArray(r.texts?.[k])) texts[k] = r.texts[k];
  const refs: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.refs ?? {})) if (typeof v === 'string') refs[k] = v;
  return {
    kind: r.kind === 'definitive' ? 'definitive' : 'preliminary',
    date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
    texts,
    refs,
    withRef: typeof r.withRef === 'boolean' ? r.withRef : d.withRef,
    calendar: typeof r.calendar === 'boolean' ? r.calendar : d.calendar,
    lastNote: typeof r.lastNote === 'string' ? r.lastNote : null,
    appData: { schedule: !!r.appData?.schedule, rosters: !!r.appData?.rosters },
  };
}

// ── Input data ────────────────────────────────────────────────────────────────────────────────────

export type BContact = { role: 'kapitan' | 'zastupce' | 'komunikace' | 'rozhodci'; name: string; phone: string; email: string };
export type BTeam = {
  key: string; // app team id (or `cz:<chess.cz team id>` when not paired)
  stc: number | null; // start (draw) number
  name: string;
  venue: string;
  contacts: BContact[];
  startHome: string | null;
  startAway: string | null;
  startHomeSkip?: string; // rounds where the exception does not apply ("3,7")
  startAwaySkip?: string;
};
export type BPlayer = {
  pos: number; name: string; nrtg: number; irtg: number; z: boolean; letter: string; cap: string;
  birthYear: number | null; struck: boolean;
};
export type BRound = { nr: number; date: string; matches: { home: string; away: string }[] };
export type BulletinData = {
  compName: string; short: string; region: string; season: string;
  chessczId: number | null; www: string | null;
  defaultStart: string; timeControl: string;
  lastStart?: string; // alternative start of the last round ('' = default start)
  manager: { name: string; email: string; phone: string };
  teams: BTeam[]; // in start-number order
  rosters: Record<string, BPlayer[] | null>; // by team key; null = no roster
  rounds: BRound[];
  deficiencies: { team: string; lines: string[] }[]; // preliminary bulletin: roster check findings
  sameClub: [string, string][]; // team keys of same-club pairs
  warnings: string[];
};

// ── Model ─────────────────────────────────────────────────────────────────────────────────────────

export const CONFLICT = '???';

export type RosterRow = BPlayer & { display: string };
export type RoundRow = {
  board: number; homeStc: number | null; homeName: string; time: string; // '' = default start
  awayStc: number | null; awayName: string; ref: string; refKey: string; refOptions: string[];
};
export type RoundView = { nr: number; header: string; rows: RoundRow[] };
export type CalDay = { d: number; rounds: number[] } | null;
export type CalMonth = { name: string; weeks: CalDay[][] };
export type ContactRow = { label: string; name: string; phone: string; email: string };

export type Section =
  | { type: 'rich'; key: TextKey; blocks: RichBlock[]; ops: DeltaOp[]; custom: boolean; defaults: DeltaOp[] }
  | { type: 'lines'; lines: string[] }
  | { type: 'venues'; rows: { stc: number | null; name: string; venue: string }[] }
  | { type: 'contacts'; teams: { name: string; rows: ContactRow[] }[] }
  | { type: 'rosters'; teams: { stc: number | null; name: string; players: RosterRow[] }[] }
  | { type: 'deficiencies'; teams: { team: string; lines: string[] }[] }
  | { type: 'rounds'; rounds: RoundView[]; withRef: boolean }
  | { type: 'links'; links: { label: string; url: string }[] }
  | { type: 'signature'; name: string; email: string; phone: string }
  | { type: 'calendar'; months: CalMonth[] };

export type Chapter = { title: string; sections: Section[]; pageBreak?: boolean };
export type BulletinModel = {
  header: string; title: string; subtitles: string[]; intro: Section; chapters: Chapter[];
  warnings: string[]; fileName: string;
};

const CZ_MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
export const CZ_DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

const isoParts = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
/** '2026-10-06' → '6. 10. 2026' (date of issue). */
export const issueDate = (iso: string) => {
  const p = isoParts(iso);
  return p ? `${p.d}. ${p.m}. ${p.y}` : iso;
};
/** '2026-11-08' → '08.11.2026' (round headers, as chess.cz). */
export const roundDate = (iso: string) => {
  const p = isoParts(iso);
  return p ? `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}` : iso;
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Czech count of teams: 1 družstvo, 2–4 družstva, 5+ družstev. */
export const teamsWord = (n: number) => (n === 1 ? 'družstvo' : n >= 2 && n <= 4 ? 'družstva' : 'družstev');

/** Same names within one roster → "st." / "ml." by birth year (only a pair with different years). */
export function rosterDisplay(players: BPlayer[]): RosterRow[] {
  const by = new Map<string, BPlayer[]>();
  for (const p of players) by.set(p.name.toLowerCase(), [...(by.get(p.name.toLowerCase()) ?? []), p]);
  const suffix = new Map<BPlayer, string>();
  for (const g of by.values()) {
    if (g.length !== 2) continue;
    const [a, b] = g;
    if (!a.birthYear || !b.birthYear || a.birthYear === b.birthYear) continue;
    suffix.set(a, a.birthYear < b.birthYear ? 'st.' : 'ml.');
    suffix.set(b, a.birthYear < b.birthYear ? 'ml.' : 'st.');
  }
  return players.map((p) => ({ ...p, display: suffix.has(p) ? `${p.name} ${suffix.get(p)}` : p.name }));
}

/** Names that stay ambiguous in a roster (same name, no distinguishing birth year). */
export function ambiguousNames(players: BPlayer[]): string[] {
  const rows = rosterDisplay(players);
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.display.toLowerCase(), (seen.get(r.display.toLowerCase()) ?? 0) + 1);
  return [...new Set(rows.filter((r) => seen.get(r.display.toLowerCase())! > 1).map((r) => r.display))];
}

export const refKey = (round: number, homeKey: string) => `${round}:${homeKey}`;

/** Referees per match: each team's home matches go round-robin through its referees (in contact order). */
export function rotatedReferees(data: BulletinData): Map<string, string> {
  const refs = new Map(data.teams.map((t) => [t.key, t.contacts.filter((c) => c.role === 'rozhodci' && c.name.trim()).map((c) => c.name.trim())]));
  const count = new Map<string, number>();
  const out = new Map<string, string>();
  for (const r of [...data.rounds].sort((a, b) => a.nr - b.nr)) {
    for (const m of r.matches) {
      const list = refs.get(m.home) ?? [];
      if (!list.length) continue;
      const i = count.get(m.home) ?? 0;
      out.set(refKey(r.nr, m.home), list[i % list.length]);
      count.set(m.home, i + 1);
    }
  }
  return out;
}

/** Months from the first to the last round, weeks Monday–Sunday (uvodni-zpravodaj calendarMonths). */
export function calendarMonths(rounds: BRound[]): CalMonth[] {
  const byDay = new Map<string, number[]>();
  let min: Date | null = null;
  let max: Date | null = null;
  for (const r of rounds) {
    const p = isoParts(r.date);
    if (!p) continue;
    const dt = new Date(p.y, p.m - 1, p.d);
    const k = `${p.y}-${p.m - 1}-${p.d}`;
    byDay.set(k, [...(byDay.get(k) ?? []), r.nr]);
    if (!min || dt < min) min = dt;
    if (!max || dt > max) max = dt;
  }
  if (!min || !max) return [];
  const out: CalMonth[] = [];
  for (let y = min.getFullYear(), m = min.getMonth(); y < max.getFullYear() || (y === max.getFullYear() && m <= max.getMonth()); m === 11 ? (y++, (m = 0)) : m++) {
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const weeks: CalDay[][] = [];
    for (let w = 0; w < Math.ceil((offset + days) / 7); w++) {
      const wk: CalDay[] = [];
      for (let i = 0; i < 7; i++) {
        const d = w * 7 + i - offset + 1;
        wk.push(d >= 1 && d <= days ? { d, rounds: byDay.get(`${y}-${m}-${d}`) ?? [] } : null);
      }
      weeks.push(wk);
    }
    out.push({ name: `${CZ_MONTHS[m]} ${y}`, weeks });
  }
  return out;
}

const ROLE_LABEL: Record<string, string> = { kapitan: 'Kapitán:', zastupce: 'Zástupce kapitána:', komunikace: 'Komunikace:' };

/** "Jukl Karel" → "Karel Jukl" (signature; only two-word names). */
export function signatureName(s: string): string {
  const p = s.trim().split(/\s+/);
  return p.length === 2 ? `${p[1]} ${p[0]}` : s.trim();
}

export const chessczUrl = (id: number) => `https://www.chess.cz/soutez/${id}/`;

/** Start-time exceptions of the teams (approved requests), for the chapter Specifické požadavky. */
function exceptionLines(data: BulletinData): string[] {
  const out: string[] = [];
  for (const t of data.teams) {
    const h = shortTime(t.startHome), a = shortTime(t.startAway), d = shortTime(data.defaultStart);
    const skip = (s?: string) => (roundsText(s) ? ` (neplatí v ${roundsText(s)})` : '');
    if (h && h !== d) out.push(`${t.name} — domácí utkání v ${h} hodin${skip(t.startHomeSkip)}`);
    if (a && a !== d) out.push(`${t.name} — utkání venku v ${a} hodin${skip(t.startAwaySkip)}`);
  }
  return out;
}

/** Default texts of the editable chapters — they follow the data until the vedoucí edits them. */
export function defaultTexts(data: BulletinData): Record<TextKey, DeltaOp[]> {
  const n = data.teams.length;
  const start = shortTime(data.defaultStart);
  const intro = `Ve skupině ${n >= 2 && n <= 4 ? 'startují' : 'startuje'} ${n} ${teamsWord(n)}.`
    + (data.timeControl ? ` Hrací tempo je stanoveno na ${data.timeControl}.` : '');
  const lastNr = data.rounds.length ? Math.max(...data.rounds.map((r) => r.nr)) : null;
  const last = lastStartOf(data);
  const requirements = (exceptionLines(data).length || last !== start) && lastNr
    ? [`Dle rozpisu soutěže nesmí být poslední kolo přeloženo a ani mu nesmí být změněn začátek — všechna utkání ${lastNr}. kola začínají v ${last} hodin.`]
    : [];
  const allRefs = data.teams.length > 0 && data.teams.every((t) => t.contacts.some((c) => c.role === 'rozhodci' && c.name.trim()));
  const referees = ['Rozhodčí byli nominováni dle informací od družstev příp. dle databáze ŠSČR.' + (allRefs ? ' Všechna družstva mají „své domácí“ rozhodčí.' : '')];
  const name = new Map(data.teams.map((t) => [t.key, t.name]));
  const announcements = data.sameClub.map(([a, b]) => {
    const r = data.rounds.find((r) => r.matches.some((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a)));
    return r
      ? `Družstva ${name.get(a)} a ${name.get(b)} spolu sehrají vzájemný zápas v ${r.nr}. kole (${roundDate(r.date)}), čímž je splněn požadavek rozpisu soutěže týkající se vzájemných zápasů družstev stejného oddílu.`
      : `Družstva ${name.get(a)} a ${name.get(b)} jsou ze stejného oddílu.`;
  });
  const results = [
    'Prosím o hlášení výsledků v den zápasu nejpozději do 18.00 hodin, nejlépe e-mailem. Pokud zasíláte fotografii zápisu utkání, ujistěte se, že jsou všechny informace dostatečně čitelné, v opačném případě si vyhrazuji právo takové hlášení odmítnout.',
    'Při hlášení výsledku uvádějte vždy rozhodčího utkání.',
  ];
  return {
    intro: textDelta([intro]),
    requirements: textDelta(requirements),
    referees: textDelta(referees),
    announcements: textDelta(announcements),
    results: textDelta(results),
  };
}

/** Start of the last round ("9:00"): the competition's alternative last-round start, else the default start. */
export function lastStartOf(data: Pick<BulletinData, 'defaultStart' | 'lastStart'>): string {
  return shortTime(data.lastStart) || shortTime(data.defaultStart);
}

export function defaultLastNote(lastStart: string) {
  return `poslední kolo, všechna utkání musí začínat v ${shortTime(lastStart)}`;
}

const startTeam = (t: BTeam | undefined): StartTeam | null =>
  t ? { start_home: t.startHome, start_away: t.startAway, start_home_skip: t.startHomeSkip, start_away_skip: t.startAwaySkip } : null;

export function buildModel(data: BulletinData, cfg: InitialConfig): BulletinModel {
  const warnings = [...data.warnings];
  const defaults = defaultTexts(data);
  const rich = (key: TextKey): Section => {
    const ops = cfg.texts[key] ?? defaults[key];
    return { type: 'rich', key, ops, blocks: deltaBlocks(ops), custom: !!cfg.texts[key], defaults: defaults[key] };
  };
  const team = new Map(data.teams.map((t) => [t.key, t]));
  const start = shortTime(data.defaultStart);
  const definitive = cfg.kind === 'definitive';

  // Rosters: the definitive bulletin leaves out struck players (rozpis: approved by the definitive bulletin).
  const rosters = data.teams.map((t) => {
    const all = data.rosters[t.key] ?? [];
    for (const name of ambiguousNames(all)) warnings.push(`${t.name}: hráče „${name}“ nelze rozlišit (st./ml.) — chybí rok narození`);
    if (!data.rosters[t.key]) warnings.push(`${t.name}: chybí soupiska`);
    return { stc: t.stc, name: t.name, players: rosterDisplay(definitive ? all.filter((p) => !p.struck) : all) };
  });

  // Schedule with start-time exceptions and referees.
  const lastNr = data.rounds.length ? Math.max(...data.rounds.map((r) => r.nr)) : null;
  const rotation = rotatedReferees(data);
  const rounds: RoundView[] = [...data.rounds].sort((a, b) => a.nr - b.nr).map((r) => {
    const last = r.nr === lastNr;
    let special = false;
    const rows = r.matches.map((m, i): RoundRow => {
      const h = team.get(m.home), a = team.get(m.away);
      const st = matchStart(startTeam(h), startTeam(a), data.defaultStart, { nr: r.nr, last, lastStart: data.lastStart });
      if (last) {
        const raw = matchStart(startTeam(h), startTeam(a), data.defaultStart, { nr: r.nr, last: false });
        if (raw.exception) warnings.push(`V posledním kole se neuplatní jiný začátek: ${h?.name} – ${a?.name} (${raw.conflict ? CONFLICT : shortTime(raw.time)})`);
      }
      const time = st.conflict ? CONFLICT : st.exception ? shortTime(st.time) : '';
      if (st.conflict) warnings.push(`Konflikt začátků v ${r.nr}. kole: ${h?.name} – ${a?.name}`);
      if (time) special = true;
      const key = refKey(r.nr, m.home);
      return {
        board: i + 1, homeStc: h?.stc ?? null, homeName: h?.name ?? '?', time,
        awayStc: a?.stc ?? null, awayName: a?.name ?? '?',
        ref: key in cfg.refs ? cfg.refs[key] : rotation.get(key) ?? '', refKey: key,
        refOptions: (h?.contacts ?? []).filter((c) => c.role === 'rozhodci' && c.name.trim()).map((c) => c.name.trim()),
      };
    });
    const note = last ? (cfg.lastNote ?? defaultLastNote(lastStartOf(data))).trim() : '';
    return {
      nr: r.nr, rows,
      header: `Kolo ${r.nr} dne ${roundDate(r.date)} v ${last ? lastStartOf(data) : start} hodin` + (special ? ', pokud není uvedeno jinak' : '') + (note ? ` (${note})` : ''),
    };
  });
  if (cfg.withRef) {
    const noRef = data.teams.filter((t) => !t.contacts.some((c) => c.role === 'rozhodci' && c.name.trim())).map((t) => t.name);
    if (noRef.length) warnings.push(`Družstva bez rozhodčího: ${noRef.join(', ')}`);
  }

  const exceptions = exceptionLines(data);
  const lastStart = lastStartOf(data);
  const requirementLines = [
    ...(exceptions.length
      ? [`Jiné začátky utkání (výchozí začátek je v ${start} hodin):`, ...exceptions.map((s) => `• ${s}`)]
      : [lastStart === start ? `Všechna utkání začínají v ${start} hodin.` : `Utkání začínají v ${start} hodin.`]),
  ];

  const links = [
    ...(data.chessczId ? [{ label: 'Šachový svaz', url: chessczUrl(data.chessczId) }] : []),
    ...(data.www ? [{ label: 'Chess-results', url: data.www }] : []),
  ];

  const chapters: Chapter[] = [
    { title: 'Hrací místnost', sections: [{ type: 'venues', rows: data.teams.map((t) => ({ stc: t.stc, name: t.name, venue: t.venue })) }] },
    {
      title: 'Adresář kapitánů, zástupců a organizačních pracovníků',
      sections: [{
        type: 'contacts',
        teams: data.teams.map((t) => ({
          name: t.name,
          rows: t.contacts.filter((c) => c.role !== 'rozhodci').map((c) => ({ label: ROLE_LABEL[c.role], name: c.name, phone: c.phone, email: c.email })),
        })),
      }],
    },
    { title: 'Soupisky družstev', sections: [{ type: 'rosters', teams: rosters }] },
    ...(definitive ? [] : [{
      title: 'Nedostatky soupisek',
      sections: [data.deficiencies.length
        ? { type: 'deficiencies', teams: data.deficiencies } as Section
        : { type: 'lines', lines: ['Kontrolou soupisek nebyly zjištěny žádné nedostatky.'] } as Section],
    }]),
    { title: 'Rozlosování soutěže', sections: [{ type: 'rounds', rounds, withRef: cfg.withRef }] },
    { title: 'Specifické požadavky', sections: [{ type: 'lines', lines: requirementLines }, rich('requirements')] },
    { title: 'Rozhodčí', sections: [rich('referees')] },
    { title: 'Další oznámení', sections: [rich('announcements')] },
    { title: 'Stránky soutěže', sections: links.length ? [{ type: 'links', links }] : [{ type: 'lines', lines: ['Soutěž zatím není na chess.cz.'] }] },
    {
      title: 'Hlášení výsledků',
      sections: [rich('results'), { type: 'signature', name: signatureName(data.manager.name), email: data.manager.email, phone: data.manager.phone }],
    },
    ...(cfg.calendar ? [{ title: 'Kalendář soutěže', pageBreak: true, sections: [{ type: 'calendar', months: calendarMonths(data.rounds) } as Section] }] : []),
  ];

  const yy = (s: string) => s.slice(2, 4);
  const [y1, y2] = data.season.split('/');
  return {
    header: [data.region, data.compName, data.season].filter(Boolean).join(' - '),
    title: data.compName,
    subtitles: [
      data.region,
      `${definitive ? 'Úvodní zpravodaj' : 'Předběžný úvodní zpravodaj'} – ročník ${data.season}`,
      issueDate(cfg.date ?? todayIso()),
    ].filter(Boolean),
    intro: rich('intro'),
    chapters,
    warnings: [...new Set(warnings)],
    fileName: `${(data.short || 'soutez').toLowerCase()}_${yy(y1 ?? '')}_${yy(y2 ?? '')}_uz${definitive ? '' : '_predbezny'}`
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/gi, '_'),
  };
}

// Export of all rosters of a competition for Swiss-Manager Automat (../swiss-manager-automat, sm_vstup.z_json).
// Format: swiss-manager-automat/docs/FORMAT_SOUPISKY.md (app "vedouci-souteze", version 1); our mapping and the
// extra optional keys (`los`, `soupiska_verze`, `turnaj.id`) are described in doc/feat-export-sm.md.

import { flagParts } from '../roster/draft';
import { fold } from '../text';
import type { CzCheck } from '../roster/verify';

export const SM_EXPORT_APP = 'vedouci-souteze';
export const SM_EXPORT_VERSION = 1;
/** Swiss-Manager truncates the team "Info" field to this length. */
export const SM_INFO_LIMIT = 70;

export type SmSourcePlayer = {
  name: string;
  birth_year: number | null;
  lok: number | null;
  fide: number | null;
  flags: string;
  base: number;
  struck: number;
  cz: CzCheck | null;
};

export type SmSourceContact = { role: string; position?: number; name: string; phone: string; email: string };

export type SmSourceTeam = {
  name: string;
  club_code: string | null;
  draw_no: number | null;
  position: number;
  venue: string;
  contacts: SmSourceContact[];
  /** Current roster version; null = the team has no roster yet. */
  roster: { version: number; players: SmSourcePlayer[] } | null;
};

export type SmExportInput = {
  competition: { id: string; name: string; season: string; boards: number };
  /** Active teams only. */
  teams: SmSourceTeam[];
  savedAt: string;
};

export type SmPlayer = {
  poradi: number;
  lok?: number;
  fide?: number;
  jmeno: string;
  pismenka: string[];
  elo_cr?: number;
  elo_fide?: number;
  rok?: number;
};

export type SmTeam = {
  nazev: string;
  los?: number;
  cislo_klubu?: string;
  soupiska_verze?: number;
  extra: {
    kapJmeno: string; kapTel: string; kapEmail: string;
    zastJmeno: string; zastTel: string; zastEmail: string;
    hraciMistnost: string;
  };
  hraci: SmPlayer[];
};

export type SmFile = {
  app: typeof SM_EXPORT_APP;
  version: typeof SM_EXPORT_VERSION;
  savedAt: string;
  turnaj: { id: string; nazev: string; zaklad: number };
  druzstva: SmTeam[];
};

/** error = Automat refuses the roster (or the result is wrong); warn = worth a look; info = just so you know. */
export type SmIssue = { level: 'error' | 'warn' | 'info'; team: string | null; text: string };

/** Letters for the SM "Typ" column in the canonical order: Z first, then H/V/C, the function (K/ZK) last. */
export function smLetters(p: Pick<SmSourcePlayer, 'flags' | 'base'>): string[] {
  const { cap, letter } = flagParts(p.flags);
  return [p.base ? 'Z' : '', letter, cap].filter(Boolean);
}

/** Same person despite word order and suffixes ("Roman Šoltys" = "Šoltys Roman", "Meca Viktor, st." = "Meca Viktor"). */
export function samePerson(a: string, b: string): boolean {
  const words = (s: string) => new Set(fold(s).replace(/[^\p{L}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));
  const [x, y] = [words(a), words(b)].sort((p, q) => p.size - q.size);
  return x.size > 0 && [...x].every((w) => y.has(w));
}

const positive = (v: number | null | undefined): number | undefined => (v != null && v > 0 ? v : undefined);

function contact(team: SmSourceTeam, role: string): SmSourceContact | undefined {
  return team.contacts.filter((c) => c.role === role).sort((a, b) => (a.position ?? 1) - (b.position ?? 1))[0];
}

/** Teams in Swiss-Manager order: by draw number (SM starting number), teams without one last in list order. */
function smOrder(teams: SmSourceTeam[]): SmSourceTeam[] {
  return [...teams].sort((a, b) => (a.draw_no ?? Infinity) - (b.draw_no ?? Infinity) || a.position - b.position);
}

export function buildSmExport(input: SmExportInput): { file: SmFile; issues: SmIssue[] } {
  const { competition: comp } = input;
  const issues: SmIssue[] = [];
  const add = (level: SmIssue['level'], team: string | null, text: string) => issues.push({ level, team, text });

  const teams = smOrder(input.teams);
  if (!teams.length) add('error', null, 'Soutěž nemá žádné aktivní družstvo.');

  const drawNos = new Map<number, string[]>();
  for (const t of teams) if (t.draw_no != null) drawNos.set(t.draw_no, [...(drawNos.get(t.draw_no) ?? []), t.name]);
  for (const [no, names] of drawNos) if (names.length > 1) add('error', null, `Losovací číslo ${no} má víc družstev: ${names.join(', ')}.`);
  const withoutDraw = teams.filter((t) => t.draw_no == null);
  if (withoutDraw.length) {
    add('warn', null, withoutDraw.length === teams.length
      ? 'Družstva ještě nemají losovací čísla — pořadí v SM bude podle seznamu družstev.'
      : `Bez losovacího čísla (v SM budou na konci): ${withoutDraw.map((t) => t.name).join(', ')}.`);
  }

  const seenIds = new Map<string, string>();
  const druzstva = teams.map((t): SmTeam => {
    const kap = contact(t, 'kapitan');
    const zast = contact(t, 'zastupce');
    const players = (t.roster?.players ?? []).filter((p) => !p.struck);
    const struck = (t.roster?.players.length ?? 0) - players.length;

    if (!t.roster) add('warn', t.name, 'Nemá soupisku — v SM se založí jen družstvo.');
    if (!t.club_code) add('warn', t.name, 'Chybí číslo klubu (Č.kl. v SM zůstane prázdné).');
    if (t.venue.length > SM_INFO_LIMIT) add('info', t.name, `Hrací místnost má ${t.venue.length} znaků, SM ji ořeže na ${SM_INFO_LIMIT}.`);
    if (struck) add('info', t.name, `Vynecháno vyškrtnutých hráčů: ${struck} (pořadí je přečíslované).`);

    const hraci = players.map((p, i): SmPlayer => {
      const member = p.cz?.status === 'found' ? p.cz.member : undefined;
      const lok = positive(p.lok) ?? positive(member?.czeId);
      const fide = positive(p.fide) ?? positive(member?.fideId);
      if (!lok && !fide) add('error', t.name, `${i + 1}. ${p.name}: chybí LOK i FIDE ID — Automat soupisku nevloží.`);
      const key = lok ? `l${lok}` : fide ? `f${fide}` : '';
      if (key) {
        const prev = seenIds.get(key);
        if (prev) add('error', t.name, `${i + 1}. ${p.name}: stejné ID je už na soupisce ${prev}.`);
        else seenIds.set(key, t.name);
      }
      const out: SmPlayer = { poradi: i + 1, ...(lok ? { lok } : {}), ...(fide ? { fide } : {}), jmeno: p.name, pismenka: smLetters(p) };
      const eloCr = positive(member?.czeStdElo);
      const eloFide = positive(member?.fideStdElo);
      const rok = positive(p.birth_year) ?? positive(member?.birthYear);
      if (eloCr) out.elo_cr = eloCr;
      if (eloFide) out.elo_fide = eloFide;
      if (rok) out.rok = rok;
      return out;
    });

    if (t.roster) {
      const unchecked = players.filter((p) => !p.cz).length;
      if (unchecked) add('info', t.name, `Neověřeno proti chess.cz: ${unchecked} hráčů (bez Elo pro kontrolu v Automatu).`);
      const z = hraci.filter((h) => h.pismenka.includes('Z')).length;
      if (z < comp.boards) add('warn', t.name, `Základ má ${z} hráčů, soutěž hraje na ${comp.boards} šachovnicích.`);
      for (const [code, label, person] of [['K', 'kapitán', kap], ['ZK', 'zástupce kapitána', zast]] as const) {
        const marked = hraci.filter((h) => h.pismenka.includes(code));
        if (marked.length !== 1) {
          add('warn', t.name, marked.length ? `Písmeno ${code} má ${marked.length} hráčů.` : `Na soupisce není ${label} (${code}).`);
        } else if (person?.name && !samePerson(person.name, marked[0].jmeno)) {
          add('info', t.name, `${code} na soupisce je ${marked[0].jmeno}, v kontaktech ${person.name}.`);
        }
      }
    }

    return {
      nazev: t.name,
      ...(t.draw_no != null ? { los: t.draw_no } : {}),
      ...(t.club_code ? { cislo_klubu: t.club_code } : {}),
      ...(t.roster ? { soupiska_verze: t.roster.version } : {}),
      extra: {
        kapJmeno: kap?.name ?? '', kapTel: kap?.phone ?? '', kapEmail: kap?.email ?? '',
        zastJmeno: zast?.name ?? '', zastTel: zast?.phone ?? '', zastEmail: zast?.email ?? '',
        hraciMistnost: t.venue,
      },
      hraci,
    };
  });

  return {
    file: {
      app: SM_EXPORT_APP,
      version: SM_EXPORT_VERSION,
      savedAt: input.savedAt,
      turnaj: { id: comp.id, nazev: `${comp.name} ${comp.season}`.trim(), zaklad: comp.boards },
      druzstva,
    },
    issues,
  };
}

/** File name of the export, e.g. "RPB_2026-2027_swiss-manager.json". */
export function smExportFileName(short: string, season: string): string {
  return `${short}_${season.replace(/\//g, '-')}_swiss-manager.json`.replace(/[^\w.-]+/g, '_');
}

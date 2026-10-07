// Competition import: JSON format produced by the `import-rozpis` skill (from Rozpis / Rozdělení PDFs)
// or written by hand. Spec: doc/import-format.md. Applying it is always previewed first (dry-run plan).

import { bestTeamMatch, fold } from '../text';

export const IMPORT_FORMAT = 'vedouci-souteze/competitions';
export const LEVELS = ['KP', 'KS', 'RP', 'RS', 'other'] as const;
export type Level = (typeof LEVELS)[number];

export type ImportRound = { round: number; date: string; note?: string };
export type ImportTeam = { name: string; club_name?: string };
export type ImportCompetition = {
  short: string;
  level: Level;
  group?: string;
  name: string;
  boards?: number;
  default_start?: string;
  time_control?: string;
  manager?: { name?: string; email?: string; phone?: string };
  mutual_deadline?: string;
  rounds?: ImportRound[];
  teams?: ImportTeam[];
};
export type CompetitionImport = {
  format: typeof IMPORT_FORMAT;
  version: 1;
  source?: { document?: string; kind?: 'rozpis' | 'rozdeleni' | 'other'; date?: string };
  season: string;
  region?: string;
  competitions: ImportCompetition[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;

/** Validate untrusted JSON; throws Error with all problems (Czech) joined by newlines. */
export function validateCompetitionImport(data: unknown): CompetitionImport {
  const errors: string[] = [];
  const d = data as any;
  if (!d || typeof d !== 'object') throw new Error('Import musí být JSON objekt.');
  if (d.format !== IMPORT_FORMAT) errors.push(`Pole "format" musí být "${IMPORT_FORMAT}".`);
  if (d.version !== 1) errors.push('Podporovaná verze formátu je 1.');
  if (typeof d.season !== 'string' || !/^\d{4}\/\d{4}$/.test(d.season)) errors.push('Pole "season" musí mít tvar "2026/2027".');
  if (!Array.isArray(d.competitions) || !d.competitions.length) errors.push('Pole "competitions" musí být neprázdné pole.');
  const shorts = new Set<string>();
  (Array.isArray(d.competitions) ? d.competitions : []).forEach((c: any, i: number) => {
    const at = `competitions[${i}]${c?.short ? ` (${c.short})` : ''}`;
    if (!c || typeof c !== 'object') return errors.push(`${at}: musí být objekt.`);
    if (typeof c.short !== 'string' || !c.short.trim()) errors.push(`${at}: chybí "short" (např. "RPB").`);
    else if (shorts.has(c.short.trim().toUpperCase())) errors.push(`${at}: duplicitní "short".`);
    else shorts.add(c.short.trim().toUpperCase());
    if (!LEVELS.includes(c.level)) errors.push(`${at}: "level" musí být jedno z ${LEVELS.join(', ')}.`);
    if (typeof c.name !== 'string' || !c.name.trim()) errors.push(`${at}: chybí "name".`);
    if (c.boards != null && !(Number.isInteger(c.boards) && c.boards > 0 && c.boards <= 12)) errors.push(`${at}: "boards" musí být 1–12.`);
    if (c.default_start != null && !TIME.test(c.default_start)) errors.push(`${at}: "default_start" musí mít tvar "HH:MM".`);
    if (c.mutual_deadline != null && !ISO_DATE.test(c.mutual_deadline)) errors.push(`${at}: "mutual_deadline" musí být datum YYYY-MM-DD.`);
    if (c.rounds != null) {
      if (!Array.isArray(c.rounds)) errors.push(`${at}: "rounds" musí být pole.`);
      else c.rounds.forEach((r: any, j: number) => {
        if (!Number.isInteger(r?.round) || r.round < 1) errors.push(`${at}.rounds[${j}]: "round" musí být kladné celé číslo.`);
        if (typeof r?.date !== 'string' || !ISO_DATE.test(r.date)) errors.push(`${at}.rounds[${j}]: "date" musí být YYYY-MM-DD.`);
      });
    }
    if (c.teams != null) {
      if (!Array.isArray(c.teams)) errors.push(`${at}: "teams" musí být pole.`);
      else c.teams.forEach((t: any, j: number) => {
        if (typeof t?.name !== 'string' || !t.name.trim()) errors.push(`${at}.teams[${j}]: chybí "name".`);
      });
    }
  });
  if (errors.length) throw new Error(errors.join('\n'));
  return d as CompetitionImport;
}

// ---- Plan ---------------------------------------------------------------------------------------

export type ExistingTeam = { id: string; name: string; status: 'active' | 'reserve'; position: number };
export type ExistingCompetition = {
  id: string;
  season: string;
  short: string;
  fields: Record<CompetitionField, string | number | null>;
  rounds: ImportRound[];
  teams: ExistingTeam[];
};

export const COMPETITION_FIELDS = [
  'name', 'level', 'group_code', 'region', 'boards', 'default_start', 'time_control',
  'manager_name', 'manager_email', 'manager_phone', 'mutual_deadline',
] as const;
export type CompetitionField = (typeof COMPETITION_FIELDS)[number];

export type FieldChange = { field: CompetitionField; from: string | number | null; to: string | number };
export type TeamAction =
  | { action: 'add'; name: string; club_name: string; position: number }
  | { action: 'keep'; id: string; name: string; importName: string; position: number; moved: boolean; reactivate: boolean }
  | { action: 'reserve'; id: string; name: string };

export type CompetitionPlan = {
  short: string;
  name: string;
  action: 'create' | 'update';
  existingId: string | null;
  fields: Record<CompetitionField, string | number>;   // full target values (create) / imported values (update)
  fieldChanges: FieldChange[];
  rounds: { replace: boolean; target: ImportRound[]; changed: number[] };
  teams: TeamAction[] | null;   // null = the document has no team list for this competition
};

function importFields(c: ImportCompetition, region: string): Partial<Record<CompetitionField, string | number>> {
  const out: Partial<Record<CompetitionField, string | number>> = {
    name: c.name.trim(),
    level: c.level,
    group_code: (c.group ?? '').trim(),
    region,
    boards: c.boards ?? (c.level === 'RS' ? 5 : 8),
    default_start: c.default_start ?? (c.level === 'KP' || c.level === 'KS' ? '10:00' : '09:00'),
    time_control: c.time_control?.trim() ?? '',
    manager_name: c.manager?.name?.trim() ?? '',
    manager_email: c.manager?.email?.trim() ?? '',
    manager_phone: c.manager?.phone?.trim() ?? '',
    mutual_deadline: c.mutual_deadline ?? '',
  };
  return out;
}

/**
 * Compute what an import would change. `only` limits to the listed competition shorts
 * (the Rozpis covers every group of the region, the user typically manages just one or two).
 * Existing team names are never overwritten (the user may have edited them); teams missing
 * from the document's list go to the reserve, never get deleted.
 */
export function planCompetitionImport(doc: CompetitionImport, existing: ExistingCompetition[], only?: string[]): CompetitionPlan[] {
  const want = only?.length ? new Set(only.map((s) => s.trim().toUpperCase())) : null;
  const region = doc.region?.trim() ?? '';
  return doc.competitions
    .filter((c) => !want || want.has(c.short.trim().toUpperCase()))
    .map((c) => {
      const short = c.short.trim().toUpperCase();
      const ex = existing.find((e) => e.season === doc.season && e.short.toUpperCase() === short) ?? null;
      const imported = importFields(c, region);
      const fieldChanges: FieldChange[] = [];
      if (ex) {
        for (const f of COMPETITION_FIELDS) {
          const to = imported[f];
          if (to === undefined || to === '') continue;   // empty import values never erase data
          const from = ex.fields[f];
          if (String(from ?? '') !== String(to)) fieldChanges.push({ field: f, from, to });
        }
      }

      const target = (c.rounds ?? []).slice().sort((a, b) => a.round - b.round).map((r) => ({ round: r.round, date: r.date, note: r.note ?? '' }));
      const changed = target
        .filter((r) => {
          const old = ex?.rounds.find((o) => o.round === r.round);
          return !old || old.date !== r.date || (old.note ?? '') !== r.note;
        })
        .map((r) => r.round);
      const removedRounds = (ex?.rounds ?? []).filter((o) => !target.some((r) => r.round === o.round)).map((o) => o.round);

      let teams: TeamAction[] | null = null;
      if (c.teams) {
        teams = [];
        const pool = [...(ex?.teams ?? [])];
        c.teams.forEach((t, i) => {
          const match = bestTeamMatch(t.name, pool, (x) => x.name);
          if (match) {
            pool.splice(pool.indexOf(match), 1);
            teams!.push({ action: 'keep', id: match.id, name: match.name, importName: t.name.trim(), position: i + 1, moved: match.position !== i + 1, reactivate: match.status === 'reserve' });
          } else {
            teams!.push({ action: 'add', name: t.name.trim(), club_name: t.club_name?.trim() ?? '', position: i + 1 });
          }
        });
        for (const rest of pool) if (rest.status === 'active') teams.push({ action: 'reserve', id: rest.id, name: rest.name });
      }

      return {
        short,
        name: c.name.trim(),
        action: ex ? 'update' : 'create',
        existingId: ex?.id ?? null,
        fields: { ...imported } as Record<CompetitionField, string | number>,
        fieldChanges,
        rounds: { replace: c.rounds != null && (changed.length > 0 || removedRounds.length > 0), target, changed: [...changed, ...removedRounds] },
        teams,
      };
    });
}

/** True when the plan for a competition changes nothing. */
export function planIsNoop(p: CompetitionPlan): boolean {
  if (p.action === 'create') return false;
  const teamChanges = p.teams?.some((t) => t.action !== 'keep' || t.reactivate || t.moved) ?? false;
  return !p.fieldChanges.length && !p.rounds.replace && !teamChanges;
}

export const sameName = (a: string, b: string) => fold(a) === fold(b);

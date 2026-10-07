// vs — command line client for Vedoucí soutěže (used by the Claude Code skills import-rozpis / import-soupiska).
//
//   npm run cli -- competitions
//   npm run cli -- import-competitions <file.json> [--only RPB,KSA] [--apply]
//   npm run cli -- parse-soupiska <file.xlsx|json>...            (offline: prints draft JSON + warnings)
//   npm run cli -- import-soupisky <SHORT|id> <file>... [--apply]
//
// Server: $VS_URL (default https://vedouci.sachytynec.cz). Token: $VS_TOKEN or ~/.config/vedouci-souteze/token
// (create one on the "API tokeny" page).
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import ExcelJS from 'exceljs';
import { normalizeDraft, draftWarnings, type RosterDraft } from '../shared/roster/draft';
import { parseRosterGrid } from '../shared/roster/xlsx';
import { pickRosterSheet, worksheetToGrid } from '../shared/roster/excelGrid';
import { validateCompetitionImport } from '../shared/import/competition';

const BASE = (process.env.VS_URL ?? 'https://vedouci.sachytynec.cz').replace(/\/$/, '');

function token(): string {
  const file = `${homedir()}/.config/vedouci-souteze/token`;
  const t = process.env.VS_TOKEN ?? (existsSync(file) ? readFileSync(file, 'utf8').trim() : '');
  if (!t) throw new Error(`Chybí API token: nastavte VS_TOKEN nebo uložte token do ${file}`);
  return t;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`${res.status}: ${data.error ?? res.statusText}`);
  return data as T;
}

async function readRoster(file: string): Promise<{ draft: RosterDraft; warnings: string[]; source: 'xlsx' | 'json' }> {
  if (/\.json$/i.test(file)) return { draft: normalizeDraft(JSON.parse(readFileSync(file, 'utf8'))), warnings: [], source: 'json' };
  if (!/\.xlsx$/i.test(file)) throw new Error('Podporované jsou .xlsx (e-soupiska) a .json (sscr-soupiska draft); .xls uložte jako .xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const { draft, warnings } = parseRosterGrid(worksheetToGrid(pickRosterSheet(wb.worksheets as any)! as any));
  return { draft, warnings, source: 'xlsx' };
}

async function competitionId(ref: string): Promise<{ id: string; boards: number }> {
  const { competitions } = await call<{ competitions: { id: string; short: string; season: string; boards: number }[] }>('GET', '/competitions');
  const hit = competitions.find((c) => c.id === ref) ?? competitions.filter((c) => c.short === ref.toUpperCase()).sort((a, b) => b.season.localeCompare(a.season))[0];
  if (!hit) throw new Error(`Soutěž ${ref} nenalezena (vypište: npm run cli -- competitions)`);
  return hit;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const opt = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const args = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--only');

  switch (cmd) {
    case 'competitions': {
      const { competitions } = await call<{ competitions: any[] }>('GET', '/competitions');
      for (const c of competitions) console.log(`${c.season}  ${c.short.padEnd(5)} ${c.name.padEnd(28)} družstev ${c.team_count}, soupisek ${c.roster_count}  id=${c.id}`);
      break;
    }
    case 'import-competitions': {
      const file = args[0];
      if (!file) throw new Error('Použití: import-competitions <file.json> [--only RPB,KSA] [--apply]');
      const doc = validateCompetitionImport(JSON.parse(readFileSync(file, 'utf8')));
      const q = new URLSearchParams();
      if (opt('--only')) q.set('only', opt('--only')!);
      if (flags.has('--apply')) { q.set('apply', 'true'); q.set('filename', basename(file)); }
      const r = await call<any>('POST', `/import/competitions?${q}`, doc);
      if (r.applied) { console.log(`Importováno: ${r.applied.join(', ') || 'beze změn'}`); break; }
      for (const p of r.plans) {
        const teams = p.teams ? ` · družstva: +${p.teams.filter((t: any) => t.action === 'add').length} −${p.teams.filter((t: any) => t.action === 'reserve').length}` : '';
        console.log(`${p.short.padEnd(5)} ${p.noop ? 'beze změn' : p.action === 'create' ? 'NOVÁ' : `změny: ${p.fieldChanges.map((f: any) => f.field).join(', ') || '—'}${p.rounds.replace ? ', termíny' : ''}`}${teams}`);
      }
      console.log('\n(náhled — uložte s --apply, případně jen vybrané s --only RPB)');
      break;
    }
    case 'parse-soupiska': {
      for (const file of args) {
        try {
          const { draft, warnings } = await readRoster(file);
          console.log(JSON.stringify({ file: basename(file), warnings: [...warnings, ...draftWarnings(draft, 8)], draft }, null, 2));
        } catch (e) {
          console.log(JSON.stringify({ file: basename(file), error: (e as Error).message }));
        }
      }
      break;
    }
    case 'import-soupisky': {
      const [ref, ...files] = args;
      if (!ref || !files.length) throw new Error('Použití: import-soupisky <SHORT|id> <soubor>... [--apply]');
      const comp = await competitionId(ref);
      for (const file of files) {
        const name = basename(file);
        try {
          const { draft, warnings, source } = await readRoster(file);
          const r = await call<any>('POST', `/competitions/${comp.id}/rosters/import`, { draft });
          if (r.needsTeam) {
            console.log(`✗ ${name}: družstvo „${draft.header.druzstvo}“ nepřiřazeno — kandidáti: ${r.candidates.slice(0, 3).map((c: any) => `${c.name} (${c.score})`).join(', ')}`);
            continue;
          }
          const p = r.preview;
          const all = [...warnings, ...p.warnings];
          const summary = p.previousVersion ? `+${p.diff.added.length} −${p.diff.removed.length} ~${p.diff.changed.length}` : `${draft.players.length} hráčů (první verze)`;
          if (flags.has('--apply')) {
            const a = await call<any>('POST', `/competitions/${comp.id}/rosters/import`, { draft, team_id: p.team.id, filename: name, source, apply: true });
            console.log(a.unchanged ? `= ${name} → ${p.team.name}: beze změn (verze ${a.version})` : `✓ ${name} → ${p.team.name}: uloženo jako verze ${a.version} (${summary})`);
          } else {
            console.log(`• ${name} → ${p.team.name}: ${summary}`);
          }
          for (const w of all) console.log(`    ! ${w}`);
        } catch (e) {
          console.log(`✗ ${name}: ${(e as Error).message}`);
        }
      }
      if (!flags.has('--apply')) console.log('\n(náhled — uložte s --apply; soupisky lze ověřit i v aplikaci na záložce Import soupisek)');
      break;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url).pathname, 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  }
}

main().catch((e) => { console.error(`Chyba: ${(e as Error).message}`); process.exit(1); });

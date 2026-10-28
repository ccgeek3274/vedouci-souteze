import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { ownedCompetition, type CompetitionRow } from '../lib/db';
import { buildSmExport, smExportFileName, SM_DEFAULT_OPTIONS, type SmOptions, type SmSourceTeam } from '../../shared/export/swissManager';
import { resolveCompetition } from '../../shared/teamShorten';
import { shortenData } from '../lib/teamShortData';
import type { AppEnv } from '../types';

// Exports for other applications (doc/feat-export-sm.md).
const exportsApi = new Hono<AppEnv>();
exportsApi.use('*', authRequired);

/** Active teams with contacts and the current roster version (struck players included, the builder skips them). */
async function smSource(db: D1Database, comp: CompetitionRow): Promise<SmSourceTeam[]> {
  const [teamRows, contacts, versions, players] = await db.batch([
    db.prepare(`SELECT id, name, short_name, club_code, draw_no, position, venue, start_home, start_home_skip, sm_info FROM teams WHERE competition_id = ? AND status = 'active' ORDER BY position`).bind(comp.id),
    db.prepare(
      `SELECT tc.team_id, tc.role, tc.position, tc.name, tc.phone, tc.email FROM team_contacts tc JOIN teams t ON t.id = tc.team_id
       WHERE t.competition_id = ? AND tc.role IN ('kapitan', 'zastupce')`
    ).bind(comp.id),
    db.prepare(
      `SELECT rv.id, rv.team_id, rv.version FROM roster_versions rv JOIN teams t ON t.id = rv.team_id
       WHERE t.competition_id = ? AND rv.version = (SELECT MAX(version) FROM roster_versions x WHERE x.team_id = rv.team_id)`
    ).bind(comp.id),
    db.prepare(
      `SELECT rp.roster_version_id, rp.name, rp.birth_year, rp.lok, rp.fide, rp.flags, rp.base, rp.struck, rp.cz_json
       FROM roster_players rp JOIN roster_versions rv ON rv.id = rp.roster_version_id JOIN teams t ON t.id = rv.team_id
       WHERE t.competition_id = ? AND rv.version = (SELECT MAX(version) FROM roster_versions x WHERE x.team_id = rv.team_id)
       ORDER BY rp.position`
    ).bind(comp.id),
  ]);
  const playersOf = new Map<string, any[]>();
  for (const { roster_version_id, cz_json, ...p } of players.results as any[]) {
    playersOf.set(roster_version_id, [...(playersOf.get(roster_version_id) ?? []), { ...p, cz: cz_json ? JSON.parse(cz_json) : null }]);
  }
  const versionOf = new Map((versions.results as any[]).map((v) => [v.team_id, v]));
  return (teamRows.results as any[]).map((t) => {
    const v = versionOf.get(t.id);
    return {
      ...t,
      contacts: (contacts.results as any[]).filter((x) => x.team_id === t.id),
      roster: v ? { version: v.version, players: playersOf.get(v.id) ?? [] } : null,
    };
  });
}

/**
 * Short names are generated only here (the SM page): teams without one get a label unique within the active teams
 * and it is stored, so later edits (SM page, team detail) are kept. Clearing a short name = generate it again.
 */
async function fillShortNames(db: D1Database, teams: SmSourceTeam[]): Promise<void> {
  const missing = teams.filter((t) => !t.short_name);
  if (!missing.length) return;
  const resolved = new Map(resolveCompetition(teams.map((t) => ({ id: t.id!, name: t.name })), shortenData()).map((r) => [r.id, r.label]));
  for (const t of missing) t.short_name = resolved.get(t.id!) ?? null;
  await db.batch(missing.filter((t) => t.short_name).map((t) => db.prepare('UPDATE teams SET short_name = ? WHERE id = ?').bind(t.short_name, t.id)));
}

/** ?kapitan=0|1&zastupce=0|1&kontakty=0|1, defaults SM_DEFAULT_OPTIONS. */
function smOptions(c: any): SmOptions {
  const flag = (k: string, d: boolean) => (c.req.query(k) == null ? d : c.req.query(k) === '1');
  return {
    captain: flag('kapitan', SM_DEFAULT_OPTIONS.captain),
    deputy: flag('zastupce', SM_DEFAULT_OPTIONS.deputy),
    contacts: flag('kontakty', SM_DEFAULT_OPTIONS.contacts),
  };
}

async function smExport(c: any) {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return null;
  const teams = await smSource(c.env.DB, comp);
  await fillShortNames(c.env.DB, teams);
  return { comp, ...buildSmExport({ competition: comp, teams, options: smOptions(c), savedAt: new Date().toISOString() }) };
}

/** Preview for the UI: the file, its problems and the suggested file name. */
exportsApi.get('/competitions/:id/export/swiss-manager', async (c) => {
  const r = await smExport(c);
  if (!r) return c.json({ error: 'Soutěž nenalezena' }, 404);
  return c.json({ file: r.file, issues: r.issues, teams: r.teams, filename: smExportFileName(r.comp.short, r.comp.season) });
});

/** The file itself (scripts, curl with a Bearer token). */
exportsApi.get('/competitions/:id/export/swiss-manager.json', async (c) => {
  const r = await smExport(c);
  if (!r) return c.json({ error: 'Soutěž nenalezena' }, 404);
  return new Response(JSON.stringify(r.file, null, 1), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${smExportFileName(r.comp.short, r.comp.season)}"`,
    },
  });
});

export { exportsApi };

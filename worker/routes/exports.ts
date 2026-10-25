import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { ownedCompetition, type CompetitionRow } from '../lib/db';
import { buildSmExport, smExportFileName, type SmSourceTeam } from '../../shared/export/swissManager';
import type { AppEnv } from '../types';

// Exports for other applications (doc/feat-export-sm.md).
const exportsApi = new Hono<AppEnv>();
exportsApi.use('*', authRequired);

/** Active teams with contacts and the current roster version (struck players included, the builder skips them). */
async function smSource(db: D1Database, comp: CompetitionRow): Promise<SmSourceTeam[]> {
  const [teamRows, contacts, versions, players] = await db.batch([
    db.prepare(`SELECT id, name, club_code, draw_no, position, venue FROM teams WHERE competition_id = ? AND status = 'active' ORDER BY position`).bind(comp.id),
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

async function smExport(c: any) {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return null;
  const teams = await smSource(c.env.DB, comp);
  return { comp, ...buildSmExport({ competition: comp, teams, savedAt: new Date().toISOString() }) };
}

/** Preview for the UI: the file, its problems and the suggested file name. */
exportsApi.get('/competitions/:id/export/swiss-manager', async (c) => {
  const r = await smExport(c);
  if (!r) return c.json({ error: 'Soutěž nenalezena' }, 404);
  return c.json({ file: r.file, issues: r.issues, filename: smExportFileName(r.comp.short, r.comp.season) });
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

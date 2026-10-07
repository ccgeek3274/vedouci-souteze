import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { now } from '../lib/db';
import {
  COMPETITION_FIELDS, planCompetitionImport, planIsNoop, validateCompetitionImport,
  type CompetitionPlan, type ExistingCompetition,
} from '../../shared/import/competition';
import type { AppEnv } from '../types';

const imports = new Hono<AppEnv>();
imports.use('*', authRequired);

async function loadExisting(db: D1Database, ownerId: string, season: string): Promise<ExistingCompetition[]> {
  const [comps, rounds, teams] = await db.batch([
    db.prepare('SELECT * FROM competitions WHERE owner_id = ? AND season = ?').bind(ownerId, season),
    db.prepare('SELECT r.* FROM competition_rounds r JOIN competitions c ON c.id = r.competition_id WHERE c.owner_id = ? AND c.season = ? ORDER BY r.round').bind(ownerId, season),
    db.prepare('SELECT t.id, t.name, t.status, t.position, t.competition_id FROM teams t JOIN competitions c ON c.id = t.competition_id WHERE c.owner_id = ? AND c.season = ? ORDER BY t.position').bind(ownerId, season),
  ]);
  return (comps.results as any[]).map((c) => ({
    id: c.id,
    season: c.season,
    short: c.short,
    fields: Object.fromEntries(COMPETITION_FIELDS.map((f) => [f, c[f]])) as ExistingCompetition['fields'],
    rounds: (rounds.results as any[]).filter((r) => r.competition_id === c.id).map((r) => ({ round: r.round, date: r.date, note: r.note })),
    teams: (teams.results as any[]).filter((t) => t.competition_id === c.id),
  }));
}

function applyStatements(db: D1Database, ownerId: string, season: string, p: CompetitionPlan): D1PreparedStatement[] {
  const t = now();
  const id = p.existingId ?? crypto.randomUUID();
  const stmts: D1PreparedStatement[] = [];
  if (p.action === 'create') {
    const keys = COMPETITION_FIELDS.filter((f) => p.fields[f] !== undefined);
    stmts.push(db.prepare(
      `INSERT INTO competitions (id, owner_id, season, short, ${keys.join(', ')}, created_at, updated_at)
       VALUES (?, ?, ?, ?, ${keys.map(() => '?').join(', ')}, ?, ?)`
    ).bind(id, ownerId, season, p.short, ...keys.map((k) => (k === 'mutual_deadline' && !p.fields[k] ? null : p.fields[k])), t, t));
  } else if (p.fieldChanges.length) {
    stmts.push(db.prepare(`UPDATE competitions SET ${p.fieldChanges.map((f) => `${f.field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...p.fieldChanges.map((f) => f.to), t, id));
  }
  if (p.action === 'create' || p.rounds.replace) {
    stmts.push(db.prepare('DELETE FROM competition_rounds WHERE competition_id = ?').bind(id));
    for (const r of p.rounds.target) {
      stmts.push(db.prepare('INSERT INTO competition_rounds (competition_id, round, date, note) VALUES (?, ?, ?, ?)').bind(id, r.round, r.date, r.note ?? ''));
    }
  }
  const reservePos = 1000;
  for (const team of p.teams ?? []) {
    if (team.action === 'add') {
      stmts.push(db.prepare(
        `INSERT INTO teams (id, competition_id, name, club_name, position, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
      ).bind(crypto.randomUUID(), id, team.name, team.club_name, team.position, t, t));
    } else if (team.action === 'keep') {
      stmts.push(db.prepare(`UPDATE teams SET position = ?, status = 'active', updated_at = ? WHERE id = ?`).bind(team.position, t, team.id));
    } else {
      stmts.push(db.prepare(`UPDATE teams SET status = 'reserve', position = ?, updated_at = ? WHERE id = ?`).bind(reservePos, t, team.id));
    }
  }
  return stmts;
}

/**
 * POST /api/v1/import/competitions?only=RPB,KSA[&apply=true][&filename=…]
 * Body: competition import JSON (doc/import-format.md). Without apply → dry-run plan.
 */
imports.post('/competitions', async (c) => {
  let doc;
  try {
    doc = validateCompetitionImport(await c.req.json());
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const only = c.req.query('only')?.split(',').map((s) => s.trim()).filter(Boolean);
  const userId = c.get('user').id;
  const plans = planCompetitionImport(doc, await loadExisting(c.env.DB, userId, doc.season), only);
  const available = doc.competitions.map((x) => ({ short: x.short.toUpperCase(), name: x.name, teams: x.teams?.length ?? null }));
  if (c.req.query('apply') !== 'true') {
    return c.json({ season: doc.season, source: doc.source ?? null, available, plans: plans.map((p) => ({ ...p, noop: planIsNoop(p) })) });
  }

  const stmts = plans.filter((p) => !planIsNoop(p)).flatMap((p) => applyStatements(c.env.DB, userId, doc.season, p));
  stmts.push(c.env.DB.prepare('INSERT INTO import_log (owner_id, source, filename, summary, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, 'competition-json', c.req.query('filename') ?? doc.source?.document ?? '',
      JSON.stringify({ kind: doc.source?.kind, competitions: plans.map((p) => `${p.short}:${planIsNoop(p) ? 'noop' : p.action}`) }), now()));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, applied: plans.filter((p) => !planIsNoop(p)).map((p) => p.short) });
});

export { imports };

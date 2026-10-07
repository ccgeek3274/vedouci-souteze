import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { CONTACT_ORDER_SQL, now, ownedCompetition, pick, updateStatement, type TeamRow } from '../lib/db';
import { LEVELS } from '../../shared/import/competition';
import type { AppEnv } from '../types';

const competitions = new Hono<AppEnv>();
competitions.use('*', authRequired);

const EDITABLE = [
  'season', 'region', 'level', 'group_code', 'short', 'name', 'boards', 'default_start', 'time_control',
  'manager_name', 'manager_email', 'manager_phone', 'mutual_deadline', 'chesscz_comp_id', 'phase', 'notes',
] as const;
const NUMERIC = ['boards', 'chesscz_comp_id'] as const;
const PHASES = ['preparation', 'draw', 'running', 'finished'];
const TEAM_FIELDS = ['name', 'club_name', 'club_code', 'chesscz_team_id', 'draw_no', 'status', 'venue', 'shoes', 'start_pref', 'draw_requests', 'notes'] as const;
const TEAM_NUMERIC = ['chesscz_team_id', 'draw_no'] as const;

function validate(f: Record<string, unknown>): string | null {
  if ('season' in f && !/^\d{4}\/\d{4}$/.test(String(f.season))) return 'Sezóna musí mít tvar 2026/2027';
  if ('short' in f && !String(f.short)) return 'Zadejte zkratku soutěže (např. RPB)';
  if ('name' in f && !String(f.name)) return 'Zadejte název soutěže';
  if ('level' in f && !LEVELS.includes(f.level as any)) return 'Neplatná úroveň soutěže';
  if ('boards' in f && !(Number(f.boards) >= 1 && Number(f.boards) <= 12)) return 'Počet šachovnic musí být 1–12';
  if ('default_start' in f && !/^\d{1,2}:\d{2}$/.test(String(f.default_start))) return 'Začátek musí mít tvar HH:MM';
  if ('mutual_deadline' in f && f.mutual_deadline && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.mutual_deadline))) return 'Neplatné datum';
  if ('phase' in f && !PHASES.includes(String(f.phase))) return 'Neplatná fáze';
  return null;
}

// List of the user's competitions with team counts.
competitions.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.season, c.short, c.name, c.level, c.phase, c.boards, c.chesscz_comp_id, c.updated_at,
            (SELECT COUNT(*) FROM teams t WHERE t.competition_id = c.id AND t.status = 'active') AS team_count,
            (SELECT COUNT(DISTINCT rv.team_id) FROM roster_versions rv JOIN teams t ON t.id = rv.team_id
              WHERE t.competition_id = c.id AND t.status = 'active') AS roster_count
     FROM competitions c WHERE c.owner_id = ? ORDER BY c.season DESC, c.short`
  ).bind(c.get('user').id).all();
  return c.json({ competitions: results });
});

competitions.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const f = pick(body, EDITABLE, NUMERIC);
  for (const req of ['season', 'short', 'name', 'level'] as const) if (!f[req]) return c.json({ error: `Chybí pole ${req}` }, 400);
  const err = validate(f);
  if (err) return c.json({ error: err }, 400);
  f.short = String(f.short).toUpperCase();
  const dup = await c.env.DB.prepare('SELECT id FROM competitions WHERE owner_id = ? AND season = ? AND short = ?')
    .bind(c.get('user').id, f.season, f.short).first();
  if (dup) return c.json({ error: `Soutěž ${f.short} pro sezónu ${f.season} už existuje` }, 409);

  const id = crypto.randomUUID();
  const keys = Object.keys(f);
  await c.env.DB.prepare(
    `INSERT INTO competitions (id, owner_id, ${keys.join(', ')}, created_at, updated_at)
     VALUES (?, ?, ${keys.map(() => '?').join(', ')}, ?, ?)`
  ).bind(id, c.get('user').id, ...keys.map((k) => (f as any)[k]), now(), now()).run();
  return c.json({ id }, 201);
});

// Full competition: fields, rounds, teams (+contacts, roster summary), requests.
competitions.get('/:id', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const db = c.env.DB;
  const [rounds, teams, contacts, rosters, requests] = await db.batch([
    db.prepare('SELECT round, date, note FROM competition_rounds WHERE competition_id = ? ORDER BY round').bind(comp.id),
    db.prepare('SELECT * FROM teams WHERE competition_id = ? ORDER BY status, position').bind(comp.id),
    db.prepare(
      `SELECT tc.* FROM team_contacts tc JOIN teams t ON t.id = tc.team_id
       WHERE t.competition_id = ? ORDER BY tc.team_id, ${CONTACT_ORDER_SQL.replace(/role|position/g, (m) => `tc.${m}`)}`
    ).bind(comp.id),
    db.prepare(
      `SELECT rv.team_id, rv.version, rv.created_at, rv.source, rv.filename,
              (SELECT COUNT(*) FROM roster_players rp WHERE rp.roster_version_id = rv.id) AS players
       FROM roster_versions rv JOIN teams t ON t.id = rv.team_id
       WHERE t.competition_id = ? AND rv.version = (SELECT MAX(version) FROM roster_versions x WHERE x.team_id = rv.team_id)`
    ).bind(comp.id),
    db.prepare('SELECT * FROM requests WHERE competition_id = ? ORDER BY created_at').bind(comp.id),
  ]);
  const byTeam = (rows: any[]) => rows.reduce((m, r) => ((m[r.team_id] ??= []).push(r), m), {} as Record<string, any[]>);
  const contactsByTeam = byTeam(contacts.results);
  const rosterByTeam = Object.fromEntries(rosters.results.map((r: any) => [r.team_id, r]));
  return c.json({
    competition: comp,
    rounds: rounds.results,
    teams: (teams.results as TeamRow[]).map((t) => ({ ...t, contacts: contactsByTeam[t.id] ?? [], roster: rosterByTeam[t.id] ?? null })),
    requests: requests.results,
  });
});

competitions.patch('/:id', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const f = pick(await c.req.json<Record<string, unknown>>().catch(() => null), EDITABLE, NUMERIC);
  const err = validate(f);
  if (err) return c.json({ error: err }, 400);
  if (f.short) f.short = String(f.short).toUpperCase();
  if (!Object.keys(f).length) return c.json({ error: 'Nic ke změně' }, 400);
  await updateStatement(c.env.DB, 'competitions', comp.id, f as Record<string, string | number | null>).run();
  return c.json({ ok: true });
});

competitions.delete('/:id', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM competitions WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), c.get('user').id).run();
  if (!r.meta.changes) return c.json({ error: 'Soutěž nenalezena' }, 404);
  return c.json({ ok: true });
});

// Replace the round calendar.
competitions.put('/:id/rounds', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const body = await c.req.json<{ rounds?: { round: number; date: string; note?: string }[] }>().catch(() => null);
  const rounds = body?.rounds;
  if (!Array.isArray(rounds) || rounds.some((r) => !Number.isInteger(r.round) || r.round < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(r.date))) {
    return c.json({ error: 'Kola musí mít číslo a datum (YYYY-MM-DD)' }, 400);
  }
  if (new Set(rounds.map((r) => r.round)).size !== rounds.length) return c.json({ error: 'Duplicitní číslo kola' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM competition_rounds WHERE competition_id = ?').bind(comp.id),
    ...rounds.map((r) => c.env.DB.prepare('INSERT INTO competition_rounds (competition_id, round, date, note) VALUES (?, ?, ?, ?)')
      .bind(comp.id, r.round, r.date, (r.note ?? '').trim())),
  ]);
  return c.json({ ok: true });
});

// Add a team at the end of the active list.
competitions.post('/:id/teams', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const f = pick(await c.req.json<Record<string, unknown>>().catch(() => null), TEAM_FIELDS, TEAM_NUMERIC);
  if (!f.name) return c.json({ error: 'Zadejte název družstva' }, 400);
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM teams WHERE competition_id = ?').bind(comp.id).first<{ m: number }>();
  const id = crypto.randomUUID();
  const keys = Object.keys(f).filter((k) => k !== 'status');
  await c.env.DB.prepare(
    `INSERT INTO teams (id, competition_id, position, status, ${keys.join(', ')}, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ${keys.map(() => '?').join(', ')}, ?, ?)`
  ).bind(id, comp.id, (max?.m ?? 0) + 1, ...keys.map((k) => (f as any)[k]), now(), now()).run();
  return c.json({ id }, 201);
});

// Reorder active teams: body { order: [teamId, …] } → positions 1..n.
competitions.put('/:id/teams/order', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const body = await c.req.json<{ order?: string[] }>().catch(() => null);
  if (!Array.isArray(body?.order)) return c.json({ error: 'Chybí pořadí' }, 400);
  await c.env.DB.batch(body!.order.map((teamId, i) =>
    c.env.DB.prepare('UPDATE teams SET position = ?, updated_at = ? WHERE id = ? AND competition_id = ?').bind(i + 1, now(), teamId, comp.id)));
  return c.json({ ok: true });
});

export { competitions, TEAM_FIELDS, TEAM_NUMERIC };

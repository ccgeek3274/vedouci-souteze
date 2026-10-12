import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { now, ownedCompetition } from '../lib/db';
import { tableSize, type ConstraintKind } from '../../shared/draw/check';
import type { AppEnv } from '../types';

// Draw meeting (M7): conditions of the controlled draw and the draw numbers.
const draw = new Hono<AppEnv>();
draw.use('*', authRequired);

const KINDS: ConstraintKind[] = ['draw_no', 'home', 'away', 'meet', 'alternate', 'same'];
const int = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);

draw.post('/competitions/:id/constraints', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b) return c.json({ error: 'Neplatná data' }, 400);
  const kind = String(b.kind) as ConstraintKind;
  if (!KINDS.includes(kind)) return c.json({ error: 'Neplatný druh podmínky' }, 400);
  const { results: teams } = await c.env.DB.prepare("SELECT id FROM teams WHERE competition_id = ? AND status = 'active'").bind(comp.id).all<{ id: string }>();
  const ids = new Set(teams.map((t) => t.id));
  const size = tableSize(teams.length);
  const teamId = String(b.team_id ?? '');
  const other = b.other_team_id ? String(b.other_team_id) : null;
  const [round, value, extNo, extTeams] = [int(b.round), int(b.value), int(b.ext_no), int(b.ext_teams)];
  const extName = String(b.ext_name ?? '').trim();
  if (!ids.has(teamId)) return c.json({ error: 'Vyberte družstvo této soutěže' }, 400);
  if (other && (!ids.has(other) || other === teamId)) return c.json({ error: 'Vyberte jiné družstvo této soutěže' }, 400);
  if ([round, value, extNo, extTeams].some(Number.isNaN)) return c.json({ error: 'Čísla musí být celá' }, 400);
  if (kind === 'draw_no' && !(value! >= 1 && value! <= size)) return c.json({ error: `Losovací číslo musí být 1–${size}` }, 400);
  if (['home', 'away', 'meet'].includes(kind) && !(round! >= 1 && round! <= size - 1)) return c.json({ error: `Kolo musí být 1–${size - 1}` }, 400);
  if (kind === 'meet' && !other) return c.json({ error: 'Vyberte soupeře' }, 400);
  if ((kind === 'alternate' || kind === 'same') && !other) {
    if (!(extTeams! >= 2 && extTeams! <= 30)) return c.json({ error: 'Zadejte počet družstev druhé soutěže' }, 400);
    if (!(extNo! >= 1 && extNo! <= tableSize(extTeams!))) return c.json({ error: 'Zadejte losovací číslo družstva v druhé soutěži' }, 400);
  }
  const ext = (kind === 'alternate' || kind === 'same') && !other;
  await c.env.DB.prepare(
    `INSERT INTO draw_constraints (competition_id, team_id, kind, round, value, other_team_id, ext_name, ext_no, ext_teams, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    comp.id, teamId, kind,
    ['home', 'away', 'meet'].includes(kind) ? round : null,
    kind === 'draw_no' ? value : null,
    ['meet', 'alternate', 'same'].includes(kind) ? other : null,
    ext ? extName : '', ext ? extNo : null, ext ? extTeams : null,
    String(b.note ?? '').trim(), now(),
  ).run();
  return c.json({ ok: true }, 201);
});

draw.delete('/constraints/:cid', async (c) => {
  const r = await c.env.DB.prepare(
    `DELETE FROM draw_constraints WHERE id = ? AND competition_id IN (SELECT id FROM competitions WHERE owner_id = ?)`
  ).bind(c.req.param('cid'), c.get('user').id).run();
  if (!r.meta.changes) return c.json({ error: 'Podmínka nenalezena' }, 404);
  return c.json({ ok: true });
});

// Draw numbers of all active teams at once: { numbers: { teamId: number | null } }.
draw.put('/competitions/:id/draw-numbers', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const b = await c.req.json<{ numbers?: Record<string, unknown> }>().catch(() => null);
  if (!b?.numbers || typeof b.numbers !== 'object') return c.json({ error: 'Chybí čísla' }, 400);
  const { results: teams } = await c.env.DB.prepare("SELECT id FROM teams WHERE competition_id = ? AND status = 'active'").bind(comp.id).all<{ id: string }>();
  const size = tableSize(teams.length);
  const ids = new Set(teams.map((t) => t.id));
  const entries = Object.entries(b.numbers).filter(([id]) => ids.has(id)).map(([id, v]) => [id, int(v)] as const);
  if (entries.some(([, v]) => v !== null && !(v >= 1 && v <= size))) return c.json({ error: `Losovací čísla musí být 1–${size}` }, 400);
  if (!entries.length) return c.json({ ok: true });
  await c.env.DB.batch(entries.map(([id, v]) => c.env.DB.prepare('UPDATE teams SET draw_no = ?, updated_at = ? WHERE id = ?').bind(v, now(), id)));
  return c.json({ ok: true });
});

export { draw };

import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { now, ownedCompetition } from '../lib/db';
import { tableSize } from '../../shared/draw/check';
import type { AppEnv } from '../types';

// Draw meeting (M7): draw numbers (conditions are draw requests, see routes/teams.ts).
const draw = new Hono<AppEnv>();
draw.use('*', authRequired);

const int = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);

// Draw numbers (some or all active teams): { numbers: { teamId: number | null } }; numbers stay unique.
draw.put('/competitions/:id/draw-numbers', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const b = await c.req.json<{ numbers?: Record<string, unknown> }>().catch(() => null);
  if (!b?.numbers || typeof b.numbers !== 'object') return c.json({ error: 'Chybí čísla' }, 400);
  const { results: teams } = await c.env.DB.prepare("SELECT id, name, draw_no FROM teams WHERE competition_id = ? AND status = 'active'").bind(comp.id).all<{ id: string; name: string; draw_no: number | null }>();
  const size = tableSize(teams.length);
  const ids = new Set(teams.map((t) => t.id));
  const entries = Object.entries(b.numbers).filter(([id]) => ids.has(id)).map(([id, v]) => [id, int(v)] as const);
  if (entries.some(([, v]) => v !== null && !(v >= 1 && v <= size))) return c.json({ error: `Losovací čísla musí být 1–${size}` }, 400);
  if (!entries.length) return c.json({ ok: true });
  const after = new Map(teams.map((t) => [t.id, t.draw_no]));
  for (const [id, v] of entries) after.set(id, v);
  const holder = new Map<number, string>();
  for (const t of teams) {
    const v = after.get(t.id);
    if (v == null) continue;
    if (holder.has(v)) return c.json({ error: `Číslo ${v} už má ${holder.get(v)}` }, 409);
    holder.set(v, t.name);
  }
  await c.env.DB.batch(entries.map(([id, v]) => c.env.DB.prepare('UPDATE teams SET draw_no = ?, updated_at = ? WHERE id = ?').bind(v, now(), id)));
  return c.json({ ok: true });
});

export { draw };

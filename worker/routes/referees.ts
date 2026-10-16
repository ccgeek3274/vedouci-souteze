import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { ownedCompetition } from '../lib/db';
import type { AppEnv } from '../types';

// Referee assignments (karta Nasazení rozhodčích): { "<round>:<home team key>": name }. The whole map is replaced
// on save; the bulletins and the public schedule read it.
const referees = new Hono<AppEnv>();
referees.use('*', authRequired);

const KEY_RE = /^(\d{1,2}):([\w:-]{1,64})$/;
const MAX_ASSIGNMENTS = 500;

referees.get('/competitions/:id/referees', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const { results } = await c.env.DB.prepare('SELECT round, home_key, name FROM referee_assignments WHERE competition_id = ?')
    .bind(comp.id).all<{ round: number; home_key: string; name: string }>();
  return c.json({ assignments: Object.fromEntries(results.map((r) => [`${r.round}:${r.home_key}`, r.name])) });
});

referees.put('/competitions/:id/referees', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const b = await c.req.json<{ assignments?: unknown }>().catch(() => null);
  const a = b?.assignments;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return c.json({ error: 'Chybí nasazení rozhodčích' }, 400);
  const rows: [number, string, string][] = [];
  for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
    const m = KEY_RE.exec(k);
    const name = String(v ?? '').trim().slice(0, 100);
    if (!m) return c.json({ error: `Neplatné utkání: ${k}` }, 400);
    if (name) rows.push([Number(m[1]), m[2], name]);
  }
  if (rows.length > MAX_ASSIGNMENTS) return c.json({ error: 'Příliš mnoho utkání' }, 413);
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM referee_assignments WHERE competition_id = ?').bind(comp.id),
    ...rows.map(([round, key, name]) => db.prepare('INSERT INTO referee_assignments (competition_id, round, home_key, name) VALUES (?, ?, ?, ?)')
      .bind(comp.id, round, key, name)),
  ]);
  return c.json({ ok: true });
});

export { referees };

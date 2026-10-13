import { Hono, type Context } from 'hono';
import { authRequired } from '../middleware/auth';
import { now, ownedCompetition } from '../lib/db';
import type { AppEnv } from '../types';

// Bulletin drafts (M8/M9): the config JSON (texts, referees, options) and its save points.
// The documents themselves are generated in the browser from chess.cz + app data and never stored.
const bulletins = new Hono<AppEnv>();
bulletins.use('*', authRequired);

const KEY_RE = /^(initial|round-\d{1,2})$/;
const MAX_CONFIG = 200_000;

type Ctx = Context<AppEnv>;

async function target(c: Ctx) {
  const key = c.req.param('key') ?? '';
  if (!KEY_RE.test(key)) return null;
  const comp = await ownedCompetition(c, c.req.param('id') ?? '');
  return comp ? { comp, key } : null;
}

const parse = (s: string | null | undefined) => {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
};

bulletins.get('/competitions/:id/bulletins/:key', async (c) => {
  const t = await target(c);
  if (!t) return c.json({ error: 'Zpravodaj nenalezen' }, 404);
  const row = await c.env.DB.prepare('SELECT config, updated_at FROM bulletins WHERE competition_id = ? AND key = ?')
    .bind(t.comp.id, t.key).first<{ config: string; updated_at: number }>();
  const { results } = await c.env.DB.prepare(
    'SELECT id, label, created_at FROM bulletin_savepoints WHERE competition_id = ? AND key = ? ORDER BY created_at DESC, id DESC'
  ).bind(t.comp.id, t.key).all();
  return c.json({ config: parse(row?.config), updated_at: row?.updated_at ?? null, savepoints: results });
});

bulletins.put('/competitions/:id/bulletins/:key', async (c) => {
  const t = await target(c);
  if (!t) return c.json({ error: 'Zpravodaj nenalezen' }, 404);
  const b = await c.req.json<{ config?: unknown }>().catch(() => null);
  if (!b?.config || typeof b.config !== 'object') return c.json({ error: 'Chybí nastavení zpravodaje' }, 400);
  const json = JSON.stringify(b.config);
  if (json.length > MAX_CONFIG) return c.json({ error: 'Nastavení zpravodaje je příliš velké' }, 413);
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO bulletins (competition_id, key, config, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (competition_id, key) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`
  ).bind(t.comp.id, t.key, json, ts).run();
  return c.json({ ok: true, updated_at: ts });
});

// Save point = copy of the current saved config under a label.
bulletins.post('/competitions/:id/bulletins/:key/savepoints', async (c) => {
  const t = await target(c);
  if (!t) return c.json({ error: 'Zpravodaj nenalezen' }, 404);
  const b = await c.req.json<{ label?: unknown }>().catch(() => ({} as { label?: unknown }));
  const row = await c.env.DB.prepare('SELECT config FROM bulletins WHERE competition_id = ? AND key = ?')
    .bind(t.comp.id, t.key).first<{ config: string }>();
  if (!row) return c.json({ error: 'Koncept zatím není uložen' }, 400);
  const label = String(b?.label ?? '').trim().slice(0, 100);
  const r = await c.env.DB.prepare('INSERT INTO bulletin_savepoints (competition_id, key, label, config, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(t.comp.id, t.key, label, row.config, now()).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

// Restore: the current config is kept as an automatic save point first, so a restore can be undone.
bulletins.post('/competitions/:id/bulletins/:key/savepoints/:sp/restore', async (c) => {
  const t = await target(c);
  if (!t) return c.json({ error: 'Zpravodaj nenalezen' }, 404);
  const sp = await c.env.DB.prepare('SELECT config, label, created_at FROM bulletin_savepoints WHERE id = ? AND competition_id = ? AND key = ?')
    .bind(Number(c.req.param('sp')), t.comp.id, t.key).first<{ config: string; label: string; created_at: number }>();
  if (!sp) return c.json({ error: 'Save point nenalezen' }, 404);
  const cur = await c.env.DB.prepare('SELECT config FROM bulletins WHERE competition_id = ? AND key = ?')
    .bind(t.comp.id, t.key).first<{ config: string }>();
  const ts = now();
  const stmts = [];
  if (cur && cur.config !== sp.config) {
    stmts.push(c.env.DB.prepare('INSERT INTO bulletin_savepoints (competition_id, key, label, config, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(t.comp.id, t.key, 'před obnovením', cur.config, ts));
  }
  stmts.push(c.env.DB.prepare(
    `INSERT INTO bulletins (competition_id, key, config, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (competition_id, key) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`
  ).bind(t.comp.id, t.key, sp.config, ts));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, config: parse(sp.config), updated_at: ts });
});

bulletins.delete('/competitions/:id/bulletins/:key/savepoints/:sp', async (c) => {
  const t = await target(c);
  if (!t) return c.json({ error: 'Zpravodaj nenalezen' }, 404);
  await c.env.DB.prepare('DELETE FROM bulletin_savepoints WHERE id = ? AND competition_id = ? AND key = ?')
    .bind(Number(c.req.param('sp')), t.comp.id, t.key).run();
  return c.json({ ok: true });
});

export { bulletins };

import { Hono, type Context } from 'hono';
import { authRequired } from '../middleware/auth';
import { now, ownedCompetition } from '../lib/db';
import type { AppEnv } from '../types';

// Bulletin drafts (M8/M9): the config JSON (texts, options) and its save points.
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

/**
 * A save point = the draft config + optionally `snapshot` (data frozen only in save points, e.g. the standings and
 * referees of a zpravodaj z kola). The draft itself never keeps a snapshot.
 */
const withSnapshot = (config: string, snapshot: unknown) =>
  snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? JSON.stringify({ ...parse(config), snapshot }) : config;
const withoutSnapshot = (config: string) => {
  const o = parse(config);
  if (!o || typeof o !== 'object' || !('snapshot' in o)) return config;
  const { snapshot: _, ...rest } = o;
  return JSON.stringify(rest);
};

// Keys of the stored drafts (the bulletin switcher marks them).
bulletins.get('/competitions/:id/bulletins', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id') ?? '');
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const { results } = await c.env.DB.prepare('SELECT key, updated_at FROM bulletins WHERE competition_id = ? ORDER BY key')
    .bind(comp.id).all<{ key: string; updated_at: number }>();
  return c.json({ bulletins: results });
});

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

// Save point = copy of the current saved config under a label (+ the snapshot sent by the page).
bulletins.post('/competitions/:id/bulletins/:key/savepoints', async (c) => {
  const t = await target(c);
  if (!t) return c.json({ error: 'Zpravodaj nenalezen' }, 404);
  const b = await c.req.json<{ label?: unknown; snapshot?: unknown }>().catch(() => ({} as { label?: unknown; snapshot?: unknown }));
  const row = await c.env.DB.prepare('SELECT config FROM bulletins WHERE competition_id = ? AND key = ?')
    .bind(t.comp.id, t.key).first<{ config: string }>();
  if (!row) return c.json({ error: 'Koncept zatím není uložen' }, 400);
  const label = String(b?.label ?? '').trim().slice(0, 100);
  const config = withSnapshot(row.config, b?.snapshot);
  if (config.length > MAX_CONFIG) return c.json({ error: 'Save point je příliš velký' }, 413);
  const r = await c.env.DB.prepare('INSERT INTO bulletin_savepoints (competition_id, key, label, config, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(t.comp.id, t.key, label, config, now()).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

// Restore: the current config is kept as an automatic save point first (with the snapshot of what the page shows now),
// so a restore can be undone. The draft gets the config without the snapshot; the page takes it from the response.
bulletins.post('/competitions/:id/bulletins/:key/savepoints/:sp/restore', async (c) => {
  const t = await target(c);
  if (!t) return c.json({ error: 'Zpravodaj nenalezen' }, 404);
  const b = await c.req.json<{ snapshot?: unknown }>().catch(() => ({} as { snapshot?: unknown }));
  const sp = await c.env.DB.prepare('SELECT config, label, created_at FROM bulletin_savepoints WHERE id = ? AND competition_id = ? AND key = ?')
    .bind(Number(c.req.param('sp')), t.comp.id, t.key).first<{ config: string; label: string; created_at: number }>();
  if (!sp) return c.json({ error: 'Save point nenalezen' }, 404);
  const cur = await c.env.DB.prepare('SELECT config FROM bulletins WHERE competition_id = ? AND key = ?')
    .bind(t.comp.id, t.key).first<{ config: string }>();
  const ts = now();
  const stmts = [];
  const draft = withoutSnapshot(sp.config);
  const backup = cur ? withSnapshot(cur.config, b?.snapshot) : null;
  if (backup && backup !== sp.config && backup.length <= MAX_CONFIG) {
    stmts.push(c.env.DB.prepare('INSERT INTO bulletin_savepoints (competition_id, key, label, config, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(t.comp.id, t.key, 'před obnovením', backup, ts));
  }
  stmts.push(c.env.DB.prepare(
    `INSERT INTO bulletins (competition_id, key, config, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (competition_id, key) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`
  ).bind(t.comp.id, t.key, draft, ts));
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

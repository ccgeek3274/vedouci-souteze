import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { now, ownedCompetition } from '../lib/db';
import type { AppEnv } from '../types';

// Referee nominations (karta Nominace rozhodčích): { "<round>:<home team key>": name }. Every save replaces the whole
// map and creates a new version (referee_versions); the bulletins and the public schedule read referee_assignments.
const referees = new Hono<AppEnv>();
referees.use('*', authRequired);

const KEY_RE = /^(\d{1,2}):([\w:-]{1,64})$/;
const MAX_ASSIGNMENTS = 500;
const SOURCES = ['manual', 'auto', 'clear', 'restore', 'names'] as const;

type Assignments = Record<string, string>;
const sameMap = (a: Assignments, b: Assignments) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => b[k] === a[k]);
};

referees.get('/competitions/:id/referees', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const db = c.env.DB;
  const [cur, versions, sps] = await db.batch([
    db.prepare('SELECT round, home_key, name FROM referee_assignments WHERE competition_id = ?').bind(comp.id),
    db.prepare(`SELECT version, source, created_at, (SELECT count(*) FROM json_each(assignments)) AS count
                FROM referee_versions WHERE competition_id = ? ORDER BY version DESC`).bind(comp.id),
    db.prepare(`SELECT label, created_at FROM bulletin_savepoints WHERE competition_id = ? AND key = 'initial'
                ORDER BY created_at DESC, id DESC`).bind(comp.id),
  ]);
  const vs = versions.results as { version: number; source: string; created_at: number; count: number }[];
  const sp = sps.results as { label: string; created_at: number }[];
  return c.json({
    assignments: Object.fromEntries((cur.results as { round: number; home_key: string; name: string }[]).map((r) => [`${r.round}:${r.home_key}`, r.name])),
    version: vs[0]?.version ?? 0,
    versions: vs,
    // the úvodní zpravodaj takes the referees from here — the page warns before changes once it has a save point
    initialSavepoints: { count: sp.length, last: sp[0] ?? null },
  });
});

referees.get('/competitions/:id/referees/versions/:v', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const row = await c.env.DB.prepare('SELECT version, source, assignments, created_at FROM referee_versions WHERE competition_id = ? AND version = ?')
    .bind(comp.id, Number(c.req.param('v'))).first<{ version: number; source: string; assignments: string; created_at: number }>();
  if (!row) return c.json({ error: 'Verze nenalezena' }, 404);
  return c.json({ ...row, assignments: JSON.parse(row.assignments) as Assignments });
});

// Body { assignments, source, base }: base = the version the edit started from (409 when it changed meanwhile).
referees.put('/competitions/:id/referees', async (c) => {
  const comp = await ownedCompetition(c, c.req.param('id'));
  if (!comp) return c.json({ error: 'Soutěž nenalezena' }, 404);
  const b = await c.req.json<{ assignments?: unknown; source?: unknown; base?: unknown }>().catch(() => null);
  const a = b?.assignments;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return c.json({ error: 'Chybí nominace rozhodčích' }, 400);
  const source = SOURCES.find((s) => s === b?.source) ?? 'manual';
  const rows: [number, string, string][] = [];
  for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
    const m = KEY_RE.exec(k);
    const name = String(v ?? '').trim().slice(0, 100);
    if (!m) return c.json({ error: `Neplatné utkání: ${k}` }, 400);
    if (name) rows.push([Number(m[1]), m[2], name]);
  }
  if (rows.length > MAX_ASSIGNMENTS) return c.json({ error: 'Příliš mnoho utkání' }, 413);
  const next: Assignments = Object.fromEntries(rows.map(([r, k, n]) => [`${r}:${k}`, n]));

  const db = c.env.DB;
  const last = await db.prepare('SELECT version, assignments FROM referee_versions WHERE competition_id = ? ORDER BY version DESC LIMIT 1')
    .bind(comp.id).first<{ version: number; assignments: string }>();
  const current = last?.version ?? 0;
  if (typeof b?.base === 'number' && b.base !== current) {
    return c.json({ error: 'Nominace mezitím změnil někdo jiný (jiné okno) — načtěte stránku znovu' }, 409);
  }
  if (sameMap(last ? JSON.parse(last.assignments) : {}, next)) return c.json({ ok: true, version: current, unchanged: true });
  const version = current + 1;
  await db.batch([
    db.prepare('DELETE FROM referee_assignments WHERE competition_id = ?').bind(comp.id),
    ...rows.map(([round, key, name]) => db.prepare('INSERT INTO referee_assignments (competition_id, round, home_key, name) VALUES (?, ?, ?, ?)')
      .bind(comp.id, round, key, name)),
    db.prepare('INSERT INTO referee_versions (competition_id, version, source, assignments, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(comp.id, version, source, JSON.stringify(next), c.get('user').id, now()),
  ]);
  return c.json({ ok: true, version, unchanged: false });
});

export { referees };

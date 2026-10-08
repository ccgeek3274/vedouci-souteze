import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { registryGet, rosterCheckSource, SOURCES } from '../lib/registry';
import type { ForeignerRow, HostingRow, RosterCheckSection } from '../../shared/registry';
import type { AppEnv } from '../types';

// ŠSČR registries without API (M6): hosting permits, foreigner registrations, chess.cz roster check page.
const registry = new Hono<AppEnv>();
registry.use('*', authRequired);

/** GET /registry?season=2026/2027 → confirmed + pending hosting permits and foreigner registrations of the season. */
registry.get('/', async (c) => {
  const season = c.req.query('season') ?? '';
  const refresh = c.req.query('refresh') === 'true';
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  let fetchedAt = Date.now();
  for (const [key, src] of Object.entries(SOURCES)) {
    const r = await registryGet<(HostingRow | ForeignerRow)[]>(c.env.DB, key, src, refresh);
    if ('error' in r) { errors.push(r.error); out[key] = []; continue; }
    out[key] = season ? r.data.filter((x) => x.season === season) : r.data;
    fetchedAt = Math.min(fetchedAt, r.fetchedAt);
  }
  return c.json({
    hosting: [...(out['hosting:confirmed'] as HostingRow[]), ...(out['hosting:unconfirmed'] as HostingRow[])],
    foreigners: [...(out['foreigners:confirmed'] as ForeignerRow[]), ...(out['foreigners:unconfirmed'] as ForeignerRow[])],
    fetchedAt,
    errors,
  });
});

/** GET /registry/roster-check?org=12 → sections of chess.cz/kontrola-soupisek for the organizer (svaz). */
registry.get('/roster-check', async (c) => {
  const org = Number(c.req.query('org'));
  if (!Number.isInteger(org) || org <= 0 || org > 999) return c.json({ error: 'Neplatný svaz' }, 400);
  const r = await registryGet<RosterCheckSection[]>(c.env.DB, `chesscz-roster-check:${org}`, rosterCheckSource(org), c.req.query('refresh') === 'true');
  if ('error' in r) return c.json({ error: r.error }, 503);
  return c.json(r);
});

export { registry };

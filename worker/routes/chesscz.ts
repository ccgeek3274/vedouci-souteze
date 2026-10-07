import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { chessczGet } from '../lib/chesscz';
import type { AppEnv } from '../types';

// GET /api/v1/chesscz/<upstream path>[?search=…][&refresh=true] — whitelisted pass-through (lib/chesscz.ts).
const chesscz = new Hono<AppEnv>();

chesscz.get('/*', authRequired, async (c) => {
  const url = new URL(c.req.url);
  let path = url.pathname.replace(/^\/api\/v1\/chesscz/, '');
  const search = url.searchParams.get('search');
  if (search) path += `?search=${encodeURIComponent(search.trim())}`;
  const r = await chessczGet(c.env.DB, path, url.searchParams.get('refresh') === 'true');
  return c.json(r.body, r.status);
});

export { chesscz };

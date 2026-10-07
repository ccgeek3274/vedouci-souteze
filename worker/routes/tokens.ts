import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { generateApiToken, hashApiToken } from '../lib/apiToken';
import type { AppEnv } from '../types';

// Personal API tokens for Claude Code skills / scripts. The plain token is shown exactly once.
const tokens = new Hono<AppEnv>();
tokens.use('*', authRequired);

tokens.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(c.get('user').id).all();
  return c.json({ tokens: results });
});

tokens.post('/', async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => null);
  const name = body?.name?.trim().slice(0, 80) || 'Claude Code';
  const token = generateApiToken();
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, c.get('user').id, name, await hashApiToken(token), Math.floor(Date.now() / 1000)).run();
  return c.json({ id, name, token }, 201);
});

tokens.delete('/:id', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('user').id).run();
  if (!r.meta.changes) return c.json({ error: 'Token nenalezen' }, 404);
  return c.json({ ok: true });
});

export { tokens };

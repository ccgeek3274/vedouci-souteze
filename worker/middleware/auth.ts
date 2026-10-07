import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { verifyJwt } from '../lib/jwt';
import type { AppEnv, User } from '../types';

export const USER_COLUMNS = 'id, email, name, avatar_url, role, status, created_at';

// Browser sessions use the httpOnly `token` cookie (SPA and API share one origin).
// The Authorization: Bearer header is accepted too, for scripts and Claude Code skills.
async function resolveUser(c: Context<AppEnv>): Promise<{ user: User | null; error?: { msg: string; code: 401 | 403 } }> {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : getCookie(c, 'token');

  if (!token) {
    return { user: null, error: { msg: 'Nepřihlášen', code: 401 } };
  }

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return { user: null, error: { msg: 'Neplatný nebo expirovaný token', code: 401 } };
  }
  c.set('jwtPayload', payload);

  const user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(payload.sub).first<User>();

  if (!user) {
    return { user: null, error: { msg: 'Uživatel nenalezen', code: 401 } };
  }
  if (user.status === 'blocked') {
    return { user: null, error: { msg: 'Účet byl zablokován', code: 403 } };
  }
  if (user.status !== 'active') {
    return { user: null, error: { msg: 'Účet čeká na schválení správcem', code: 403 } };
  }
  return { user };
}

export const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  const { user, error } = await resolveUser(c);
  if (!user) {
    return c.json({ error: error!.msg }, error!.code);
  }
  c.set('user', user);
  await next();
});

// Must run after authRequired (relies on c.get('user')).
export const adminRequired = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user')?.role !== 'admin') {
    return c.json({ error: 'Vyžaduje oprávnění správce' }, 403);
  }
  await next();
});

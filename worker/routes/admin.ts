import { Hono } from 'hono';
import { authRequired, adminRequired, USER_COLUMNS } from '../middleware/auth';
import { hashPassword } from '../lib/password';
import type { AppEnv } from '../types';

const admin = new Hono<AppEnv>();

admin.use('*', authRequired, adminRequired);

const VALID_STATUSES = ['pending', 'active', 'blocked'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

admin.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS}, (password_hash IS NOT NULL) AS has_password
     FROM users ORDER BY created_at DESC`
  ).all();
  return c.json({ users: results });
});

// Create a local (email + password) account. No self-registration exists;
// admin-created accounts are active immediately.
admin.post('/users', async (c) => {
  const body = await c.req.json<{ email?: string; name?: string; password?: string }>().catch(() => null);
  const email = body?.email?.trim();
  const name = body?.name?.trim();
  const password = body?.password;

  if (!email || !EMAIL_RE.test(email)) {
    return c.json({ error: 'Zadejte platný e-mail' }, 400);
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků` }, 400);
  }
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').bind(email).first();
  if (existing) {
    return c.json({ error: 'Uživatel s tímto e-mailem už existuje' }, 409);
  }

  const id = `local-${crypto.randomUUID()}`;
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, avatar_url, role, status, password_hash, created_at)
     VALUES (?, ?, ?, NULL, 'user', 'active', ?, ?)`
  ).bind(id, email, name || email.split('@')[0], await hashPassword(password), Math.floor(Date.now() / 1000)).run();

  const user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(id).first();
  return c.json({ user }, 201);
});

// Change status (approve / block / unblock).
admin.patch('/users/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string }>().catch(() => null);
  const status = body?.status;

  if (!status || !VALID_STATUSES.includes(status as any)) {
    return c.json({ error: 'Neplatný stav' }, 400);
  }
  if (id === c.get('user').id) {
    return c.json({ error: 'Nemůžete měnit stav vlastního účtu' }, 400);
  }
  const result = await c.env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, id).run();
  if (!result.meta.changes) {
    return c.json({ error: 'Uživatel nenalezen' }, 404);
  }
  const user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(id).first();
  return c.json({ user });
});

// Set / reset a user's password (no email infrastructure — admin hands it over in person).
admin.post('/users/:id/password', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ password?: string }>().catch(() => null);
  const password = body?.password;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků` }, 400);
  }
  const result = await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(await hashPassword(password), id).run();
  if (!result.meta.changes) {
    return c.json({ error: 'Uživatel nenalezen' }, 404);
  }
  return c.json({ ok: true });
});

// Delete a user. Owned data goes with it via ON DELETE CASCADE (D1 enforces foreign keys).
admin.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  if (id === c.get('user').id) {
    return c.json({ error: 'Nemůžete smazat vlastní účet' }, 400);
  }
  const result = await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  if (!result.meta.changes) {
    return c.json({ error: 'Uživatel nenalezen' }, 404);
  }
  return c.json({ ok: true });
});

export { admin };

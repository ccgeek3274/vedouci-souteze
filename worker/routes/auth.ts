import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { signJwt, TOKEN_TTL_DAYS } from '../lib/jwt';
import { notifyAdmin } from '../lib/notify';
import { verifyPassword } from '../lib/password';
import { authRequired, USER_COLUMNS } from '../middleware/auth';
import type { AppEnv, User } from '../types';

const auth = new Hono<AppEnv>();

const TOKEN_MAX_AGE = TOKEN_TTL_DAYS * 86400;

// SPA and API share one origin, so a plain first-party cookie works in production too
// (pgn-base needed the #token= hash dance only because its API lived on another host).
function cookieOpts(c: Context<AppEnv>, maxAge: number) {
  return {
    httpOnly: true,
    secure: isProduction(c),
    sameSite: 'Lax',
    maxAge,
    path: '/',
  } as const;
}

async function issueSession(c: Context<AppEnv>, user: Pick<User, 'id' | 'email' | 'name' | 'role'>) {
  const jwt = await signJwt({ sub: user.id, email: user.email, name: user.name, role: user.role }, c.env.JWT_SECRET);
  setCookie(c, 'token', jwt, cookieOpts(c, TOKEN_MAX_AGE));
  return jwt;
}

// Google OAuth — redirect to Google
auth.get('/google', (c) => {
  const state = crypto.randomUUID();
  setCookie(c, 'oauth_state', state, cookieOpts(c, 300));

  // No access_type=offline / prompt=consent: the profile is read once, no refresh token is stored.
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin(c)}/api/v1/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Google OAuth — callback
auth.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const storedState = getCookie(c, 'oauth_state');
  deleteCookie(c, 'oauth_state', { path: '/' });

  if (!code || !state || state !== storedState) {
    return c.redirect('/login#error=invalid_state');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin(c)}/api/v1/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    return c.redirect('/login#error=token_exchange_failed');
  }
  const tokens = await tokenRes.json<{ access_token: string }>();

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) {
    return c.redirect('/login#error=profile_fetch_failed');
  }
  const profile = await profileRes.json<{ id: string; email: string; name: string; picture?: string }>();

  // New accounts start as 'pending' unless listed in ADMIN_EMAILS;
  // status/role of existing accounts are never touched by login.
  const now = Math.floor(Date.now() / 1000);
  const userId = `google-${profile.id}`;
  const adminEmails = (c.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminEmails.includes(profile.email.toLowerCase());

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, avatar_url, role, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       avatar_url = excluded.avatar_url`
  ).bind(
    userId, profile.email, profile.name, profile.picture ?? null,
    isAdmin ? 'admin' : 'user', isAdmin ? 'active' : 'pending', now
  ).run();

  if (!existing && !isAdmin) {
    c.executionCtx.waitUntil(notifyAdmin(
      c.env.NTFY_TOPIC,
      'Vedoucí soutěže: nový uživatel čeká na schválení',
      `${profile.name} (${profile.email})`,
      `${origin(c)}/admin`
    ));
  }

  const user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(userId).first<User>();
  if (user!.status !== 'active') {
    return c.redirect(`/login#error=${user!.status === 'blocked' ? 'blocked' : 'pending'}`);
  }

  await issueSession(c, user!);
  return c.redirect('/');
});

// Email + password login — only for admin-created accounts (password_hash set).
// There is no self-registration; the error never reveals whether the email exists.
auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => null);
  const email = body?.email?.trim();
  const password = body?.password;
  if (!email || !password) {
    return c.json({ error: 'Zadejte e-mail a heslo' }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ? COLLATE NOCASE`
  ).bind(email).first<User & { password_hash: string | null }>();

  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: 'Neplatný e-mail nebo heslo' }, 401);
  }
  if (row.status === 'blocked') {
    return c.json({ error: 'Účet byl zablokován' }, 403);
  }
  if (row.status !== 'active') {
    return c.json({ error: 'Účet čeká na schválení správcem' }, 403);
  }

  const { password_hash: _ph, ...user } = row;
  await issueSession(c, user);
  return c.json({ user });
});

// Dev-only login — bypasses Google OAuth (seed: npm run db:seed:local)
auth.post('/dev-login', async (c) => {
  if (isProduction(c)) {
    return c.json({ error: 'Nedostupné v produkci' }, 403);
  }
  const user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind('dev-user-001').first<User>();
  if (!user) {
    return c.json({ error: 'Seed uživatel nenalezen. Spusťte npm run db:seed:local' }, 404);
  }
  await issueSession(c, user);
  return c.json({ user });
});

// Current user. Slides the session forward once the token is past half its lifetime,
// so an active user never hits the hard expiry. Renews from live DB fields.
auth.get('/me', authRequired, async (c) => {
  const user = c.get('user');
  const payload = c.get('jwtPayload');
  if (payload && Math.floor(Date.now() / 1000) - payload.iat > (payload.exp - payload.iat) / 2) {
    await issueSession(c, user);
  }
  return c.json({ user });
});

auth.post('/logout', (c) => {
  deleteCookie(c, 'token', { path: '/' });
  return c.json({ ok: true });
});

function origin(c: Context<AppEnv>): string {
  return new URL(c.req.url).origin;
}

// Fail closed: anything other than an explicit ENVIRONMENT=development is production.
function isProduction(c: Context<AppEnv>): boolean {
  return c.env.ENVIRONMENT !== 'development';
}

export { auth };

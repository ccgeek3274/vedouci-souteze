import { Hono } from 'hono';
import { auth } from './routes/auth';
import { admin } from './routes/admin';
import { chesscz } from './routes/chesscz';
import { competitions } from './routes/competitions';
import { teams } from './routes/teams';
import { imports } from './routes/imports';
import { tokens } from './routes/tokens';
import type { AppEnv } from './types';

// Only /api/* reaches the Worker (assets.run_worker_first); everything else is the SPA.
const app = new Hono<AppEnv>().basePath('/api/v1');

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/auth', auth);
app.route('/admin', admin);
app.route('/chesscz', chesscz);
app.route('/competitions', competitions);
app.route('/import', imports);
app.route('/tokens', tokens);
app.route('/', teams);

app.notFound((c) => c.json({ error: 'Nenalezeno' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Interní chyba serveru' }, 500);
});

export default app;

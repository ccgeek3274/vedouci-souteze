import { Hono } from 'hono';
import { auth } from './routes/auth';
import { admin } from './routes/admin';
import type { AppEnv } from './types';

// Only /api/* reaches the Worker (assets.run_worker_first); everything else is the SPA.
const app = new Hono<AppEnv>().basePath('/api/v1');

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/auth', auth);
app.route('/admin', admin);

app.notFound((c) => c.json({ error: 'Nenalezeno' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Interní chyba serveru' }, 500);
});

export default app;

// chess.cz API proxy core: one global rate gate in D1 (~3 req/s) + response cache.
// Ported from pgn-base backend/src/routes/chesscz.ts (cachedFetchSscr & co.).
// The upstream blocks IPs on request bursts (connect timeout, hours) — never call it without the gate.

const BASE = 'https://api.chess.cz/api';
const RATE_MIN_GAP_MS = 350;
const MAX_WAIT_FOR_SLOT_MS = 8_000;
const BLOCK_DURATION_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

const H = 3600 * 1000;
/** Allowed upstream paths and their cache TTL. Anything else is refused. */
const ROUTES: { re: RegExp; ttl: number }[] = [
  { re: /^\/competitions(\/\d{4})?$/, ttl: 24 * H },
  { re: /^\/competitions\/\d+\/(details|schedule|crosstable)$/, ttl: 24 * H },
  { re: /^\/competitions\/\d+\/table$/, ttl: 1 * H },
  { re: /^\/competitions\/\d+\/round\/\d+\/schedule$/, ttl: 24 * H },
  { re: /^\/competitions\/\d+\/round\/\d+\/matches$/, ttl: H / 6 },
  { re: /^\/competitions\/\d+\/team\/\d+\/(roster|schedule|contacts)$/, ttl: 1 * H },
  { re: /^\/clubs\/all$/, ttl: 24 * H },
  { re: /^\/clubs\/[\w-]+\/(details|members)$/, ttl: 24 * H },
  { re: /^\/members\/\d+\/(cze|fide)$/, ttl: 24 * H },
  { re: /^\/members\/name\?search=[^&]{4,}$/, ttl: 24 * H },
];

export function routeTtl(path: string): number | null {
  return ROUTES.find((r) => r.re.test(path))?.ttl ?? null;
}

export type ChessczResult =
  | { status: 200; body: { data: unknown; fetchedAt: number; stale: boolean } }
  | { status: 400 | 404 | 429 | 502 | 503; body: { error: string } };

async function acquireSlot(db: D1Database): Promise<'ok' | 'blocked' | 'throttled'> {
  const now = Date.now();
  const row = await db.prepare('SELECT blocked_until FROM chesscz_rate WHERE id = 1').first<{ blocked_until: number }>();
  if (row && row.blocked_until > now) return 'blocked';
  const res = await db
    .prepare('UPDATE chesscz_rate SET last_fetch_at = ? WHERE id = 1 AND last_fetch_at <= ?')
    .bind(now, now - RATE_MIN_GAP_MS)
    .run();
  return (res.meta?.changes ?? 0) > 0 ? 'ok' : 'throttled';
}

async function acquireSlotWithWait(db: D1Database): Promise<'ok' | 'blocked' | 'throttled'> {
  const startedAt = Date.now();
  while (true) {
    const slot = await acquireSlot(db);
    if (slot !== 'throttled') return slot;
    const row = await db.prepare('SELECT last_fetch_at FROM chesscz_rate WHERE id = 1').first<{ last_fetch_at: number }>();
    if (!row) return 'throttled';
    const waitMs = row.last_fetch_at + RATE_MIN_GAP_MS - Date.now() + 20;
    const remaining = MAX_WAIT_FOR_SLOT_MS - (Date.now() - startedAt);
    if (remaining <= 0) return 'throttled';
    if (waitMs > 0) await new Promise((r) => setTimeout(r, Math.min(waitMs, remaining)));
  }
}

/** GET an allowed chess.cz path through cache + rate gate. Serves stale cache when upstream is unavailable. */
export async function chessczGet(db: D1Database, path: string, forceRefresh = false): Promise<ChessczResult> {
  const ttl = routeTtl(path);
  if (ttl === null) return { status: 400, body: { error: 'Nepovolený dotaz na chess.cz' } };

  const now = Date.now();
  const cached = await db
    .prepare('SELECT payload, fetched_at FROM chesscz_cache WHERE cache_key = ?')
    .bind(path)
    .first<{ payload: string; fetched_at: number }>();
  const fromCache = (stale: boolean): ChessczResult => ({
    status: 200,
    body: { data: JSON.parse(cached!.payload), fetchedAt: cached!.fetched_at, stale },
  });
  if (cached && !forceRefresh && now - cached.fetched_at < ttl) return fromCache(false);

  const slot = await acquireSlotWithWait(db);
  if (slot !== 'ok') {
    if (cached) return fromCache(true);
    return slot === 'blocked'
      ? { status: 503, body: { error: 'chess.cz je dočasně nedostupné, zkuste to za pár minut' } }
      : { status: 429, body: { error: 'Probíhá jiné načítání z chess.cz, zkuste to za chvíli' } };
  }

  let res: Response;
  try {
    res = await fetch(BASE + path, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      await db.prepare('UPDATE chesscz_rate SET blocked_until = ? WHERE id = 1').bind(Date.now() + BLOCK_DURATION_MS).run();
    }
    if (cached) return fromCache(true);
    return { status: 503, body: { error: 'chess.cz neodpovídá' } };
  }
  if (res.status === 404) return { status: 404, body: { error: 'Na chess.cz nenalezeno' } };
  if (!res.ok) {
    if (cached) return fromCache(true);
    return { status: 502, body: { error: `Chyba chess.cz (${res.status})` } };
  }
  const data = await res.json();
  await db
    .prepare(
      `INSERT INTO chesscz_cache (cache_key, payload, ttl_ms, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, ttl_ms = excluded.ttl_ms, fetched_at = excluded.fetched_at`
    )
    .bind(path, JSON.stringify(data), ttl, now)
    .run();
  return { status: 200, body: { data, fetchedAt: now, stale: false } };
}

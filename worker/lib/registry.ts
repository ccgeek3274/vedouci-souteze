// Fetch + cache of the ŠSČR registries without API (shared/registry.ts parses them).
// The pages are big (hosting CSV ~300 kB) and must not be hammered: one shared D1 cache entry per source
// (TTL 1 h, stale copy served when the source fails) and a global gap between fetches (chesscz_rate id 2).
import {
  parseForeignerCsv, parseForeignerUnconfirmedHtml, parseHostingCsv, parseHostingUnconfirmedHtml, parseRosterCheckPage,
} from '../../shared/registry';

const TTL_MS = 3600 * 1000;
const GAP_MS = 1500;
const MAX_WAIT_MS = 10_000;
const FETCH_TIMEOUT_MS = 20_000;

type Source = { url: string; encoding: 'utf-8' | 'windows-1250'; parse: (text: string) => unknown };

export const SOURCES = {
  'hosting:confirmed': { url: 'https://hostovani.appchess.cz/exportCsvConfirmed/actual', encoding: 'windows-1250', parse: parseHostingCsv },
  'hosting:unconfirmed': { url: 'https://hostovani.appchess.cz/unconfirmed', encoding: 'utf-8', parse: parseHostingUnconfirmedHtml },
  'foreigners:confirmed': { url: 'https://registracecizincu.appchess.cz/exportCsvConfirmed/actual', encoding: 'windows-1250', parse: parseForeignerCsv },
  'foreigners:unconfirmed': { url: 'https://registracecizincu.appchess.cz/unconfirmed', encoding: 'utf-8', parse: parseForeignerUnconfirmedHtml },
} satisfies Record<string, Source>;

export function rosterCheckSource(org: number): Source {
  return { url: `https://www.chess.cz/kontrola-soupisek/?poradatel=${org}`, encoding: 'utf-8', parse: parseRosterCheckPage };
}

async function waitForSlot(db: D1Database): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    const now = Date.now();
    const r = await db.prepare('UPDATE chesscz_rate SET last_fetch_at = ? WHERE id = 2 AND last_fetch_at <= ?').bind(now, now - GAP_MS).run();
    if ((r.meta?.changes ?? 0) > 0) return true;
    await new Promise((res) => setTimeout(res, GAP_MS / 2));
  }
  return false;
}

export type RegistryResult<T> = { data: T; fetchedAt: number; stale: boolean } | { error: string };

export async function registryGet<T>(db: D1Database, key: string, src: Source, forceRefresh = false): Promise<RegistryResult<T>> {
  const cacheKey = `registry:${key}`;
  const cached = await db.prepare('SELECT payload, fetched_at FROM chesscz_cache WHERE cache_key = ?').bind(cacheKey)
    .first<{ payload: string; fetched_at: number }>();
  const fromCache = (stale: boolean) => ({ data: JSON.parse(cached!.payload) as T, fetchedAt: cached!.fetched_at, stale });
  if (cached && !forceRefresh && Date.now() - cached.fetched_at < TTL_MS) return fromCache(false);

  if (!(await waitForSlot(db))) return cached ? fromCache(true) : { error: 'Registr je právě načítán, zkuste to za chvíli' };
  try {
    const res = await fetch(src.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = new TextDecoder(src.encoding).decode(await res.arrayBuffer());
    const data = src.parse(text) as T;
    const now = Date.now();
    await db.prepare(
      `INSERT INTO chesscz_cache (cache_key, payload, ttl_ms, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, ttl_ms = excluded.ttl_ms, fetched_at = excluded.fetched_at`
    ).bind(cacheKey, JSON.stringify(data), TTL_MS, now).run();
    return { data, fetchedAt: now, stale: false };
  } catch (e) {
    return cached ? fromCache(true) : { error: `Zdroj ${new URL(src.url).host} je nedostupný (${(e as Error).message})` };
  }
}

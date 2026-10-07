# Vedoucí soutěže

Web aplikace pro vedoucího skupiny soutěže družstev ŠSČR / SŠS (KP, KS, RP, RS):
sběr podkladů (rozpis, rozdělení družstev, e-soupisky), verifikace proti chess.cz,
příprava losovací schůze (Berger), úvodní zpravodaj a zpravodaje z kol.
Zadání: `doc/vedouci_podklady.md`, produktová specifikace: `doc/PRD.md`.

## Stack
- Jeden Cloudflare Worker (`worker/index.ts`, Hono) pod `/api/v1/*` + static assets SPA (`dist/`, build z `web/`).
  `assets.run_worker_first: ["/api/*"]` → vše ostatní je SPA s fallbackem na index.html. Jedna doména, bez CORS.
- D1 (`DB`, `vedouci-souteze-db`), schéma výhradně přes `migrations/NNNN_*.sql` (`wrangler d1 migrations`), žádné ruční ALTERy.
- Frontend React 18 + Vite 6 + React Router 6 + TanStack Query 5, styly `web/src/styles.css` (Paper & Ink tokeny, sdílené se sscr-soupiska).
- `shared/` = čistá TS logika (bez DOM / Workers API) sdílená web+worker, pokrytá vitestem.
- Auth převzat z pgn-base (Google OAuth + admin-created účty s heslem, HS256 JWT). Rozdíl: session je httpOnly cookie
  i v produkci (same-origin), Bearer header je pro skripty / skills. Viz `doc/feat-auth.md`.

## Příkazy
- `npm run dev` — wrangler dev (:8787) + vite (:5173, proxy /api). Poprvé: `cp .dev.vars.example .dev.vars`,
  `npm run db:migrate:local && npm run db:seed:local` (dev-login uživatel `dev-user-001`).
- `npm run check` (tsc web + worker), `npm test` (vitest), `npm run build`.
- `./deploy.sh` — check, test, build, remote migrace, `wrangler deploy`. Vždy nejdřív commit + push.
- wrangler spouštěj bez proxy proměnných (`env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY`).
- `npm run cli -- …` (scripts/cli.ts, esbuild bundle) — import rozpisu/soupisek přes API; používají ho skills
  `.claude/skills/import-rozpis` a `import-soupiska`. `scripts/seed-demo.sh` = demo RPB 2026/27.

## Konvence
- Kód a komentáře anglicky, UI a chybové hlášky API česky. Commity česky bez diakritiky, conventional-commit styl.
- Každá netriviální feature: `doc/feat-*.md` (rozhodnutí, edge cases). CLAUDE.md jen pro invarianty a gotchas.
- Vlastnictví dat: každý uživatel vidí jen soutěže, které sám založil (`owner_id`); admin jen spravuje uživatele.
  Tabulky s daty uživatele mají FK s `ON DELETE CASCADE` (D1 vynucuje foreign keys) — smazání uživatele smaže jeho data.
- Zdroj pravdy je chess.cz; v D1 ukládáme jen to, co nejde znovu načíst (vlastní údaje, párování ID, snapshoty zpravodajů).

## Gotchas
- Lokální D1 (`.wrangler/state`) je vázaná na `database_id` — po jeho změně je prázdná (migrace + seed znovu).
- React Router 6: relativní `<Link to>` se skládá k cestě *routy* (`druzstva` → `druzstva/t/…`); mezi sourozeneckými
  záložkami soutěže používej `../t/…`.
- Web nesmí importovat z `worker/` (typy Workers) — sdílené typy patří do `shared/`.
- Párování názvů družstev: `teamNameScore` (`shared/text.ts`) — různá písmena družstev (D/E) se nikdy nespárují.

## chess.cz API
- `https://api.chess.cz/api`, spec v `/home/ccuser/git/pgn-base/apichesscz.openapi.yaml`.
- Rate-limit: max ~3 requesty/s (rozestup ≥ ~350 ms, nikdy burst bez pauzy) + cache. Starý údaj „3/min“ je chybný.
  Block se projevuje jako connect timeout (ne 429) a trvá hodiny.
- Volá jen Worker proxy s cache v D1, nikdy přímo frontend.

## Související repozitáře (logiku portujeme, aplikace zůstávají beze změny)
- `../sscr-soupiska` — e-soupiska (xlsx mapping `fillSoupiska`, JSON draft v1)
- `../kontrolasoupisky` — hromadný lookup hráčů
- `../uvodni-zpravodaj`, `../sscr-zpravodaj` — generátory zpravodajů (DOCX/PDF)
- `../swiss-manager-automat` — fáze 2, `../pgn-base` — fáze 3

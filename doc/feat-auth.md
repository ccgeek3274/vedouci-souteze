# Feature: přihlášení, uživatelé, nasazení (M1)

## Přihlášení
Převzato z pgn-base (`backend/src/routes/auth.ts`, `middleware/auth.ts`, `lib/{jwt,password,notify}.ts`):
- **Google OAuth** (authorization code). Nový účet = `status='pending'`, admin dostane ntfy notifikaci (`NTFY_TOPIC`).
  E-maily v `ADMIN_EMAILS` jsou rovnou `admin` + `active`.
- **Lokální účty** vytváří admin (e-mail + heslo, PBKDF2-SHA256). Žádná samoregistrace, reset hesla nastavuje admin.
- **JWT HS256** (30 dní), `/auth/me` ho po polovině životnosti obnoví (klouzavá session).
- **Dev login** (`POST /auth/dev-login`) jen při `ENVIRONMENT=development`, uživatel `dev-user-001` ze `scripts/dev-seed.sql`.

### Rozdíl proti pgn-base
SPA i API běží na jedné doméně (jeden Worker se static assets), proto je session vždy **httpOnly cookie**
(`SameSite=Lax`, `Secure` v produkci). Odpadá předávání tokenu přes `#token=` a ukládání do localStorage.
Hlavička `Authorization: Bearer` zůstává podporovaná pro skripty a Claude Code skills (osobní API tokeny přibudou v M4).

### Gotcha
Odhlášení nesmí volat `queryClient.clear()` — odpojí aktivního observera `['auth','me']` a UI zůstane „přihlášené“.
Místo toho `setQueryData(['auth','me'], null)` + `removeQueries` pro ostatní klíče.

## Role a data
`user` / `admin`, stavy `pending` / `active` / `blocked`. Každý uživatel vidí jen svá data; admin navíc stránku Uživatelé.
Smazání uživatele maže jeho data přes `ON DELETE CASCADE`.

## Nasazení
- Worker `vedouci-souteze`, `assets` z `dist/` s `run_worker_first: ["/api/*"]` a SPA fallbackem.
- První nasazení (jednorázově, ručně):
  1. `wrangler d1 create vedouci-souteze-db` → doplnit `database_id` do `wrangler.jsonc`.
  2. Secrets: `wrangler secret put JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, volitelně `NTFY_TOPIC`.
  3. Google Cloud Console: k OAuth klientovi přidat redirect URI `https://vedouci.sachytynec.cz/api/v1/auth/callback`
     (a případně `https://vedouci-souteze.<account>.workers.dev/api/v1/auth/callback`).
  4. Odkomentovat `routes` s custom doménou `vedouci.sachytynec.cz` ve `wrangler.jsonc`.
- Další nasazení: `./deploy.sh` (check, test, build, remote migrace, deploy).

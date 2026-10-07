# Implementační plán: Vedoucí soutěže (vedouci-souteze)

## Kontext

Vedoucí skupiny soutěže družstev (SŠS: KP, KS, RP, RS) dnes pracuje s několika samostatnými statickými nástroji:
- `sscr-soupiska`: kapitáni v ní vyplňují e-soupisku,
- `kontrolasoupisky`: hromadné vyhledání hráčů,
- `uvodni-zpravodaj` a `sscr-zpravodaj`: generování zpravodajů.

Tyto nástroje nemají společná data ani serverovou perzistenci. Ruční poznámky, rozhodčí a pořadí po kolech se ztrácejí. Podklady pro losovací schůzi (požadavky na začátky, losovací čísla, termíny) se sbírají ručně z e-mailů.

Cíl je jedna webová aplikace na Cloudflare, ve které vedoucí:
1. založí soutěž (skupinu),
2. naimportuje rozpis a rozdělení družstev a průběžně soupisky,
3. data ověří proti chess.cz,
4. připraví losovací schůzi včetně rozlosování podle Bergera,
5. vygeneruje úvodní zpravodaj a potom zpravodaje z kol, které se trvale uloží.

Pravda o hráčích, ELO a názvech je na chess.cz. Aplikace k nim drží spárované vlastní údaje: místnosti, kontakty, poznámky, snapshoty.

### Potvrzená rozhodnutí
- **Stack jako pgn-base:** Hono + D1 + TypeScript, React 18 + Vite, Google OAuth / admin účty, JWT, schvalování nových uživatelů. Rozdíl je jen v nasazení: jeden Worker se static assets (jedna doména, jeden deploy).
- **Každý uživatel sám za sebe:** soutěže vlastní uživatel, který je založil. Nic se nesdílí a nevaliduje, kdo je skutečný vedoucí. Admin jen schvaluje uživatele.
- **Stávající aplikace zůstávají** beze změny. Jejich logika se portuje do TS modulů s testy.
- **Rozlosování se generuje z Bergerových tabulek** podle losovacích čísel a termínů z rozpisu. Po importu soutěže do chess.cz je pravdou chess.cz.

---

## Krok 0: oprava rate-limitu chess.cz API (hned po schválení)

Platí nové doporučení: **max ~3 requesty za sekundu**, ne za minutu. Zachovat zmínku o blocích při burstu bez pauzy a o nutnosti cache.

Opravit v původních zdrojích:
- `/home/ccuser/git/pgn-base/apichesscz.openapi.yaml:28`
- `/home/ccuser/git/sscr-soupiska/apichesscz.openapi.yaml:28`
- `/home/ccuser/git/pgn-base/.claude/skills/api-chess-cz/SKILL.md:18–19`: také „pauza min. 20 s při explorování“ změnit na ~0,35 s.
- `/home/ccuser/git/pgn-base/docs/feat-chesscz-autocomplete.md:7`

Commit v každém repu zvlášť (česky bez diakritiky, `docs: ...`), push až na pokyn.

---

## Architektura

```
vedouci-souteze/
  package.json            # jeden npm projekt
  wrangler.jsonc          # Worker "vedouci-souteze", assets: ./dist, D1 binding DB
  worker/                 # Hono API (/api/v1/*)
    index.ts, routes/{auth,admin,chesscz,competitions,teams,rosters,imports,draw,bulletins,tokens}.ts
    middleware/auth.ts, lib/{jwt,password,notify}.ts      # převzato z pgn-base
    db/schema.sql + migrations/NNNN_*.sql                 # wrangler d1 migrations (místo ručních ALTER)
  web/                    # React + Vite + React Router + TanStack Query
  shared/                 # čistá TS logika sdílená web+worker, testovaná vitestem
    chesscz/   (typy, normArr, mapování member→player)
    soupiska/  (xlsx mapping, draft v1 JSON, parsování flags K/ZK/H/V/C)
    draw/      (Berger, kontroly pravidel)
    bulletin/  (DOCX/PDF builder úvodního zpravodaje a zpravodaje z kola)
  skills/ → .claude/skills/{import-rozpis,import-soupiska}/SKILL.md
  doc/                    # průběžná dokumentace: PRD.md, feat-*.md, api.md
  CLAUDE.md
```

### Převzít z pgn-base
- **Auth:** `backend/src/routes/auth.ts`, `middleware/auth.ts`, `lib/jwt.ts`, `lib/password.ts`, `lib/notify.ts`, `routes/admin.ts`, frontend `lib/auth.ts`, `hooks/useAuth.ts`, `ProtectedRoute.tsx`, `Login.tsx`.
- **chess.cz proxy:** `backend/src/routes/chesscz.ts` s cache v D1 (`chesscz_cache`, `chesscz_rate`). Rate limit nastavit na rozestup ~350 ms (3/s), zachovat 10min self-block po timeoutu a `?refresh=true`.
- **Konvence:** kód anglicky, UI česky, `doc/feat-*.md` pro každou netriviální feature, commity česky bez diakritiky.

### Datový model (D1), stručně
- `users`, `api_tokens`: osobní tokeny pro Claude Code skills, ukládá se jen hash.
- `competitions`:
  - owner, sezóna, kraj, název, zkratka (RPB), úroveň (KP/KS/RP/RS), počet šachovnic (8/5)
  - výchozí začátek (10:00 / 9:00), tempo, kontakt vedoucího
  - `chesscz_comp_id` (nullable, spáruje se později), fáze (příprava / losování / běží / ukončeno)
- `competition_rounds`: kolo, datum, poznámka (z časového plánu rozpisu, editovatelné).
- `teams`:
  - comp_id, název, oddíl (`club_code` z `/clubs/all`), `chesscz_team_id` (nullable)
  - pořadí, losovací číslo, `status` active/reserve (odebraná družstva čekají v záloze, nemažou se)
  - hrací místnost, přezůvky, preferovaný začátek, požadavky na losování, poznámky
- `team_contacts`: role kapitán / zástupce / komunikace / rozhodčí, jméno, tel, e-mail.
- `roster_versions` + `roster_players`:
  - Verze: každý import vytvoří novou verzi s diffem proti předchozí.
  - Hráč: pořadí, jméno, rok, LOK, FIDE, označení, Z, výsledek verifikace, vyškrtnut + důvod, povolení hostování doloženo.
- `requests`: typ (losovací číslo / začátek utkání / změna termínu / jiné), text, týká se kola/soupeře, stav (nové / vyhověno / zamítnuto), rozhodnutí na schůzi.
- `fixtures`:
  - kolo, domácí, hosté, datum, čas (výjimka), rozhodčí
  - zdroj: berger nebo chesscz
- `bulletins`:
  - druh (úvodní předběžný / úvodní definitivní / kolo N), verze, `config` JSON (rozhodčí, výjimky, Quill Delta „Různé“)
  - `standings_snapshot` JSON: pořadí po kole se trvale ukládá
  - vygenerováno kdy
- `import_log`: zdroj (pdf-skill / xlsx / json), soubor, výsledek.

Neukládá se nic, co jde kdykoli znovu načíst z chess.cz (ELO, aktuální tabulka). Výjimkou jsou snapshoty pro zpravodaje.

---

## Etapy implementace

### M1: Kostra a nasazení
- Init git, npm projekt, `wrangler.jsonc` (Worker + assets + D1), Vite build do `dist/`, vitest.
- Port auth z pgn-base (Google OAuth + lokální účty, pending/active/blocked, admin e-maily ve vars).
- `deploy.sh` podle pgn-base (credentials, test, build, `wrangler deploy`, D1 migrace).
- `CLAUDE.md`, `doc/PRD.md` (převod `vedouci_podklady.md` + rozhodnutí výše).
- Doména: `vedouci.sachytynec.cz` (potvrdit).

### M2: chess.cz proxy a soutěže
- Port proxy `chesscz.ts` (3 req/s). Dál endpointy navíc: `/clubs/all`, `/clubs/:code/members`, `/members/:id/cze|fide`, `team/:id/contacts`.
- Hromadné ověření hráčů jako server-side dávka s průběhem (fronta v D1, frontend polluje).
- CRUD soutěže, kola a termíny, zkratky. Výběr soutěže z chess.cz (kraj → soutěž) pro pozdější spárování: port `parseCompetitions`, `createCombo` z `uvodni-zpravodaj/public/index.html`.

### M3: Družstva
- Seznam družstev:
  - změna pořadí (drag & drop), přejmenování, editace všech údajů
  - přesun do zálohy a zpět
  - přidání družstva, kontakty.
- Párování na chess.cz:
  - oddíl přes `/clubs/all` s fuzzy porovnáním názvů (`fold`, `matchName` ze sscr-soupiska),
  - později družstvo přes `/competitions/:id/table`.
  - Řešit nesoulad názvů (např. „Sokol Bakov“ vs. „Šachový klub Bakov“, „Kralupy“ vs. „Kralupy nad Vltavou“). Zobrazený název je z chess.cz, pokud je spárováno.

### M4: Import rozpisu a rozdělení družstev (skill + API)
- **API:**
  - `POST /api/v1/import/competition` přijme strukturovaný JSON (schéma v `shared/import/schema.ts` + `doc/import-format.md`): soutěže/skupiny, vedoucí, termíny kol, začátky, počet šachovnic, seznam družstev v pořadí.
  - Autorizace osobním API tokenem (stránka „Tokeny“ v UI).
  - Odpověď je **náhled změn (dry-run)**. Uložení až po potvrzení v UI nebo s parametrem `?apply=true`.
- **Skill `import-rozpis`** (`.claude/skills/import-rozpis/SKILL.md`):
  - Claude Code přečte PDF (pdftotext + porozumění), vytvoří JSON podle schématu a pošle ho na API, nebo ho uloží pro ruční upload.
  - Umí dva typy dokumentů: Rozpis (časový plán, KP/RP vs. KS/RS termíny, začátky, vedoucí) a Rozdělení družstev (aktualizace seznamu družstev; nová družstva přidá, chybějící přesune do zálohy).
- **UI:** upload JSON → diff → potvrzení.

### M5: Import soupisek
- **V prohlížeči:** upload xlsx e-soupisky.
  - Inverzní mapování k `fillSoupiska` ze `/home/ccuser/git/sscr-soupiska/index.html:826`, konstanty `HDR_CELL`, `FIXED_CELLS`, `KOM_BASE_ROW`, `ROZH_BASE_ROW` (:607–642).
  - Tolerantně vůči posunutým řádkům: kotvy hledat podle textů v sloupci A („Kapitán“, „Hrací místnost“, …), protože soupisky nad 20 hráčů řádky posouvají.
  - Knihovna ExcelJS 4.4.0 (stejná jako v soupisce).
- **Import JSON draftu sscr-soupiska v1** (`collectDraft`/`applyDraft`, :1942–1971).
- **Ruční verifikace:**
  - náhled vedle sebe (importováno vs. aktuální verze),
  - zvýraznění změn a varování (nespárovaný hráč, chybějící kontakt),
  - potvrzení vytvoří novou verzi soupisky,
  - `preferZacatek` a `pozadavkyLosovani` se převedou na záznamy `requests` k potvrzení.
- **Přiřazení k družstvu:** podle názvu družstva / oddílu (fuzzy) s ruční volbou.
- **Skill `import-soupiska`:** dávka xlsx (např. přílohy uložené z e-mailu) → JSON draft v1 → upload přes API (dry-run). Výsledek se potvrzuje v UI.

### M6: Verifikace soupisek
Port a rozšíření kontrolasoupisky. Hromadný lookup přes proxy, výsledek uložen k hráči s datem. Kontroly:
- Registrace v ŠSČR, zaplacený příspěvek (`feeYear`), existence LOK/FIDE, shoda jména a roku narození (`rokWarnings`).
- Oddíl hráče ≠ oddíl družstva: hráč je host (H), vyžaduje „povolení hostování doloženo“ (ručně zaškrtnout).
- Limit H/V/C v základní sestavě (`recalcZaklad`, :1512), počet hráčů v základu podle počtu šachovnic.
- Duplicity hráče napříč družstvy v rámci soutěží uživatele.
- Výstup: seznam nedostatků po družstvech (vstup do předběžného úvodního zpravodaje) a akce „vyškrtnout“ pro definitivní zpravodaj.

### M7: Příprava losovací schůze
- Přehledy (tisknutelné HTML, volitelně DOCX):
  - stav podkladů (soupiska ano/ne, kontakty, rozhodčí, chybějící povolení),
  - **požadavky na začátek utkání**, losovací čísla, změny termínů,
  - družstva stejného oddílu ve skupině.
- **Berger** (`shared/draw/berger.ts`, port a test proti `bergerOk` z uvodni-zpravodaj):
  - generování rozlosování z losovacích čísel a termínů kol, lichý počet = volno,
  - kontroly: vzájemné zápasy stejného oddílu do 31. 12. (konfigurovatelné datum), poslední kolo bez výjimek začátku, kolize požadavků (např. domácí v konkrétním kole),
  - návrh losovacích čísel pro řízené losování: vyhledání čísel splňujících pravidla.
- Zadání výsledků schůze: losovací čísla, rozhodnutí o požadavcích, výjimky začátků (domácí / venku / konkrétní utkání).

### M8: Úvodní zpravodaj
- Port `buildDocx` a pomocných funkcí z `/home/ccuser/git/uvodni-zpravodaj/public/index.html` do `shared/bulletin/initial.ts` (docx@7.8.2, šablona `docs/rp_b_26_27-uz.docx` jako referenční vzhled).
- Zdroje dat:
  - **předběžný:** soupisky, rozlosování a výjimky z aplikace, sekce nedostatků z M6,
  - **definitivní:** soupisky a rozlosování z chess.cz (po importu ze Swiss-Manageru), spárované s údaji aplikace (místnosti, kontakty, rozhodčí, výjimky). Bez vyškrtnutých hráčů.
- Opakované úpravy: konfigurace a ruční texty uložené v `bulletins` s verzemi, náhled HTML, export DOCX (+ PDF přes pdfmake ze sscr-zpravodaj).
- Kontrola souladu chess.cz vs. aplikace: rozdíly v rozlosování a soupiskách.

### M9: Zpravodaje z kol
- Port ze `/home/ccuser/git/sscr-zpravodaj/public/index.html`:
  - `scheduleRound`, `mergeRound`, `buildMatchTable`, `buildStandingsTable`,
  - Quill pro „Různé“ (`deltaBlocks`, `richDocx`, `richPdf`), `buildPdfDef`, fonty Carlito.
- Trvalé uložení: rozhodčí, text „Různé“, **snapshot pořadí po kole**, vygenerované výstupy, číslování zpravodajů.
- Pokud chess.cz pozdější kolo přepíše, starší zpravodaje se generují ze snapshotu.

### Fáze 2 (mimo tento plán, jen příprava)
- Export pro Swiss-Manager:
  - seznamy LOK/FIDE ID po družstvech v pořadí soupisky, formát pro `swiss-manager-automat`,
  - úprava automatu na vstup souboru s družstvy (`naklikej_hrace.py`, `paste_and_confirm`).
- Fáze 3: integrace s pgn-base (partiový bulletin KP/KS), vlastní úvaha později.

---

## Otevřené body k potvrzení během implementace
- ~~Doména~~: `vedouci.sachytynec.cz` (potvrzeno)
- ~~Pořadí etap~~: popořadě M1 → M9 (potvrzeno)
- ~~RS~~: termíny známé dopředu, na losovací schůzi se jen definuje složení skupin (často < 12 družstev → méně kol) — podporovat od začátku

## Ověření
- **Vitest testy pro `shared/`:**
  - Berger (proti známým tabulkám a `bergerOk`),
  - xlsx import (round-trip: `fillSoupiska` ze sscr-soupiska vyplní šablonu `E-soupiska_2026-2027.xlsx` → import → shoda dat, včetně > 20 hráčů a více rozhodčích),
  - JSON draft v1, verifikační pravidla (fixtury odpovědí chess.cz),
  - DOCX builder (struktura).
- **Import rozpisu:** skill spustit na `doc/Rozpis_soutezi_SSS_2026_27.pdf` a `doc/Rozdeleni_druzstev_KP_KS_RP_SSS_2026_2027.pdf`. Ověřit 11 kol s termíny KP/RP vs. KS/RS a 11 družstev RPB. Rozdělení oproti příloze rozpisu správně přesune družstva (např. Jawa Brodce A z KSA do KSB).
- **Manuální E2E:** `wrangler dev` (lokální D1) + Vite, dev-login, Playwright screenshoty. Workflow RPB 2026/27: založení → import → soupisky → verifikace → losovací přehledy → Berger → úvodní zpravodaj DOCX → spárování s chess.cz → zpravodaj z kola se snapshotem.
- **Proxy:** ověřit rozestup ≥ 333 ms a fungování cache (druhý dotaz nejde na upstream).

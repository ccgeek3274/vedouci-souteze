# PRD — Vedoucí soutěže

Zadání od uživatele: [`vedouci_podklady.md`](vedouci_podklady.md). Tento dokument shrnuje odsouhlasený rozsah,
doménová pravidla z podkladů a etapy. Průběžně se aktualizuje.

## Cíl
Jedna webová aplikace na Cloudflare, ve které vedoucí skupiny soutěže družstev:
1. založí soutěž (skupinu),
2. postupně naimportuje rozpis, rozdělení družstev a e-soupisky a data ručně verifikuje/edituje,
3. ověří hráče proti chess.cz,
4. připraví losovací schůzi (přehledy požadavků, rozlosování podle Bergera),
5. vygeneruje úvodní zpravodaj (předběžný → definitivní, několik kol úprav),
6. vydává zpravodaje z kol s trvale uloženými poznámkami a pořadím po kolech.

Mimo aplikaci (ručně): zadání do Swiss-Manageru a import do chess.cz, opakovaně po změnách.

## Odsouhlasená rozhodnutí (2026-10-07)
- **Stack jako pgn-base** (Hono + D1 + TS, React + Vite, Google OAuth / admin účty, JWT), ale jeden Worker se static assets.
- **Každý uživatel sám za sebe** — soutěže vlastní ten, kdo je založil; nevaliduje se, kdo je skutečným vedoucím.
  Admin pouze schvaluje/spravuje uživatele.
- **Stávající nástroje zůstávají** (sscr-soupiska používají kapitáni dál); jejich logika se portuje do TS modulů.
- **Rozlosování se generuje z Bergerových tabulek** podle losovacích čísel a termínů z rozpisu; po importu do chess.cz je pravdou chess.cz.
- **Postup etap popořadě** (M1 → M9). Doména `vedouci.sachytynec.cz`.
- **Rate-limit chess.cz:** ~3 requesty/s.

## Doménová pravidla (Rozpis SŠS 2026/27)
- Úrovně: KP (1 skupina), KS (A, B), RP (A–D), RS (A–D). KP/KS/RP 8 šachovnic, RS 5 šachovnic.
- Každý s každým jednokolově; doporučeně 12 družstev ve skupině (RP/RS často méně → méně kol, lichý počet = volno).
- **Termíny:** KP + RP hrají v termínech 1. ligy západ, KS + RS v termínech 2. ligy (časový plán rozpisu čl. 14),
  společný termín dohrávek. Termíny RS jsou známé dopředu; na losovací schůzi se teprve definuje složení skupin
  (typicky méně než 12 družstev → méně kol, použijí se první termíny z plánu).
- **Začátky:** KP a KS 10:00, RP a RS 9:00. Poslední kolo se nesmí přeložit ani změnit začátek.
  Úpravy začátků (kromě posledního kola) lze provést při losování.
- **Družstva jednoho oddílu ve skupině:** vzájemné zápasy musí být odehrány do 31. 12. (pokud STK neurčí jinak);
  losující může použít řízené losování a přidělit losovací čísla.
- **E-soupisky:** KP/KS/RP posílají do 16. 9., RS do 23. 9. (2026). Součástí jsou kontakty, hrací místnost,
  přezůvky, preference jiného začátku, požadavky na losování, návrh rozhodčích. Další požadavky mohou přijít jen e-mailem.
- **Úvodní zpravodaj:** předběžný do 10 dnů po termínu soupisek (soupisky, rozlosování, odchylky začátků,
  zjištěné nedostatky soupisek); definitivní po vyškrtnutí hráčů bez registrace, bez zaplaceného příspěvku
  a hostů bez povolení hostování. Soupiska je schválena vydáním definitivního zpravodaje.
- **Doplňování hráčů v průběhu:** KP/KS nelze; RP jen nově registrovaní / technický přestup na poslední volné místo;
  RS kdykoli. Hráč smí nastoupit až po zveřejnění vedoucím.
- **Hlášení výsledků** do 18:00 v den utkání; vedoucí zveřejní výsledky na chess.cz a zpravodaj do 24:00.
- **Pořadí:** zápasové body, skóre, počet vyhraných partií, vzájemná utkání, výsledek proti vítěznému družstvu…, los.

## Datový model (D1)
Viz plán; zavádí se postupně migracemi:
`users` (M1) · `competitions`, `competition_rounds` (M2) · `teams`, `team_contacts` (M3) · `import_log`, `api_tokens` (M4) ·
`roster_versions`, `roster_players`, `requests` (M5) · výsledky verifikace (M6) · `fixtures` (M7) · `bulletins` (M8–M9) ·
`chesscz_cache`, `chesscz_rate` (M2).

## Etapy
| Etapa | Obsah | Stav |
|---|---|---|
| M1 | Kostra (Worker + D1 + React), auth, správa uživatelů, deploy | hotovo lokálně |
| M2 | chess.cz proxy (cache, 3 req/s), CRUD soutěže, kola a termíny | |
| M3 | Družstva: pořadí, přejmenování, záloha, kontakty, párování na chess.cz | |
| M4 | Import rozpisu / rozdělení (JSON schéma, API s dry-run, skill `import-rozpis`) | |
| M5 | Import soupisek (xlsx e-soupiska, JSON draft v1, skill `import-soupiska`), verze, požadavky | |
| M6 | Verifikace soupisek proti chess.cz, nedostatky, vyškrtnutí | |
| M7 | Losovací schůze: přehledy, Berger, kontroly pravidel, řízené losování | |
| M8 | Úvodní zpravodaj (předběžný / definitivní), DOCX + PDF, verze | |
| M9 | Zpravodaje z kol, snapshoty pořadí, poznámky | |
| Fáze 2 | Export pro Swiss-Manager, úprava swiss-manager-automat | |
| Fáze 3 | Integrace s pgn-base | |

## Testovací podklady
- `doc/Rozpis_soutezi_SSS_2026_27.pdf`, `doc/Rozdeleni_druzstev_KP_KS_RP_SSS_2026_2027.pdf`
- `doc/rpb_26_27_uz_v3.docx` (mimo git) — reálný úvodní zpravodaj RPB 2026/27 (generovaný uvodni-zpravodaj + ručně doplněné
  texty, tabulka hracích místností, adresář kapitánů). Vzor cílového výstupu M8.
- `doc/soupisky/` (mimo git — osobní údaje) — reálné e-soupisky RPB 2026/27 od kapitánů, viz [`analyza-soupisek.md`](analyza-soupisek.md).

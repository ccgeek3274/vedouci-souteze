# Zpravodaje z kol (M9)

Záložka **Zpravodaj** má v hlavičce přepínač *Úvodní · 1. kolo · 2. kolo …* (`/c/:id/zpravodaj/uvodni`,
`/zpravodaj/kolo-N`). Port generátoru `../sscr-zpravodaj` (jednosouborová aplikace) adaptovaný na soutěž v aplikaci.
Úvodní zpravodaj viz `doc/feat-zpravodaj.md`.

## Rozhodnutí
- **Automatický výběr**: `/zpravodaj` bez klíče přesměruje podle dnešního data na poslední kolo s datem ≤ dnes
  (`pickRound`), před 1. kolem na úvodní zpravodaj. Data kol z rozpisu soutěže v aplikaci, jen když chybí, z chess.cz.
  V přepínači je automaticky zvolená položka orámovaná, uložený koncept má zelenou tečku (`GET /competitions/:id/bulletins`).
- **Data z chess.cz** (proxy s cache): `/round/N/matches` (404 = kolo bez výsledků → jen dvojice z rozpisu), `/schedule`,
  `/table`, `/details`; soupiska hostů jen u zápasu s chybějícím hráčem (pořadí šachovnic, `boardOrder`).
  TTL `/table` zkrácen na 10 min (jako `/matches`) — pořadí se mění s výsledky. *Načíst znovu z chess.cz* obchází cache.
- **Rozhodčí** se předvyplní z karty *Nominace rozhodčích* (`refKey(kolo, klíč domácích)`). V náhledu je lze přepsat
  ručně, nebo vybrat (▾ / šipka dolů): rozhodčí, kapitán a zástupce domácích, pod čarou hostů (`refOptions`, každé
  jméno jednou podle `sameName`). ↺ vrátí nominovaného. Menu je `position: fixed` (buňka tabulky ořezává přetečení)
  a při rolování jde s polem.
- **Koncept** (`bulletins`, `key = 'round-N'`, ukládá se průběžně): datum vydání, vzhled (Klasický / Úřední /
  Moderní), písmo 9–12 pt, rozhodčí ano/ne, text Různé (Quill Delta; `null` = výchozí text, sleduje vedoucího a datum).
  Rozhodčí ani pořadí v konceptu **nejsou**. Vzhled / písmo / rozhodčí nového konceptu = poslední volba v prohlížeči
  (localStorage `vs_round_bulletin`).
- **Save point** = koncept + `snapshot` (`RoundSnapshot`): pořadí družstev jako celé řádky `/table` z chess.cz
  (všechny hodnoty, ne jen zobrazené sloupce) a **všichni** rozhodčí kola, jak jsou ve zpravodaji (klíč domácích →
  jméno, i nezměnění a prázdní). Snapshot posílá stránka (`DraftOptions.snapshot`), server ho přidá ke kopii konceptu.
  - Obnovení: koncept dostane konfiguraci bez snapshotu, stránka ze snapshotu nastaví rozhodčí a zmrazí pořadí
    („Pořadí ze save pointu …“, tlačítko *Použít aktuální z chess.cz*). Výsledky se vždy načtou aktuální.
    Automatický save point „před obnovením“ dostane snapshot toho, co stránka ukazovala.
  - Úpravy rozhodčích žijí jen ve stránce: po přepnutí kola / znovunačtení se vrátí nominace. Dokud nejsou v save
    pointu, ukazuje Zdroj dat „změny nejsou v žádném save pointu“ a prohlížeč varuje při zavření okna.
  - **První stažení DOCX/PDF kola** bez save pointu vytvoří save point „automaticky při stažení DOCX/PDF“ — co bylo
    rozesláno, jde vždy obnovit.
  - Společný hook `web/src/bulletin/draft.tsx` (úvodní zpravodaj snapshot neposílá, jeho save pointy jsou jen konfigurace;
    rozhodčí má verzované na kartě Nominace rozhodčích).
- Vedoucí z údajů soutěže v aplikaci (`signatureName`), záložně `compManagerName` z chess.cz.
- Název souboru `{zkratka}_{rr}_{rr}_{kk}` (např. `rpb_26_27_01`), bez šablony ze sscr-zpravodaj.

- **Náhled stránkovaný jako PDF** (port `paginatePreview` ze sscr-zpravodaj, `web/src/bulletin/paginate.ts`):
  náhled je 1:1 s DOCX/PDF a dělí se na strany A4 (mezera „strana N / M“, záhlaví dalších stran). Kde začíná strana,
  určuje skutečné rozložení PDF: 300 ms po změně se na pozadí sestaví PDF (`roundPdfPageMap`) a `pageBreakBefore`
  vrátí stranu každého bloku (id uzlů PDF = `data-pg` v náhledu: `t*` nadpisy, `h*` kapitoly, `m*` zápasy, `st`
  pořadí, `r*` odstavce Různé). Do té doby odhad z rozměrů náhledu (zápas ani tabulka se nedělí, nadpis drží
  s následujícím, odstavec Různé celý). Blok se posune přes `margin-top`, odstavce Quillu přes generovaný stylesheet;
  lišty editoru v sazbě nejsou (stránka s nimi je v náhledu delší). Při změně struktury (počet zápasů, písmo, vzhled,
  rozhodčí) se stará mapa zahodí. Editor Různé v náhledu bez vnitřních okrajů jako odstavce PDF.
  Stejný mechanismus má od 30. 10. 2026 i úvodní zpravodaj (`doc/feat-zpravodaj.md`).
- Nastavení ve dvou řádcích: datum, rozhodčí, stažení / Vzhled, Písmo (na jeden řádek se nevešly).

## Oproti sscr-zpravodaj vynecháno
- Výběr soutěže / historie / cache v localStorage (soutěž je daná, cache drží proxy).
- Velikost písma po úsecích v Různé (tlačítka 9–16 pt) — editor aplikace má B/I/U, seznamy a odkazy; velikost je jedna (přepínač Písmo).

## Edge cases
- Živé pořadí je aktuální `/table`: když už se hrálo pozdější kolo, náhled varuje, že pořadí neodpovídá stavu po kole
  (u pořadí ze save pointu se nevaruje). Proto save point vznikne nejpozději při prvním stažení.
- Snapshot rozhodčích je podle klíče domácího družstva; když se mezitím rozlosování kola změní, u nových dvojic
  se použije nominace.
- Částečně zadané kolo: zápasy bez výsledku zůstanou jako dvojice a varování je vyjmenuje; Volno a kontumace se nehlásí.
- Družstvo z chess.cz nespárované s aplikací → bez nominovaného rozhodčího + varování.
- pdfmake mění definici na místě → PDF ze `structuredClone` modelu (profil s funkcemi se nekopíruje).

## Kód
`shared/bulletin/round.ts` (konfigurace, výsledky, profily, model), `shared/bulletin/roundLayout.ts` (šířky sloupců,
měření injektované — v prohlížeči canvas s DocFont), `web/src/bulletin/{roundLoad,roundDocx,roundPdf,draft}.ts(x)`,
`web/src/pages/competition/{Bulletins,RoundBulletin}.tsx`, testy `shared/__tests__/roundBulletin.test.ts`.

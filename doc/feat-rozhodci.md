# Nominace rozhodčích a veřejný rozpis

## Nominace rozhodčích (karta před Zpravodajem, `/c/:id/rozhodci`)
- Rozlosování: chess.cz (spárované s družstvy aplikace, `shared/schedule.ts` `competitionSchedule`), a dokud tam
  není, Berger z losovacích čísel aplikace (bez potvrzování, na rozdíl od zpravodaje).
- **Standardně jen ke čtení.** Tlačítko **Upravit** přepne na editaci lokální kopie, **Uložit** ji zapíše jako novou
  verzi, **Zrušit** ji zahodí (s potvrzením, jsou-li změny; při zavření okna varuje prohlížeč). Bez autosave — dřív
  se každý úhoz hned ukládal a nominace se snadno nechtěně přepsala.
- Jen v editaci: **Nominovat automaticky** = rotace: domácí utkání družstva postupně dostávají jeho rozhodčí (kontakty
  role rozhodčí v pořadí e-soupisky), přepíše vše i ruční úpravy. **Smazat nominace**. Obojí s potvrzením a změní jen
  rozpracovanou kopii — v D1 se nic nestane, dokud se neuloží.
- Ruční úprava: pole s našeptáváním (rozhodčí domácích / hostů) nebo libovolné jméno. Rozhodčí, který není rozhodčím
  domácího družstva, je **červeně**. Porovnání jmen nezávisí na pořadí slov, diakritice ani interpunkci
  (`sameName`: „Jakub Jílek“ = „Jílek Jakub“).
- Na kartě nejsou odkazy na soupisky družstev (výjimka z pravidla `TeamName`) — jen názvy.
- **Historie verzí** (jako u soupisek): rozbalovací seznam „verze N · kdy · zdroj · počet utkání“; zdroj = ruční
  úprava / automatická nominace / smazání / obnovení verze. Starší verze se zobrazí jen ke čtení a jde **obnovit**
  (vznikne z ní nová verze, nic se nemaže). Uložení beze změny verzi nevytvoří.
- **Upozornění na úvodní zpravodaj:** má-li úvodní zpravodaj aspoň jeden save point, potvrzení u Upravit,
  automatické nominace, smazání i obnovení verze připojí „Úvodní zpravodaj už má save point (…). Rozhodčí se do
  zpravodaje berou odsud — změna nominací se v něm projeví.“ (zpravodaj si rozhodčí neukládá, čte je živě). Po vydání
  úvodního zpravodaje se tak nominace mění jen vědomě (opravy chyb).
- Úložiště: `referee_assignments (competition_id, round, home_key, name)` = aktuální stav (čtou ho zpravodaje
  a veřejný rozpis); `referee_versions (competition_id, version, source, assignments JSON, created_by, created_at)`
  = historie (migrace 0015 založila verzi 1 z dosavadního nasazení). `home_key` = id družstva v aplikaci nebo
  `cz:<id družstva na chess.cz>`.
- API `GET /competitions/:id/referees` → `{ assignments, version, versions[], initialSavepoints: { count, last } }`,
  `GET …/referees/versions/:v`, `PUT …/referees` `{ assignments, source, base }` — nahradí vše a vytvoří verzi;
  `base` ≠ aktuální verze → 409 (změna z jiného okna).
- Zpravodaje berou rozhodčí odsud (`BulletinData.refs`); úvodní je má jen ke čtení, zpravodaj z kola je smí přepsat
  jen pro sebe. Varování zpravodaje: počet utkání bez nominovaného rozhodčího.
- Když se rozlosování změní (jiné páry), nominace u nových klíčů chybí — znovu nominovat / doplnit.

## Zveřejnění rozlosování
- Přepínač Ano/Ne na kartě Nominace rozhodčích → `competitions.published` (PATCH soutěže).
- Veřejná stránka bez přihlášení `/rozpis/:id` (id soutěže = UUID, neuhodnutelné), vzor
  https://www.chess.cz/soutez/rozpis/3468/: kola, sloupec Začátek (výjimky červeně, poslední kolo `last_start`),
  domácí – hosté, Rozhodčí. Záhlaví: odkaz na soutěž na chess.cz a chess-results (`compWww` z detailu soutěže).
- Aktuální kolo („na programu“) = první kolo s datem ≥ dnes (`currentRoundNr`, `shared/schedule.ts`, datum prohlížeče);
  v kompletním rozpisu je zvýrazněné a stránka se po načtení odroluje tak, aby bylo u horního okraje. Na stránce
  družstva se jen zvýrazní řádek (stránka je krátká, neroluje). Po posledním kole se nezvýrazňuje nic.
- `/rozpis/:id/druzstvo/:key` — vzor https://www.chess.cz/soutez/druzstvo/3468/212974/ bez soupisky: Kolo, Datum,
  Začátek, Zápas, Rozhodčí; kontakty jen kapitán (jméno, telefon, e-mail) a hrací místnost.
- Přepínač vzhledu v záhlaví veřejné stránky, výchozí „chess.cz“. Volba se pamatuje v prohlížeči zvlášť
  (`vs-skin-public`) od vzhledu aplikace (`vs-skin`, výchozí Paper & Ink) — `web/src/lib/skin.ts`, scope podle cesty.
- API `GET /api/v1/public/competitions/:id` (bez auth; 404, není-li zveřejněno). chess.cz přes cache proxy
  s rate-limitem, `Cache-Control: max-age=60`. Route musí být v `worker/index.ts` před routami na `/`, jejich
  `authRequired` na `*` by jinak chytal i `/public/*`.

## Jména podle kontaktů (30. 10. 2026)
Nominace ukládají jména jako text — oprava kontaktu (např. *opravit na …* na Kontrole soupisek) se do nich **automaticky
nepromítne**. Karta proto porovná nominované se jmény v kontaktech (`respelledReferees`, `shared/schedule.ts`: stejné
jméno podle `sameName`, jiný zápis — pořadí slov, diakritika, velikost písmen, interpunkce; nejdřív kontakty domácích,
pak ostatních družstev) a ukáže varování s tlačítkem **Aktualizovat jména podle kontaktů**. Uložení = nová verze se
zdrojem `names` („aktualizace jmen“); mění se jen zápis jmen, kdo píská které utkání, zůstává. Při save pointu
úvodního zpravodaje se ptá jako ostatní změny. Jen v zobrazení aktuální verze (ne při úpravě / staré verzi).

## Výběr rozhodčího při úpravě (30. 10. 2026)
Pole rozhodčího v editaci má stejné menu jako náhled zpravodaje z kola (`web/src/components/RefPicker.tsx`, sdílená
komponenta): ▾ nebo šipka dolů → rozhodčí, kapitán a zástupce domácích, pod čarou hostů (každé jméno jednou,
`refOptions`), nebo libovolné jméno ručně; Enter přejde na další utkání. Dříve `<datalist>` jen s rozhodčími.

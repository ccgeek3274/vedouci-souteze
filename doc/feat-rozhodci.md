# Nasazení rozhodčích a veřejný rozpis

## Nasazení rozhodčích (karta před Zpravodajem, `/c/:id/rozhodci`)
- Rozlosování: chess.cz (spárované s družstvy aplikace, `shared/schedule.ts` `competitionSchedule`), a dokud tam
  není, Berger z losovacích čísel aplikace (bez potvrzování, na rozdíl od zpravodaje).
- **Nasadit automaticky** = rotace: domácí utkání družstva postupně dostávají jeho rozhodčí (kontakty role
  rozhodčí v pořadí e-soupisky). Přepíše vše (i ruční úpravy) — s potvrzením.
- Ruční úprava: pole s našeptáváním (rozhodčí domácích / hostů) nebo libovolné jméno. Rozhodčí, který není rozhodčím
  domácího družstva, je **červeně**. Porovnání jmen nezávisí na pořadí slov, diakritice ani interpunkci
  (`sameName`: „Jakub Jílek“ = „Jílek Jakub“).
- Úložiště `referee_assignments (competition_id, round, home_key, name)`; `home_key` = id družstva v aplikaci nebo
  `cz:<id družstva na chess.cz>`. API `GET/PUT /competitions/:id/referees` (`{ assignments: { "kolo:klíč": jméno } }`,
  PUT nahradí vše, autosave 800 ms).
- Zpravodaje berou rozhodčí odsud (`BulletinData.refs`), ve zpravodaji jsou jen ke čtení. Varování zpravodaje:
  počet utkání bez nasazeného rozhodčího.
- Když se rozlosování změní (jiné páry), nasazení u nových klíčů chybí — znovu nasadit / doplnit.

## Zveřejnění rozlosování
- Přepínač Ano/Ne na kartě Nasazení rozhodčích → `competitions.published` (PATCH soutěže).
- Veřejná stránka bez přihlášení `/rozpis/:id` (id soutěže = UUID, neuhodnutelné), vzor
  https://www.chess.cz/soutez/rozpis/3468/: kola, sloupec Začátek (výjimky červeně, poslední kolo `last_start`),
  domácí – hosté, Rozhodčí. Záhlaví: odkaz na soutěž na chess.cz a chess-results (`compWww` z detailu soutěže).
- `/rozpis/:id/druzstvo/:key` — vzor https://www.chess.cz/soutez/druzstvo/3468/212974/ bez soupisky: Kolo, Datum,
  Začátek, Zápas, Rozhodčí; kontakty jen kapitán (jméno, telefon, e-mail) a hrací místnost.
- API `GET /api/v1/public/competitions/:id` (bez auth; 404, není-li zveřejněno). chess.cz přes cache proxy
  s rate-limitem, `Cache-Control: max-age=60`. Route musí být v `worker/index.ts` před routami na `/`, jejich
  `authRequired` na `*` by jinak chytal i `/public/*`.

# Losovací schůze (M7)

Záložka **Losování** soutěže (`web/src/pages/competition/Draw.tsx`), logika v `shared/draw/` (vitest).

## Rozhodnutí
- **Aplikace nelosuje** (ani „dolosování“). Vedoucí zadá vylosovaná čísla, aplikace ukáže důsledky.
- Rozlosování = FIDE Bergerovy tabulky (`shared/draw/berger.ts`), ověřeno na skutečném rozlosování RPB 2026/27
  (chess.cz soutěž 3468, 10 družstev — test `berger.test.ts`). Lichý počet družstev: tabulka pro n+1,
  číslo bez družstva = volno jeho soupeře (prázdné může být kterékoli číslo, nejen poslední).
- Čísla se zkoušejí lokálně (bez uložení), uloží se tlačítkem (`PUT /competitions/:id/draw-numbers`, ukládá `teams.draw_no`).

## Podklady (tisknutelné, tlačítko Tisk / PDF)
Po družstvech: soupiska ano/ne, kapitán, hrací místnost, rozhodčí, výjimky začátku, požadavky se stavem.
Požadavky k celé soutěži, skupiny družstev stejného oddílu (podle `club_code`, jinak názvu oddílu).

## Podmínky řízeného losování (`draw_constraints`, migrace 0008)
Strukturovaný zápis požadavků (volný text požadavků zůstává v `requests`, na stránce se zobrazí jako připomínka):
- `draw_no` — požadované číslo,
- `home` / `away` — doma / nehrát doma (volno je OK) v kole N,
- `meet` — vzájemný zápas s družstvem skupiny v kole N,
- `alternate` (protičíslo — nehrát doma současně) / `same` (souběžně) — s družstvem skupiny, nebo s družstvem
  **jiné soutěže** zadaným losovacím číslem a počtem družstev té soutěže. Kola se porovnávají podle čísla kola
  (předpoklad stejného kalendáře, např. KP a RP). U dvojice ze stejné skupiny se kolo jejich vzájemného zápasu nepočítá.
- Pravidlo vždy: družstva stejného oddílu se utkají do `mutual_deadline` (výchozí 31. 12. prvního roku sezóny).

## Řízené losování
Pro družstva s podmínkou (nebo se stejným oddílem) bez čísla: ke každému volnému číslu nejnižší dosažitelný
součet „bodů porušení“ (úplné prohledání přes zúčastněná družstva, limit 100 tis. kombinací → pak jen přibližně).
Váhy: číslo 10, doma/venku 3, vzájemný zápas 5, stejný oddíl po termínu 10, protičíslo/souběžně 1 za kolo.
Během zadávání není známo, které číslo zůstane prázdné (volno) — počítá se, jako by všechna čísla měla družstvo.

## Rozlosování
Po kolech s datem z kalendáře, začátek utkání podle `matchStart` (`shared/startTime.ts`, jako `matchTime`
v uvodni-zpravodaj): výjimka domácích doma / hostů venku, různé výjimky = `???`, poslední kolo vždy výchozí začátek.
Mřížka doma/venku po kolech. Rozlosování se zatím neukládá (počítá se z čísel); po importu do chess.cz je pravdou chess.cz.

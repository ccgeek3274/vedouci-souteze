# Losovací schůze (M7)

Záložka **Losování** soutěže (`web/src/pages/competition/Draw.tsx`), logika v `shared/draw/` (vitest).

## Rozhodnutí
- **Aplikace nelosuje** (ani „dolosování“). Vedoucí zadá vylosovaná čísla, aplikace ukáže důsledky.
- Rozlosování = FIDE Bergerovy tabulky (`shared/draw/berger.ts`), ověřeno na skutečném rozlosování RPB 2026/27
  (chess.cz soutěž 3468, 10 družstev — test `berger.test.ts`). Lichý počet družstev: tabulka pro n+1,
  číslo bez družstva = volno jeho soupeře (prázdné může být kterékoli číslo, nejen poslední).

## Postup na schůzi
Losovací čísla jsou na začátku prázdná. Během schůze se vypořádávají požadavky (začátky utkání se schvalují,
požadavky na losování se upřesňují) a čísla se doplňují postupně, jak se losuje — každé se hned uloží
(`PUT /competitions/:id/draw-numbers`, server hlídá jedinečnost). „Vymazat všechna čísla“ s potvrzením.

## Podklady (tisknutelné, tlačítko Tisk / PDF)
Pořadí, družstvo, požadavky (druh, upřesnění, původní text, stav, rozhodnutí). Požadavky k celé soutěži,
skupiny družstev stejného oddílu (podle `club_code`, jinak názvu oddílu).

## Požadavky na losování (`requests.kind = 'draw_no'`, migrace 0009)
Jedna entita s požadavky (žádná zvláštní tabulka podmínek — původní `draw_constraints` z 0008 převedeny a zrušeny).
Upravují se na záložce Požadavky, v detailu družstva i na záložce Losování (společné `RequestItems.tsx`).
Strukturovaná část (`draw_kind` + pole) je celá **nepovinná**; neúplný požadavek = „nevyřešeno — chybí …“
a do kontrol ani řízeného losování se nezapočítá. Zamítnutý se nekontroluje.
- `draw_no` — požadované číslo (`value`),
- `home` / `away` — doma / nehrát doma (volno je OK) v kole (`round`),
- `meet` — vzájemný zápas s družstvem skupiny (`other_team_id`) v kole,
- `alternate` (protičíslo — nehrát doma současně) / `same` (souběžně) — s družstvem skupiny, nebo s družstvem
  **jiné soutěže** (`ext_name`, `ext_no` = jeho losovací číslo, `ext_teams` = počet družstev té soutěže; číslo
  se typicky upřesní až na schůzi). Kola se porovnávají podle čísla kola (předpoklad stejného kalendáře, např. KP a RP).
  U dvojice ze stejné skupiny se kolo jejich vzájemného zápasu nepočítá.
- Import e-soupisky: „Požadavky na losování“ → požadavek na losování; text s „protičíslo“ předvyplní druh `alternate`.
- Stav ve vyhodnocení: nevyřešeno / čeká na losovací čísla / splněno / porušeno.
- Pravidlo vždy: družstva stejného oddílu se utkají do `mutual_deadline` (výchozí 31. 12. prvního roku sezóny).

## Řízené losování
Pro družstva s (úplným) požadavkem nebo se stejným oddílem bez čísla: ke každému volnému číslu nejnižší dosažitelný
součet „bodů porušení“ (úplné prohledání přes zúčastněná družstva, limit 100 tis. kombinací → pak jen přibližně).
Kliknutí na číslo (s potvrzením) ho družstvu přidělí. Váhy: číslo 10, doma/venku 3, vzájemný zápas 5,
stejný oddíl po termínu 10, protičíslo/souběžně 1 za kolo.
Během losování není známo, které číslo zůstane prázdné (volno) — počítá se, jako by všechna čísla měla družstvo.

## Rozlosování
Po kolech s datem z kalendáře, začátek utkání podle `matchStart` (`shared/startTime.ts`, jako `matchTime`
v uvodni-zpravodaj): výjimka domácích doma / hostů venku, různé výjimky = `???`, poslední kolo vždy výchozí začátek.
Mřížka doma/venku po kolech. Rozlosování se zatím neukládá (počítá se z čísel); po importu do chess.cz je pravdou chess.cz.

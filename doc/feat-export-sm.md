# Export pro Swiss-Manager Automat

Záložka **Swiss-Manager** v soutěži stáhne jeden JSON se všemi družstvy a soupiskami pro
`../swiss-manager-automat` (`sm_vloz.py druzstva …`, pak soupisky družstev).

**Formát definuje Automat**: `swiss-manager-automat/docs/FORMAT_SOUPISKY.md` (vzor `priklady/turnaj.json`,
čte `sm_vstup.z_json`), `app: "vedouci-souteze"`, `version: 1`. Tady jen popisujeme, jak na něj převádíme naše data.
Kopii vzoru drží test `shared/__tests__/fixtures/sm-turnaj.json`. Když Automat formát změní, aktualizuj ji spolu
s `SM_EXPORT_VERSION`.

## Kde to je
- `shared/export/swissManager.ts`: `buildSmExport` (čistá funkce: data → `{ file, issues }`), testy v
  `shared/__tests__/swissManagerExport.test.ts`.
- `GET /api/v1/competitions/:id/export/swiss-manager` vrací náhled pro UI (`{ file, issues, filename }`).
- `GET /api/v1/competitions/:id/export/swiss-manager.json` vrací samotný soubor s `Content-Disposition`
  (pro skripty s Bearer tokenem).
- `web/src/pages/competition/SwissManager.tsx`: náhled, upozornění, stažení.

## Převod
| Formát | Odkud |
|---|---|
| `turnaj.nazev` | `competitions.name` + `season` (jen pro výpis) |
| `turnaj.zaklad` | `competitions.boards`. **Ne** `roster_versions.base_count`: SM má jeden základ pro celý turnaj |
| `turnaj.id` | *navíc*: `competitions.id`, aby šlo soubor dohledat |
| `druzstva[]` | aktivní družstva (`status = 'active'`), **seřazená podle `draw_no`**, bez čísla na konci podle `position` |
| `nazev`, `cislo_klubu` | `teams.name`, `teams.club_code` (chybí-li, klíč se vynechá) |
| `los` | *navíc*: `teams.draw_no`. `sm_vloz` zakládá družstva v pořadí pole a to je startovní číslo v SM (Berger) |
| `soupiska_verze` | *navíc*: číslo aktuální `roster_versions.version` |
| `extra.kap*`, `extra.zast*` | `team_contacts` role `kapitan` / `zastupce`, první podle `position` |
| `extra.hraciMistnost` | `teams.venue` (SM ořeže na 70 znaků, Automat taky; hlásíme jen jako info) |
| `hraci[]` | aktuální verze soupisky **bez vyškrtnutých** (`struck`), `poradi` přečíslované od 1 |
| `lok`, `fide` | ze soupisky, chybějící doplněné z ověření na chess.cz (`cz_json.member`) |
| `pismenka` | `base` → `Z`, `flags` → `H/V/C` a `K/ZK`, kanonicky `Z`, písmeno, funkce |
| `jmeno`, `rok`, `elo_cr`, `elo_fide` | soupiska / snapshot chess.cz. Automat je jen porovnává s Elo listinou SM |

Nepovinné klíče se při neznámé hodnotě **vynechávají** (podle formátu chybějící = „nevím“). `extra` se posílá
vždy celé, prázdný řetězec = „vím, že je prázdné“.

Klíče označené *navíc* Automat zatím nečte. Neznámé klíče ignoruje, takže verze formátu zůstává 1.

## Upozornění (`issues`)
- **error**: Automat soupisku nevloží nebo vyjde špatný turnaj. Hráč bez LOK i FIDE ID, stejné ID na dvou
  soupiskách, dvě družstva se stejným losovacím číslem.
- **warn**: chybí losovací číslo, soupiska nebo číslo klubu; méně `Z` než šachovnic; `K` / `ZK` chybí nebo je víckrát.
  Automat písmena hlásí jako chybu, ale vložit nebrání.
- **info**: vyškrtnutí vynecháni, neověření hráči (Automat pak nemá Elo ke kontrole), Info přes 70 znaků, kapitán
  na soupisce se jménem liší od kontaktu (`samePerson`: nezáleží na pořadí slov ani na přídomcích jako „st.“).

Stáhnout jde vždycky i s chybami, rozhoduje vedoucí. Automat to stejně zkontroluje znovu proti Elo listině SM.

## Ověřeno
Export z lokální RPB 2026/27 přečetl `sm_vstup.nacti` bez chyby. Jeho `zkontroluj_druzstvo` hlásí stejné
problémy jako náš náhled.

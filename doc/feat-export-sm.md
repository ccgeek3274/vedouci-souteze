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
- `web/src/pages/competition/SwissManager.tsx`: náhled s editací zkratek a Info, upozornění, stažení.
  Záložka je před Zpravodajem.
- `shared/teamShorten.ts` + `worker/lib/teamShortData.ts` + `worker/data/team-shorten/`: zkrácené názvy družstev.

## Převod
| Formát | Odkud |
|---|---|
| `turnaj.nazev` | `competitions.name` + `season` (jen pro výpis) |
| `turnaj.zaklad` | `competitions.boards`. **Ne** `roster_versions.base_count`: SM má jeden základ pro celý turnaj |
| `turnaj.id` | *navíc*: `competitions.id`, aby šlo soubor dohledat |
| `druzstva[]` | aktivní družstva (`status = 'active'`), **seřazená podle `draw_no`**, bez čísla na konci podle `position` |
| `nazev`, `cislo_klubu` | `teams.name`, `teams.club_code` (chybí-li, klíč se vynechá) |
| `zkratka` | *navíc*: `teams.short_name` (Zkratka v SM), viz níž |
| `los` | *navíc*: `teams.draw_no`. `sm_vloz` zakládá družstva v pořadí pole a to je startovní číslo v SM (Berger) |
| `soupiska_verze` | *navíc*: číslo aktuální `roster_versions.version` |
| `extra.kap*`, `extra.zast*` | `team_contacts` role `kapitan` / `zastupce`, první podle `position`; vždy všechno |
| `extra.hraciMistnost` | Info v SM: `teams.sm_info`, jinak automaticky, vždy nejvýš 70 znaků (viz níž) |
| `hraci[]` | aktuální verze soupisky **bez vyškrtnutých** (`struck`), `poradi` přečíslované od 1 |
| `lok`, `fide` | ze soupisky, chybějící doplněné z ověření na chess.cz (`cz_json.member`) |
| `pismenka` | `base` → `Z`, `flags` → `H/V/C` a `K/ZK`, kanonicky `Z`, písmeno, funkce |
| `jmeno`, `rok`, `elo_cr`, `elo_fide` | soupiska / snapshot chess.cz. Automat je jen porovnává s Elo listinou SM |

Nepovinné klíče se při neznámé hodnotě **vynechávají** (podle formátu chybějící = „nevím“). `extra` se posílá
vždy celé, prázdný řetězec = „vím, že je prázdné“.

Klíče označené *navíc* Automat zatím nečte. Neznámé klíče ignoruje, takže verze formátu zůstává 1.

## Kapitán týmu
Exportujeme vždy jméno, telefon i e-mail kapitána a zástupce. Co z toho napsat do políčka SM „Kapitán týmu“
(jen jméno, se zástupcem, s kontakty), je volba **Automatu**, ne exportu: dnes píše jen `kapJmeno`.
(Krátce tu byly přepínače na stránce, které skládaly text do `kapJmeno`; zrušeno, `kapJmeno` je zase jen jméno.)

## Info (hrací místnost)
Automaticky (`smInfoAuto`) = `teams.venue` + nestandardní začátek domácích utkání jen jako čas v závorce:
`Sokolovna, Husova 12 (10:00)` (`start_home` různý od `default_start`; kola, kde výjimka neplatí, se neuvádějí).
SM bere jen 70 znaků: ořezává se **hrací místnost**, čas na konci zůstane vždy celý. Tabulka ukazuje výsledných
≤ 70 znaků, plný text je v tooltipu, ořezané mají štítek „ořezáno“. Upravená hodnota se ukládá do `teams.sm_info`
(max 70, kontroluje API) a má přednost; prázdná / ↺ = zpět na automatické. Upravené Info se po změně hrací místnosti **neaktualizuje** samo.

## Zkrácený název (`teams.short_name`)
Generuje se **jen na stránce SM**: náhled exportu doplní družstvům bez zkratky návrh a rovnou ho uloží, takže pozdější
úprava (tabulka SM nebo detail družstva) zůstane. Vymazání = při příští návštěvě SM se vygeneruje znovu.

Algoritmus je port `../pgn-base` (`backend/src/lib/teamShorten.ts`, popis `docs/feat-team-name-shortening.md`):
slovník zkratek klubů vytěžený z historických PGN (fuzzy shoda podle názvu) → obce ČR (nejdelší shoda) → heuristika;
v rámci soutěže unikátní (kolize různých klubů dostanou další slovo, A/B jednoho klubu jen písmeno). Rozdíly proti pgn-base:
- vrací diakritiku podle původního názvu (`restoreDiacritics`: `Sedlcany` → `Sedlčany`), PGN ji nechce, SM ano;
- bez prefixu soutěže (Event tag) a bez admin overrides — override je ruční úprava zkratky u družstva;
- data (`club_label_dict.json`, `gazetteer_obce.json`) jsou zkopírovaná jako dvojice do `worker/data/team-shorten/`
  a zabalená do Workeru (~280 kB, gzip ~120 kB celý bundle), ne v D1 — jen se čtou a jen tady. Při přegenerování
  dat v pgn-base zkopírovat znovu (`[label, clubName]`, `[full, core]`).

Automat zatím `zkratka` nečte (SM si zkratku dopočítá z názvu sám); než ji začne zapisovat, slouží jen k přípravě.

## Upozornění (`issues`)
- **error**: Automat soupisku nevloží nebo vyjde špatný turnaj. Hráč bez LOK i FIDE ID, stejné ID na dvou
  soupiskách, dvě družstva se stejným losovacím číslem.
- **warn**: chybí losovací číslo, soupiska, číslo klubu nebo zkratka; dvě družstva se stejnou zkratkou; méně `Z` než šachovnic; `K` / `ZK` chybí nebo je víckrát.
  Automat písmena hlásí jako chybu, ale vložit nebrání.
- **info**: vyškrtnutí vynecháni, neověření hráči (Automat pak nemá Elo ke kontrole), automatické Info přes 70 znaků, kapitán
  na soupisce se jménem liší od kontaktu (`samePerson`: nezáleží na pořadí slov ani na přídomcích jako „st.“).

Stáhnout jde vždycky i s chybami, rozhoduje vedoucí. Automat to stejně zkontroluje znovu proti Elo listině SM.

## Ověřeno
Export z lokální RPB 2026/27 přečetl `sm_vstup.nacti` bez chyby. Jeho `zkontroluj_druzstvo` hlásí stejné
problémy jako náš náhled.

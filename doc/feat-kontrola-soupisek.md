# Kontrola soupisek (M6)

Záložka **Kontrola soupisek** + sloupec „Kontrola chess.cz“ v detailu družstva.
Logika: `shared/roster/verify.ts`, parsery registrů `shared/registry.ts` (testy `shared/__tests__/verify.test.ts`),
běh v prohlížeči `web/src/lib/rosterCheck.ts`, registry ve Workeru `worker/lib/registry.ts` + `routes/registry.ts`.

## Rozhodnutí (vedoucí, 8. 10. 2026)
- **Příspěvky se nekontrolují.** Rozhoduje jen registrace na chess.cz: „Aktivní“ (u cizinců „Cizinec“), jinak návrh na vyškrtnutí.
- **Duplicity se nekontrolují** (hráč smí být až na třech soupiskách). Řeší je chess.cz/kontrola-soupisek
  (hráči bez registrace, na více než třech soupiskách) — aplikace stránku jen přebírá a filtruje na soutěž;
  smysl má až těsně před definitivním zpravodajem (po nahrání soupisek do chess.cz).
- **Kontrolují se označení** (soupiska může obsahovat chybu):
  - **Z** podle pravidla e-soupisky (sscr-soupiska `recalcZaklad`): prvních N hráčů (N = počet šachovnic),
    písmenkových H/V/C v Z nejvýše ceil(N/2)−1 (8 → 3, 5 → 2), další písmenkový se přeskočí; vyškrtnutí se nepočítají.
  - **C** = na profilu chess.cz registrace „Cizinec“ (obousměrně).
  - **H** = host: hráč jiného oddílu než družstvo (obousměrně).
  - **V** = volný: hráč mateřského oddílu, který je v základní sestavě (Z) družstva oddílu ve vyšší soutěži (obousměrně).
- **Potvrzené hostování / registrace cizince** podle registrů ŠSČR; ruční „doloženo“ zůstává pro papírové doklady.

## chess.cz (Worker proxy, ~3 req/s, cache)
- Hráči: `/clubs/{code}/members` hromadně (oddíl družstva = zadaný, jinak většinový oddíl ne-hostujících hráčů,
  uloží se k družstvu), zbytek `/members/{lok}/cze`, `/members/{fide}/fide`, bez ID hledání podle jména
  (jediný kandidát → „Doplnit LOK“). Nenalezený hráč = `200 []`.
- Vyšší soutěže (pro V): `/competitions/{rok}` → soutěže dospělých ŠSČR (98) a kraje s `compLevel` menším než naše
  (KP 3, KS 4, RP 5, RS 6) → `/table` → soupisky (`/team/{id}/roster`, `playerId` = LOK, `playerFlags` „ H Z“) jen
  u družstev, jejichž název (bez písmene) odpovídá našemu družstvu/oddílu. O V rozhoduje LOK + Z bez H.
  Pro RPB ~12 tabulek + soupisky družstev dotčených oddílů; vše v cache 1 h.

## Registry bez API (nedokumentované, opatrně)
| Zdroj | URL | Formát |
|---|---|---|
| hostování potvrzená | `hostovani.appchess.cz/exportCsvConfirmed/actual` | CSV `;`, cp1250, s LOK a kódy oddílů |
| hostování nepotvrzená | `hostovani.appchess.cz/unconfirmed` | HTML tabulka, bez LOK (párování jménem) |
| cizinci potvrzení | `registracecizincu.appchess.cz/exportCsvConfirmed/actual` | CSV `;`, cp1250, LOK/FIDE, kód oddílu |
| cizinci nepotvrzení | `registracecizincu.appchess.cz/unconfirmed` | HTML tabulka s LOK/FIDE |
| kontrola soupisek | `www.chess.cz/kontrola-soupisek/?poradatel=12` | HTML, sekce `<h4>` + tabulka, LOK v odkazu `/hrac/{lok}` |

`/confirmed` (HTML ~1 MB) se nepoužívá, CSV je menší a nese ID. JSON API neexistuje (`.json`, `/api/…` → 404).
Worker: jedna cache položka na zdroj (TTL 1 h, při výpadku stará kopie), rozestup ≥ 1,5 s mezi staženími
(`chesscz_rate` id 2). Klient dostane jen řádky sezóny soutěže.

Párování: hostování = LOK + hostitelský oddíl = oddíl družstva + soutěž (`sameCompetition`: uvozovky, „SŠS“,
„(bez určení skupiny)“ platí pro všechny skupiny úrovně). Jiná soutěž → upozornění, jiný oddíl / čeká na schválení /
nic → nedostatek a návrh na vyškrtnutí (pokud není ručně doloženo). Cizinci obdobně (oddíl = oddíl družstva), bez vyškrtnutí.

## Ukládání
Snapshot (`CzCheck`: záznam chess.cz, řádky registrů, záznamy ve vyšších soutěžích) je u hráče
(`roster_players.cz_json`, `cz_checked_at`), při importu nové verze soupisky se přenáší spolu s „doloženo“ a
vyškrtnutím (párování LOK, bez LOK jméno). Změna LOK/FIDE snapshot zahodí. Z se počítá vždy z aktuální soupisky.

## Výstup
- Nedostatky (✕) a upozornění (!) u hráčů; vyškrtnutí vždy ručně (jednotlivě / „Vyškrtnout navržené“), lze vrátit.
- „Nedostatky pro předběžný zpravodaj“ = text po družstvech (`deficiencyReport`) — v M8 se vloží do zpravodaje.

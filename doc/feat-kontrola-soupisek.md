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
  - **Z** musí sedět bez výjimek, pravidlo e-soupisky (sscr-soupiska `recalcZaklad`): prvních N hráčů (N = počet
    šachovnic), z nich nejvýše ceil(N/2)−1 písmenkových H/V/C (8 → 3, 5 → 2); každý další písmenkový se přeskočí
    a základní sestava se tím posune/prodlouží (4 a více písmenkových na soupisce je v pořádku). Šedá zóna:
    přeskočený písmenkový hráč smí mít Z (hraje jako Z, ale nepočítá se do počtu) → `expectedBase` vrací `'optional'`
    a kontrola u něj Z nehlásí. Vyškrtnutí hráči se nepočítají.
  - **C** = na profilu chess.cz registrace „Cizinec“ (obousměrně).
  - **H** = host: hráč jiného oddílu než družstvo (obousměrně).
  - **V** = volný: hráč mateřského oddílu, který je v základní sestavě (Z) družstva oddílu ve vyšší soutěži (obousměrně).
- **Potvrzené hostování / registrace cizince** podle registrů ŠSČR; ruční „doloženo“ zůstává pro papírové doklady.

## chess.cz (Worker proxy, ~3 req/s, cache)
- Hráči: `/clubs/{code}/members` hromadně (oddíl družstva = zadaný, jinak většinový oddíl ne-hostujících hráčů,
  uloží se k družstvu), zbytek `/members/{lok}/cze`, `/members/{fide}/fide`, bez ID hledání podle jména
  (jediný kandidát → „Doplnit LOK“). Nenalezený hráč = `200 []`.
- Vyšší soutěže (pro V) — **samostatné tlačítko „Ověřit V v celé soutěži“** (rozhodnutí 8. 10. 2026: oddělit od
  běžné kontroly, jen na úrovni soutěže, přijímáme, že není dokonalá; výsledek v `roster_players.v_json`, `v_checked_at`,
  běžná kontrola ho nepřepisuje, při nové verzi soupisky se přenáší, změna LOK ho zahodí). Známá slabá místa:
  družstvo oddílu s úplně jiným názvem se nenajde (chybějící V se pak neodhalí); falešné shody názvů (DDM / TJ, AŠ /
  Sokol) nevadí, rozhoduje LOK + Z bez H; před nahráním soupisek vyšších soutěží do chess.cz hlásí falešné chyby.
  Postup: `/competitions/{rok}` → soutěže dospělých ŠSČR (98) a kraje s `compLevel` menším než naše
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
„(bez určení skupiny)“ platí pro všechny skupiny úrovně). Potvrzení lze poslat i ručně e-mailem (pak v registru není),
proto: chybí / čeká na schválení / jen pro jinou soutěž → **upozornění** (u hostování s návrhem na vyškrtnutí), které
zmizí po ručním zaškrtnutí „doloženo“; potvrzení jen pro **jiný oddíl** → **nedostatek**. Cizinci obdobně (oddíl =
oddíl družstva), bez návrhu na vyškrtnutí.

Rozhodnutí 8. 10. 2026:
- Vyškrtnutí = příznak (hráč zůstává přeškrtnutý, lze vrátit); odebrání hráče jen ručně v editaci soupisky.
- Jméno se musí shodovat s ID (LOK/FIDE) — neshoda = nedostatek (typicky překlep v ID). Rozlišení ml./st. se
  dopočítá automaticky při generování úvodního zpravodaje (M8), na soupisce ho neevidujeme (při porovnání se ignoruje).
- **Preferovaný zápis jména je chess.cz** (rozhodnutí 30. 10. 2026): do SM se vkládá jen ID a písmenka, zbytek SM
  načte z Elo listiny — tedy totéž co chess.cz. Stejný hráč jinak zapsaný (pořadí, diakritika, velikost písmen, ml./st.)
  → upozornění „na chess.cz zapsán jako …“ s tlačítkem *převzít z chess.cz* (`Issue.czName`, PATCH `name`), hromadně
  *Jména hráčů podle chess.cz*. U nedostatku „jméno nesouhlasí s ID“ jde převzít jméno také, ale jen jednotlivě
  a po potvrzení (obvykle je chyba v ID — převzetím by na soupisce zůstal jiný hráč).
- Sloupec Z: normální hodnoty jsou „ano“, „Z“ (generátor sscr-soupiska) a prázdno; cokoli jiného se tolerantně
  vyhodnotí a nahlásí upozorněním při importu.

## Ukládání
Snapshot (`CzCheck`: záznam chess.cz, řádky registrů, záznamy ve vyšších soutěžích) je u hráče
(`roster_players.cz_json`, `cz_checked_at`), při importu nové verze soupisky se přenáší spolu s „doloženo“ a
vyškrtnutím (párování LOK, bez LOK jméno). Změna LOK/FIDE snapshot zahodí. Z se počítá vždy z aktuální soupisky.

## Výstup
- Nedostatky (✕) a upozornění (!) u hráčů; vyškrtnutí vždy ručně (jednotlivě / „Vyškrtnout navržené“), lze vrátit.
- **Odsouhlasení nálezu** (rozhodnutí 30. 10. 2026): u každého nálezu (✕ i !) tlačítko *odsouhlasit* na Kontrole
  soupisek i v detailu družstva. Odsouhlasený nález je šedě s ✓, nepočítá se do „s nedostatky“, nenavrhuje vyškrtnutí
  a nejde do zpravodaje; *zrušit* ho vrátí. Uloženo u hráče `roster_players.accepted_issues` (JSON pole textů nálezů,
  migrace 0016), přenáší se do nové verze soupisky. Párování podle textu: když se nález změní (jiný oddíl, soutěž…),
  je třeba ho odsouhlasit znovu; při přepnutí se texty, které už kontrola nehlásí, zahodí (`toggleAccepted`).
- „Nedostatky pro předběžný zpravodaj“ = text po družstvech (`deficiencyReport`): nedostatky + vše, co vede
  k návrhu na vyškrtnutí — v M8 se vloží do zpravodaje.

## Jména v kontaktech (30. 10. 2026)
Lehká kontrola bez chess.cz (`shared/roster/contactNames.ts`, karta družstva na Kontrole soupisek): jména kapitána,
zástupce, komunikace a rozhodčích se porovnají se soupiskami (nevyškrtnutí hráči). Soupisky, chess.cz i zpravodaje
píšou „Příjmení Jméno“; kontakt v jiném pořadí by šel do adresáře a k rozhodčím ve zpravodaji obráceně.
- Hráč se stejnými slovy v jiném pořadí (vlastní soupiska, pak ostatní v soutěži) → „přehozené jméno a příjmení?“,
  návrh = jméno hráče v preferovaném zápisu (z chess.cz, je-li to stejné jméno, jinak ze soupisky).
- Lidé mimo soupisky (typicky rozhodčí): první slovo je na soupiskách křestní jméno (poslední slovo) a nikde
  příjmení, poslední slovo nikde křestní → „vypadá jako Jméno Příjmení“, návrh = první slovo na konec (jen bez titulů).
- Tituly a ml./st. se ignorují, diakritika a velikost písmen také. Jen upozornění (!), nejde do zpravodaje,
  nejde odsouhlasit; *opravit na …* přepíše kontakt (všechny kontakty družstva s tím jménem — kapitán bývá i rozhodčí).
  Hromadně: v kartě družstva *Opravit všechna přehozená jména v kontaktech*, pro celou soutěž tlačítko nahoře —
  obojí jen přehozená (shoda se soupiskou), odhady „Jméno Příjmení“ jen jednotlivě.
  Nominace rozhodčích mají jména uložená zvlášť — po opravě kontaktu je případně opravit tam.

## Ruční úprava soupisky
Detail družstva → „Upravit soupisku“: jméno, rok, LOK, FIDE, Z, H/V/C, K/ZK, pořadí, přidání / odebrání
hráče, „Nastavit Z podle pravidla“ (přeskočeným písmenkovým ponechá volbu kapitána). Uložení = nová verze soupisky
(zdroj `manual`) přes běžný import, takže „doloženo“, vyškrtnutí a snapshot kontroly jdou s hráčem (párování LOK).

## Import: sloupec Z
Buňka se rozdělí na slova; Z = kterékoli z „ano / a / z / x / 1 / ✓ / yes“ (bez ohledu na velikost, tečku).
Každá hodnota jiná než „ano“ / „Z“ / prázdno (např. „ano,ml.“) se nahlásí jako varování importu.

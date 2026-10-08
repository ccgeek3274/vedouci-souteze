# Kontrola soupisek proti chess.cz (M6)

Záložka **Kontrola soupisek** + sloupec „Kontrola chess.cz“ v detailu družstva.
Logika: `shared/roster/verify.ts` (testy `shared/__tests__/verify.test.ts`), běh v prohlížeči `web/src/lib/rosterCheck.ts`.

## Proč v prohlížeči
Dotazy na chess.cz jdou postupně přes Worker proxy (rate gate ~3 req/s, cache 24 h). Klient řídí průběh
(zobrazuje „družstvo: 5/18“) a výsledek uloží `PUT /teams/:id/roster-check`. Worker tak nenaráží na limity
subrequestů / D1 dotazů na jednu invokaci a celá skupina (~140 hráčů) trvá zhruba minutu.

## Vyhledání (port `enrichRosterPlayers` ze sscr-soupiska)
- Známé č. oddílu družstva (`teams.club_code`) → jeden `/clubs/{code}/members` pokryje většinu hráčů.
- Neznámé → kotva = první ne-hostující hráč s LOK, jeho aktuální oddíl se stáhne hromadně (max 2 oddíly);
  oddíl družstva = většinový oddíl ne-hostujících hráčů (H/C se nepočítají) a uloží se k družstvu (lze opravit v detailu).
- Zbytek po jednom: LOK → `/members/{lok}/cze`, jinak FIDE → `/members/{fide}/fide`, jinak hledání podle jména
  (kandidáti se shodným jménem; jediný kandidát → tlačítko „Doplnit LOK“).
- Nenalezený hráč vrací chess.cz jako `200 []`.
- Výpadek chess.cz → částečný výsledek se uloží, chyba se zobrazí.

Snapshot záznamu (`CzCheck`) se ukládá k hráči (`roster_players.cz_json`, `cz_checked_at`) a při importu nové
verze soupisky se přenáší spolu s „doloženo“ a vyškrtnutím (párování podle LOK, bez LOK podle jména).
Změna LOK/FIDE hráče snapshot zahodí.

## Kontroly (`playerIssues`)
| Závažnost | Kontrola | Návrh vyškrtnutí |
|---|---|---|
| ✕ | registrace ≠ „Aktivní“ (výjimka: „Cizinec“ u hráče s C; bez C jen upozornění) | ano |
| ✕ | `feeYear` < rok začátku sezóny (2026/2027 → 2026) | ano |
| ✕ | hráč jiného oddílu bez označení H/C | ano, pokud není doloženo |
| ✕ | H bez doloženého povolení hostování | ano |
| ✕ | C bez dokladu cizince | ne |
| ✕ | chybí LOK / LOK nenalezen | ne |
| ✕ | stejný LOK na jiné soupisce téže soutěže | ne |
| ! | jméno, rok narození, FIDE ID se liší od chess.cz; H u člena vlastního oddílu | ne |
| ! | stejný LOK na soupisce v jiné soutěži uživatele téže sezóny | ne |

Porovnání jmen ignoruje pořadí slov, diakritiku a přípony ml./st./jr./sr.

Rozpis: před definitivním zpravodajem se vyškrtnou hráči bez registrace, bez zaplaceného příspěvku a hosté bez
povolení hostování. Vyškrtnutí je vždy ruční (po jednom, nebo „Vyškrtnout navržené“ s potvrzením) a lze ho vrátit.

## Výstup
„Nedostatky pro předběžný zpravodaj“ = text po družstvech (`deficiencyReport`), jen závažné nedostatky nevyškrtnutých
hráčů. V M8 se použije přímo v úvodním zpravodaji.

## Otevřené
- Požadovaný rok příspěvku = rok začátku sezóny (předpoklad, k potvrzení).

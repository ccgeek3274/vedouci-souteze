# Analýza reálných e-soupisek (RPB 2026/27)

Vstup pro M5 (import soupisek). Soubory v `doc/soupisky/` poslali kapitáni e-mailem; obsahují chyby
a část informací přišla jinou cestou (e-mail, telefon). Telefony, e-maily a domácí adresy jsou anonymizované
(deterministicky: stejný kontakt = stejná náhrada, e-mail `prijmeni.jmeno@example.cz`), jména hráčů a kontaktů zůstala. **Pro chybné formáty se nevyvíjí žádná funkcionalita** —
import je musí jen srozumitelně odmítnout, data zadá vedoucí ručně.

## Přehled
| Soubor | Formát | Poznámka |
|---|---|---|
| Aero Odolena Voda E-soupiska_2026-2027-1.xlsx | šablona 2026/27 | 16 hráčů |
| D-soupiska 2026-2027 Dobrovice D.xlsx | šablona 2026/27 | list „Soupiska D“, rowCount 999 (prázdné řádky) |
| E-soupiska 2026-2027 Dobrovice E.xlsx | šablona 2026/27 | rowCount 998 |
| E-soupiska_2026-2027 _Celakovice_ B.xlsx | šablona 2026/27 | 20 hráčů |
| E-soupiska_2026-2027_TJ_Auto_Škoda_Mladá_Boleslav_A.xlsx | šablona 2026/27 | 20 hráčů |
| E-soupiska_2026-2027 TJ Neratovice D.xlsx | šablona 2026/27 | 18 hráčů, 2 rozhodčí |
| KRALUPY C_E-soupiska_2026-2027.xlsx | šablona 2026/27 | soutěž „RP B, SŠS“ |
| Soupiska Sokol Brandýs n.L.B.xlsx | šablona 2026/27 | 17 hráčů |
| Mšeno soupiska.xlsx | **starší varianta šablony** | hráči od ř. 9, bez sloupce FIDE (E=Označení, F=Z), bez sekcí „Další požadavky“ a „Komunikace“ |
| Soupiska_Excel_2026 Bakov C.xlsx | **vlastní formát** | jiné rozložení i sloupce (VT, Elo) → nepodporovat, ruční zadání |
| E-soupiska_2026-2027_polabí.xls | **binární .xls (BIFF), vlastní rozložení** | ExcelJS neumí → nepodporovat, výzva „uložte jako .xlsx“ |

## Důsledky pro import (M5)
- Nehledat pevné adresy buněk (`fillSoupiska` konstanty), ale **kotvy podle textu ve sloupci A**:
  `Kraj:`, `Soutěž:`, `Název družstva:`, `Oddíl:`, `Pořadí` (hlavička tabulky), `Kapitán:`, `Zástupce kapitána:`,
  `Hrací místnost:`, `Přezůvky:`, `Preference jiného začátku…`, `Další požadavky…`, `Údaje pro komunikaci…`, `Jako rozhodčí…`.
- **Sloupce tabulky hráčů mapovat podle textů v řádku hlavičky** („Příjmení Jméno“, „Rok narození“, „Číslo LOK“,
  „Číslo FIDE“, „Označení“, „Z“) — tím se pokryje i starší varianta (Mšeno) bez speciálního kódu.
- Odpověď na preferenci/požadavky bývá ve sloupci D (sloučené buňky A–F opakují text otázky) — brát první buňku,
  jejíž text se liší od otázky. Hodnoty „ne“/„NE“ = žádný požadavek; volný text („10hod“) → záznam `requests` k potvrzení.
- Telefony jako čísla (`604409805`) normalizovat na `604 409 805`.
- Soutěž je volný text („Regionální přebor B“, „RP B, SŠS“, „Regionální přebor SŠS, skupina B“) → jen informativní,
  přiřazení k družstvu podle názvu družstva/oddílu (fuzzy) s ruční volbou.
- Název družstva se liší od chess.cz i od zpravodaje („Aero Odolena voda“ vs. „TJ AERO Odolena Voda A“, „Kralupy C“) —
  rozhoduje párování v M3.
- Ukázka chybějících údajů: požadavek Mšena na začátek 10:00 je v soupisce, požadavek Kralup C ne (přišel jinak).

## Vztah ke zpravodaji `rpb_26_27_uz_v3.docx`
Ve zpravodaji je 10 družstev (bez Čelákovic B a „ŠACHY PRO RADOST!! A“ z rozdělení 27. 7.; Šachy Polabí A přibylo) —
ukázka změn složení skupiny na losovací schůzi (družstvo do zálohy / nové družstvo).
Ručně doplněné části zpravodaje, které má aplikace generovat z dat: tabulka hracích místností (s výjimkou začátku),
adresář kapitánů/zástupců/komunikace, specifické požadavky (jiné začátky + vyhodnocení posledního kola),
další oznámení (vzájemný zápas družstev stejného oddílu, hráči s omezením nástupu), stránky soutěže, hlášení výsledků.

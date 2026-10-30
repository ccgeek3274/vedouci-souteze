# Úvodní zpravodaj (M8)

Záložka **Zpravodaje** soutěže. Port generátoru `../uvodni-zpravodaj` (DOCX) rozšířený o kapitoly ze skutečného
zpravodaje RPB 2026/27 (`doc/rpb_26_27_uz_v3.docx`) a o PDF (pdfmake + Carlito jako `../sscr-zpravodaj`).

## Rozhodnutí (potvrzeno uživatelem)
- **Soupisky a rozlosování vždy z chess.cz**, i u předběžného zpravodaje. Data aplikace (soupisky z importu,
  rozlosování z losovacích čísel přes Bergera) jen když je chess.cz ještě nemá — a jen po výslovném potvrzení
  (zaškrtávátka v kartě *Zdroj dat*, uložená v konceptu `appData`). Soupisky se doplňují po družstvech.
- Aplikace doplní: hrací místnosti, kontakty (adresář), rozhodčí, schválené výjimky začátků (`start_home/away`).
  Do místnosti se nepíše začátek utkání — jiné začátky jsou v rozlosování (červeně u domácích) a v kapitole
  Specifické požadavky.
- **Rozhodčí u zápasů** se přebírají z karty *Nominace rozhodčích* (`doc/feat-rozhodci.md`), ve zpravodaji se už
  nemění. Starší koncepty s polem `refs` se ignorují.
- **Ukládá se jen koncept** (tabulka `bulletins`, `key = 'initial'`): druh, datum vydání, texty,
  volby. Vygenerované DOCX/PDF se neukládají. **Save pointy** (`bulletin_savepoints`) = pojmenované kopie
  konceptu; obnovení nejdřív uloží současný stav jako save point „před obnovením“. Místnosti a kontakty se
  neukládají do save pointů — čtou se vždy živě z družstev.
- **Texty** (úvod, doplněk Specifických požadavků, Rozhodčí, Další oznámení, Hlášení výsledků) se upravují
  přímo v náhledu editorem Quill (tučně, kurzíva, podtržení, odrážky, číslování, odkazy) → DOCX i PDF.
  Neupravený text je „výchozí“ a sleduje data (počet družstev, tempo, vzájemné zápasy družstev stejného
  oddílu…); *Výchozí text* vrátí úpravu.
- **Předběžný × definitivní**: předběžný má kapitolu *Nedostatky soupisek* (z kontroly soupisek M6: chyby,
  důvody k vyškrtnutí, vyškrtnutí hráči) a obsahuje všechny hráče; definitivní vynechá vyškrtnuté hráče
  (podle LOK z poslední verze soupisky v aplikaci) a kapitolu nedostatků.
- **Nedostatky soupisek jsou upravitelná kapitola** (text `deficiencies`, jako ostatní editovatelné kapitoly):
  výchozí text se generuje z kontroly soupisek (družstvo tučně, nálezy jako odrážky, `deficiencyDelta`) a sleduje ji,
  dokud ho vedoucí neupraví. Odsouhlasené nálezy (✓ na Kontrole soupisek) se do něj negenerují.
- **Náhled stránkovaný jako PDF** (30. 10. 2026, stejný mechanismus jako zpravodaj z kola, `web/src/bulletin/paginate.ts`):
  náhled má geometrii PDF 1:1 (1 px = 15 DXA, okraje, písmo 12 pt, řádek 1,22, buňky 1,5 / 2,5 pt) a dělí se na strany A4
  podle skutečného rozložení PDF (`pdfPageMap`, 300 ms po změně na pozadí). Id uzlů PDF = `data-pg` v náhledu:
  `t*` titul, `h*` kapitoly, oddíly `i.` (úvod) / `s{kapitola}.{oddíl}.` + pořadí položky (odstavec, řádek tabulky
  místností / adresáře, dvojice soupisek, kolo, dvojice měsíců…). Náhled je flex sloupec, aby se okraje sčítaly jako
  v pdfmake (bez slučování marginů). Místnosti a adresář se v PDF lámou po řádcích → v náhledu je každý řádek vlastní
  tabulka. Kapitola Kalendář má pevný zlom (pdfmake ho v `pageBreakBefore` nehlásí → `data-pg-break`); nadpis
  posunutý pravidlem „nadpis nezůstane dole“ se zapíše na další stranu (pdfmake se na uzel ptá jen jednou).
  Jen v náhledu jsou lišty editorů a řádek „chybí kontakty“ (`data-pg-ghost`, stránka je o ně delší).

## Kapitoly
Titul (název a region z chess.cz, „(Předběžný) úvodní zpravodaj – ročník“, datum vydání), úvod, 1. Hrací místnost,
2. Adresář (kapitán, zástupce, komunikace), 3. Soupisky (po dvou vedle sebe, st./ml. podle roku narození),
[Nedostatky soupisek], Rozlosování (Č. | St. | Družstvo | - | Družstvo | St. | Rozhodčí), Specifické požadavky,
Rozhodčí, Další oznámení, Stránky soutěže, Hlášení výsledků + podpis vedoucího (z údajů soutěže v aplikaci),
Kalendář (volitelně, na nové stránce).

Na nové stránce začíná i **Adresář** a **Soupisky** (30. 10. 2026). Soupisky mají jako v `../uvodni-zpravodaj` pevné
řádky (`ROSTER_TITLE_H` 420 DXA název, `ROSTER_ROW_H` 314 DXA řádek), takže se na stránku vejdou **2 dvojice = 4 soupisky**
po 20 hráčích — v DOCX přesnou výškou řádku, v PDF řádkem písma 14,4 pt (jako DOCX `cellLine`) a dopočteným paddingem,
v náhledu stejně v px. Nadpis kapitoly bez zlomu tvoří v PDF s prvním blokem (kolo, dvojice soupisek, odstavec)
nedělitelný blok — pravidlo „nadpis nezůstane dole“ v `pageBreakBefore` samo nestačilo (Rozlosování zůstalo dole).

**Schválený formát** `doc/rpb_26_27_uz.pdf` (DOCX z uvodni-zpravodaj v LibreOffice, Carlito 12 pt), sjednoceno 30. 10. 2026:
- buňky tabulek bez svislého paddingu, řádek textu přesně 14,4 pt (`cellLine`) → řádek rozlosování 14,9 pt, mezi koly
  prázdný odstavec 12 pt → **6 kol po 5 zápasech na stránku**; v PDF `lineHeight` 14,4 / 14,65 a nulový padding;
- hrací místnosti: řádek aspoň `VENUE_ROW_H` 792 DXA (≈ 2 řádky), text svisle uprostřed, název družstva netučně;
- adresář: řádky `CONTACT_ROW_H` 420 DXA (21 pt), text uprostřed (pdfmake `verticalAlignment: 'middle'`);
- soupisky: rozteč `ROSTER_ROW_H` 314 DXA včetně čáry.
- Kapitola **Nedostatky soupisek** (jen předběžný) je **za Rozlosováním** (ve schváleném definitivním chybí).
- Kalendář si nechává vlastní buňky (čtverce) s paddingem.
Výsledek na demo RPB: PDF i DOCX (LibreOffice) 8 stran jako schválený — 1 titul + místnosti, 2 adresář, 3–4 soupisky,
5 soupisky 9–10 + kola 1–3, 6 kola 4–9, pak nedostatky, požadavky… a kalendář.

## Edge cases
- Startovní čísla API nevrací: pořadí podle `teamId` ověřené 1. kolem Bergera, pak pořadí tabulky, pak losovací
  čísla aplikace; nesoulad s losovacími čísly aplikace = varování.
- Poslední kolo: výjimky se neuplatní (rozpis), varování vypíše dotčené zápasy; konflikt výjimek = „???“.
- Družstvo z chess.cz nespárované s aplikací (ID / název) → bez místnosti a kontaktů + varování.
- pdfmake mění definici dokumentu na místě → PDF se staví z kopie modelu (jinak spadne náhled).

## Kód
`shared/bulletin/initial.ts` (konfigurace, model kapitol, výchozí texty, rotace), `shared/bulletin/source.ts`
(chess.cz / aplikace → vstup), `shared/bulletin/rich.ts` (Quill Delta), `web/src/bulletin/{load,docx,pdf,layout}.ts`,
`web/src/pages/competition/Bulletin.tsx` (přepínač zpravodajů `Bulletins.tsx`, zpravodaje z kol viz `doc/feat-zpravodaj-kola.md`), API `worker/routes/bulletins.ts`, písmo `web/public/fonts/Carlito-*`.

## Zobrazení označení hráčů
- V celé aplikaci (detail družstva, náhled importu, editor soupisky) jsou tři samostatné sloupce ve stálém pořadí
  **Z | H/V/C | K/ZK** (nadpis „Z“, nad H/V/C a K/ZK společný „Označení“; sloupce mají pevnou šířku, aby se prázdné sloupce nesmrštily) (`web/src/components/FlagCells.tsx`, `flagParts` v `shared/roster/draft.ts`).
- Ve zpravodaji (náhled, DOCX, PDF) samostatné sloupce **Z | P | K**: P = písmeno H/V/C, K = kapitán K/ZK.

## Výjimky začátků a začátek posledního kola
- Požadavek na začátek utkání: v editaci zaškrtnutí „Výjimka schválena“ (= stav vyhověno) a „Neplatí v kolech“ (`requests.skip_rounds`,
  např. `3,7`). Schválený požadavek se propíše do družstva (`teams.start_home|away` + `_skip`).
- Poslední kolo: výjimky nikdy; všechna utkání začínají v `competitions.last_start` (Přehled → „Začátek posledního kola“),
  prázdné = výchozí začátek.
- Zpravodaj (jako uvodni-zpravodaj): čas výjimky červeně u domácího družstva, v záhlaví kola „, pokud není uvedeno jinak“ jen když
  v kole nějaká výjimka platí; ve vyloučeném kole se výjimka neuvede. Záhlaví posledního kola má čas posledního kola a poznámku
  „poslední kolo, všechna utkání musí začínat v …“. Kapitola Specifické požadavky: řádek výjimky s „(neplatí v 3. a 7. kole)“,
  výchozí doplňující text uvádí začátek posledního kola.

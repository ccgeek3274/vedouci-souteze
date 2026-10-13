# Úvodní zpravodaj (M8)

Záložka **Zpravodaj** soutěže. Port generátoru `../uvodni-zpravodaj` (DOCX) rozšířený o kapitoly ze skutečného
zpravodaje RPB 2026/27 (`doc/rpb_26_27_uz_v3.docx`) a o PDF (pdfmake + Carlito jako `../sscr-zpravodaj`).

## Rozhodnutí (potvrzeno uživatelem)
- **Soupisky a rozlosování vždy z chess.cz**, i u předběžného zpravodaje. Data aplikace (soupisky z importu,
  rozlosování z losovacích čísel přes Bergera) jen když je chess.cz ještě nemá — a jen po výslovném potvrzení
  (zaškrtávátka v kartě *Zdroj dat*, uložená v konceptu `appData`). Soupisky se doplňují po družstvech.
- Aplikace doplní: hrací místnosti, kontakty (adresář), rozhodčí, schválené výjimky začátků (`start_home/away`).
  Do místnosti se nepíše začátek utkání — jiné začátky jsou v rozlosování (červeně u domácích) a v kapitole
  Specifické požadavky.
- **Rozhodčí u zápasů: rotace** — domácí zápasy družstva se po kolech střídavě přidělují jeho rozhodčím
  (kontakty role rozhodčí v pořadí). Každý zápas lze ručně přepsat (pole s našeptáváním rozhodčích domácích);
  ruční volby jsou v konceptu (`refs`, klíč `kolo:družstvo`), tlačítko *Vrátit rotaci* je smaže.
- **Ukládá se jen koncept** (tabulka `bulletins`, `key = 'initial'`): druh, datum vydání, texty, ruční rozhodčí,
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

## Kapitoly
Titul (název a region z chess.cz, „(Předběžný) úvodní zpravodaj – ročník“, datum vydání), úvod, 1. Hrací místnost,
2. Adresář (kapitán, zástupce, komunikace), 3. Soupisky (po dvou vedle sebe, st./ml. podle roku narození),
[Nedostatky soupisek], Rozlosování (Č. | St. | Družstvo | - | Družstvo | St. | Rozhodčí), Specifické požadavky,
Rozhodčí, Další oznámení, Stránky soutěže, Hlášení výsledků + podpis vedoucího (z údajů soutěže v aplikaci),
Kalendář (volitelně, na nové stránce).

## Edge cases
- Startovní čísla API nevrací: pořadí podle `teamId` ověřené 1. kolem Bergera, pak pořadí tabulky, pak losovací
  čísla aplikace; nesoulad s losovacími čísly aplikace = varování.
- Poslední kolo: výjimky se neuplatní (rozpis), varování vypíše dotčené zápasy; konflikt výjimek = „???“.
- Družstvo z chess.cz nespárované s aplikací (ID / název) → bez místnosti a kontaktů + varování.
- pdfmake mění definici dokumentu na místě → PDF se staví z kopie modelu (jinak spadne náhled).

## Kód
`shared/bulletin/initial.ts` (konfigurace, model kapitol, výchozí texty, rotace), `shared/bulletin/source.ts`
(chess.cz / aplikace → vstup), `shared/bulletin/rich.ts` (Quill Delta), `web/src/bulletin/{load,docx,pdf,layout}.ts`,
`web/src/pages/competition/Bulletin.tsx`, API `worker/routes/bulletins.ts`, písmo `web/public/fonts/Carlito-*`.

## Zobrazení označení hráčů
- V celé aplikaci (detail družstva, náhled importu, editor soupisky) jsou tři samostatné sloupce ve stálém pořadí
  **Z | K/ZK | H/V/C** (nadpis „Z“, nad K/ZK a H/V/C společný „Označení“; sloupce mají pevnou šířku, aby prázdný K/ZK nesplynul s H/V/C) (`web/src/components/FlagCells.tsx`, `flagParts` v `shared/roster/draft.ts`).
- Ve zpravodaji (náhled, DOCX, PDF) samostatné sloupce **Z | P | K**: P = písmeno H/V/C, K = kapitán K/ZK.

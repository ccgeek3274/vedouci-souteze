# Feature: soutěže, družstva, import rozpisu a soupisek (M2–M5)

## chess.cz proxy (`worker/lib/chesscz.ts`, `GET /api/v1/chesscz/<cesta>`)
- Jen přihlášení uživatelé, jen whitelist cest (`ROUTES`) s TTL: katalog/detail/rozpis 24 h, tabulka a soupisky 1 h,
  výsledky kola 10 min. `?refresh=true` obchází cache.
- Globální rate gate v D1 (`chesscz_rate`): rozestup ≥ 350 ms (~3 req/s), čekání na slot max 8 s, po timeoutu
  self-block 10 min. Když upstream nejde, vrací se starší cache s `stale: true`.
- Pořadí v tabulce soutěže před 1. kolem = losovací čísla (využito v demo skriptu).

## Soutěže a družstva
- Soutěž = jedna skupina (např. RPB 2026/2027), vlastník `owner_id`, unikátní `(owner, season, short)`.
- Družstva: `position` (pořadí v podkladech / po losování podle los. čísla), `status` active/reserve — odebraná
  družstva se nemažou, čekají v záloze. Návrat ze zálohy = konec aktivního seznamu.
- Párování s chess.cz: `competitions.chesscz_comp_id`, `teams.chesscz_team_id`; UI (záložka Družstva) navrhne
  shody podle názvu (`teamNameScore`), uživatel potvrdí. Zobrazený název z chess.cz, pokud se liší.

## Import rozpisu / rozdělení (M4)
Formát a pravidla: [`import-format.md`](import-format.md). Vždy náhled (plán `planCompetitionImport`) → potvrzení.
Skill `.claude/skills/import-rozpis`. Opakovaný import stejného dokumentu nic nemění (test v `shared/__tests__`).

## Import soupisek (M5)
- Výměnný formát = JSON draft sscr-soupiska v1 (`shared/roster/draft.ts`). Parser xlsx (`shared/roster/xlsx.ts`)
  hledá řádky podle popisků ve sloupci A a sloupce podle hlavičky tabulky → pokryje šablonu 2026/27, posunuté řádky
  i starší variantu (Mšeno). Vlastní formáty a `.xls` odmítne (viz [`analyza-soupisek.md`](analyza-soupisek.md)).
- Prohlížeč parsuje lokálně (ExcelJS se načítá líně), server dostane draft:
  `POST /competitions/:id/rosters/import` → náhled (přiřazení družstva, diff proti poslední verzi, upozornění,
  změny údajů družstva a kontaktů, nové požadavky) → `apply: true` uloží novou verzi. Identický soubor verzi nevytvoří.
- Převzaté údaje: hrací místnost, přezůvky, preference začátku, požadavky na losování, oddíl (jen když chybí),
  kontakty (kapitán, zástupce, komunikace, rozhodčí — nahradí se celé, když se liší).
- Preference začátku / požadavky na losování → záznamy `requests` (záložka Požadavky) pro losovací schůzi.
- Skill `.claude/skills/import-soupiska` volá CLI (`npm run cli -- parse-soupiska|import-soupisky`).

## CLI (`scripts/cli.ts`, `npm run cli -- …`)
Bundluje se esbuildem; server `VS_URL`, token `VS_TOKEN` nebo `~/.config/vedouci-souteze/token`.

## Demo data (`scripts/seed-demo.sh`)
RPB 2026/27 z reálných podkladů v `doc/` + výsledek losovací schůze podle skutečného úvodního zpravodaje:
Čelákovice B a ŠACHY PRO RADOST!! A do zálohy, přidáno Šachy Polabí A, párování s chess.cz 3468, losovací čísla.
Bakov C (vlastní formát) a Polabí (.xls) zůstávají bez soupisky — ukázka ručního doplnění. Skript je idempotentní.

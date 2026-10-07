---
name: import-soupiska
description: Načte e-soupisky družstev (.xlsx od kapitánů podle šablony ŠSČR nebo .json ze sscr-soupiska), ukáže zjištěné problémy a nahraje je do soutěže v aplikaci Vedoucí soutěže. Použij, když uživatel dodá soubory soupisek (např. přílohy e-mailů) k importu.
---

# Import e-soupisek

Parser je sdílený s webovou aplikací (`shared/roster/xlsx.ts`) — skill **nepíše vlastní parsování**, jen volá CLI.

## Postup
1. Soubory ulož/označ (přílohy e-mailů). Podporované: `.xlsx` (šablona e-soupisky, i starší varianta), `.json`
   (rozpracovaná soupiska sscr-soupiska). `.xls` a vlastní formáty se **nepodporují** — řekni uživateli,
   ať soubor uloží jako .xlsx, nebo data zadá ručně. Pro chybné formáty nevyvíjej žádnou funkcionalitu.
2. Offline kontrola: `npm run cli -- parse-soupiska <soubory…>` → JSON draft + upozornění
   (počet hráčů v základní sestavě, H/V/C, chybějící LOK, kontakty, rozhodčí…). Shrň je uživateli.
3. Náhled proti serveru: `npm run cli -- import-soupisky <ZKRATKA_SOUTĚŽE> <soubory…>`
   — ukáže přiřazení k družstvům a rozdíl proti současné verzi soupisky. Nepřiřazená družstva vyřeš s uživatelem
   (v aplikaci na záložce Import soupisek lze družstvo vybrat ručně).
4. Po potvrzení: stejný příkaz s `--apply`. Každý import vytvoří novou verzi soupisky (identický soubor verzi
   nevytvoří), převezme hrací místnost, přezůvky, kontakty a založí požadavky pro losovací schůzi
   (preference začátku, požadavky na losování) — ty uživatel dořeší na záložce Požadavky.

## Přístup k API
`VS_URL` (výchozí https://vedouci.sachytynec.cz), token `VS_TOKEN` nebo `~/.config/vedouci-souteze/token`.

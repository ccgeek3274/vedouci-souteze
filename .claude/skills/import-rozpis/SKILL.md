---
name: import-rozpis
description: Převede Rozpis soutěží nebo Rozdělení družstev (PDF svazu, např. SŠS) na JSON importu soutěží aplikace Vedoucí soutěže a volitelně ho nahraje přes API. Použij, když uživatel dodá PDF/text rozpisu či rozdělení družstev a chce založit nebo aktualizovat soutěže.
---

# Import rozpisu / rozdělení družstev

Cíl: z dokumentu svazu vytvořit JSON ve formátu `vedouci-souteze/competitions` (spec: `doc/import-format.md`,
validace `shared/import/competition.ts`) a nahrát ho jako **náhled**; uložit až po potvrzení uživatelem.

## Postup
1. Text dokumentu: `pdftotext -layout <soubor.pdf> -` (pro tabulky/zalomení čti pozorně, ověř počty družstev).
2. Urči druh dokumentu (`source.kind`):
   - **rozpis** — všechny skupiny, vedoucí (bod „Vedoucí skupin“), tempo, začátky, časový plán (termíny kol),
     družstva jen tam, kde jsou uvedena závazně (příloha KP/KS). Orientační seznamy (např. „RP — uvedena orientačně“)
     **nezahrnuj** jako `teams`.
   - **rozdeleni** — družstva po skupinách (pořadí z dokumentu), vedoucí; termíny převezmi z rozpisu, pokud je máš.
3. Sestav JSON:
   - `season` "RRRR/RRRR", `region` přesně jako na chess.cz (např. „Středočeský šachový svaz (SŠS)“).
   - `short` = úroveň + skupina (KP, KSA, RPB, RSC …), `level` KP|KS|RP|RS, `group`.
   - Termíny: v rozpisu SŠS hrají KP + RP v termínech 1. ligy západ, KS + RS v termínech 2. ligy — rozepiš kola
     do `rounds` (ISO data) pro každou skupinu zvlášť; termín pro dohrávky není kolo.
   - `default_start` podle rozpisu (SŠS: KP/KS 10:00, RP/RS 09:00), `boards` (RS 5, ostatní 8),
     `time_control`, `mutual_deadline` (vzájemné zápasy družstev oddílu, SŠS 31. 12.).
   - Názvy družstev přepiš **přesně** jak jsou v dokumentu (včetně poznámek v závorkách); nic neopravuj.
4. Ulož do `doc/import/<svaz>-<sezona>-<druh>.json` a ověř: `npm run cli -- import-competitions <soubor>`
   (offline validace proběhne i bez serveru; s tokenem ukáže náhled změn).
5. Ukaž uživateli souhrn náhledu (nové soutěže, přesuny družstev do zálohy, změny termínů) a zeptej se,
   které skupiny vede. Teprve pak `--only RPB --apply`.

## Přístup k API
`VS_URL` (výchozí https://vedouci.sachytynec.cz), token `VS_TOKEN` nebo `~/.config/vedouci-souteze/token`
(vytváří se v aplikaci na stránce „API tokeny“). Nikdy token nevypisuj.

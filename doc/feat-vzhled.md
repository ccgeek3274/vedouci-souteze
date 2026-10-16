# Vzhled aplikace (skiny)

- Přepínač v navigaci (výběr vedle jména uživatele): **Výchozí** (Paper & Ink, tmavé pozadí) a **chess.cz**.
- Volba se ukládá jen v prohlížeči (`localStorage` klíč `vs-skin`), na server nejde. Při blokovaném úložišti platí výchozí vzhled.
- Implementace: `web/src/lib/skin.ts` nastaví `data-skin` na `<html>` ještě před prvním vykreslením (`main.tsx`).
  Skin v `styles.css` (`[data-skin="chess"]`) nejdřív přepíše tokeny a pak jen pravidla, která na bílé stránce
  nedávají smysl (nadpisy na tmavém pozadí, hlavičky tabulek, záložky).
- Skin chess.cz podle stránky soutěže na www.chess.cz: písmo Roboto Condensed, modrá `#084b80` (hlavičky tabulek
  a karet, tlačítka), červené nadpisy `#be1221` (i nadpisy karet na bílém pozadí), lehký řez 300 pro text a hlavičky tabulek, názvy v tabulkách bez tučnosti a podtržení, střídání řádků `#f2f2f2`, rámečky `#ccc`.
- Náhled zpravodaje (`.doc`) a výstupy DOCX/PDF skin neovlivňuje, ty mají vlastní vzhled dokumentu.
- Další skin = nová položka v `SKINS` + blok `[data-skin="…"]` ve stylech.

Chci vytvořit web aplikaci pro vedoucího soutěže.

Hlavní funkce bude sběr podkladů a příprava losování soutěže a tvorba úvodního zpravodaje.
Další podpůrné funkce mohou přibýt.

Fukcionalita by měla také vycházet z podpůrných aplikací které jsme vytvořili a zatím fungovali bez kontextu. Viz níže

Zdroje a detaily:
Import údajů o soutěží z dokumenty (tohle asi přess skill) - například termíny, seznam a názvy družstev, příklady dokumentů:
- /home/ccuser/git/vedouci-souteze/doc/Rozpis_soutezi_SSS_2026_27.pdf : prvotní dokument
- /home/ccuser/git/vedouci-souteze/doc/Rozdeleni_druzstev_KP_KS_RP_SSS_2026_2027.pdf : upřesnění před losovací schůzí, zde nemusí být všechny soutěže (typicky soutěže RS) a přiřazená družstva se mohou na losovací schůzi změnit

/home/ccuser/git/sscr-soupiska : Kapitáni družstev budou posílát  xlsx ve formátu e-soupiska mailem vedoucímu , data by se měla průběžně zaznamenávat, 
představoval bych si možnost importu xlsx (aspoň pokus s následnou manuální verifikací) , podpora importu strukturovaných dat - nabýzí se json formát použitý k uložení rozpracované soupisky
Import xlsx by mohl být i jako skill pro claude code, který by zprocoval xlsx a vytvořil json nebo nahrál data přes api
Příprava podkladů pro losovací schůzi, zobrazení reportů - například výpis požadavků na změnu času zahájení

/home/ccuser/git/kontrolasoupisky : Pro nějakou verifikaci hráčů na soupiskách

Možnost změnit pořadí družstev i jejich jména, všechny údaje, odebrat přídat družstva (odebraná družstva se nemusí mazat, jen budou čekat v záloze pro případ).

/home/ccuser/git/uvodni-zpravodaj - generování úvodního zpravodaje

/home/ccuser/git/sscr-zpravodaj - generování zpravodajů z jednotlivých kol

Work flow:
- založení soutěže
- postupný import dat a jejich editace, verifikace
- příprava na losovací schůzi
- doplnění některých údajů
- tvorba podkladů pro swiss-manager  (fáze 2 projektu, bude obsahovat i aktualizaci projektu /home/ccuser/git/swiss-manager-automat )
- manuálně uživatelem mimo aplikaci: zadání dat do swiss-manager a následný import dat do chess.cz, může být opakovaně po různých upřesnění nebo změnách
- tvorba úvodního zpravodaje
  - několik kol úprav a optimalizací
- tvorba zpravodajů z jednotlivých kol

Fáze 3: podumat o integraci na projekt /home/ccuser/git/pgn-base (záznamy šachových partií) 

Rozsah:
Jednotky uživatelů (maximálně nižší desítky)
Přihlašování / stack : asi se inspirovat u /home/ccuser/git/pgn-base , ale zhodnotit alternativní řešení pokud dává smysl (nasazení na cloudflare je priorita)
Potřebné informace by se měli permanentně udržovat například: ručně dopsané poznámky do zpravodajů, nebo pořadí po jednotlivých kolech, které nejde zpětně načíst po odehrání dalších kol, nemusí se držet informace které jde obnovit z chess.cz
Zdrojem pravdy jsou v prvé řadě údaje zveřejné na chess.cz (například aktuální elo, název družstva) spárovné s informacemi uloženými v aplikaci (hrací místnosti, kontakty na kapitány ...)
Průběřná dokumentace projektu v adresáři doc/

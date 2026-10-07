# Formát importu soutěží (`vedouci-souteze/competitions`, verze 1)

JSON, který vzniká z Rozpisu soutěží / Rozdělení družstev (skill `import-rozpis`) nebo ručně.
Validace: `shared/import/competition.ts` (`validateCompetitionImport`). Ukázky: `doc/import/sss-2026-27-*.json`.

```jsonc
{
  "format": "vedouci-souteze/competitions",
  "version": 1,
  "source": { "document": "Rozpis_soutezi_SSS_2026_27.pdf", "kind": "rozpis", "date": "2026-06-04" }, // kind: rozpis | rozdeleni | other
  "season": "2026/2027",
  "region": "Středočeský šachový svaz (SŠS)",       // přesně jako regionName na chess.cz (párování)
  "competitions": [
    {
      "short": "RPB",                  // jednoznačná zkratka v rámci sezóny (klíč pro aktualizace)
      "level": "RP",                   // KP | KS | RP | RS | other
      "group": "B",                    // "" pro jednu skupinu (KP)
      "name": "Regionální přebor B",
      "boards": 8,                     // výchozí: RS 5, jinak 8
      "default_start": "09:00",        // výchozí: KP/KS 10:00, RP/RS 09:00
      "time_control": "90 min./40 tahů + 30 min. …",
      "manager": { "name": "Jukl Karel", "email": "…", "phone": "602 123 971" },
      "mutual_deadline": "2026-12-31", // vzájemné zápasy družstev jednoho oddílu do
      "rounds": [ { "round": 1, "date": "2026-10-18" } ],   // všechny termíny z časového plánu
      "teams": [ { "name": "TJ Neratovice D" } ]           // v pořadí dokumentu; vynechat, když dokument družstva neuvádí
    }
  ]
}
```

## Pravidla aplikace (náhled → potvrzení)
- Soutěž se páruje podle `season` + `short`; neexistující se založí.
- Prázdné hodnoty v importu nikdy nemažou data v aplikaci.
- `rounds` (pokud jsou uvedena) nahradí kalendář; `teams` (pokud jsou uvedena) určí aktivní družstva a pořadí:
  - družstva se párují podle názvu (`teamNameScore` v `shared/text.ts` — různá písmena družstev se nikdy nespárují),
  - existující názvy se nepřepisují (mohl je upravit uživatel), nová družstva se přidají,
  - družstva, která v dokumentu chybí, jdou **do zálohy** (nikdy se nemažou), ze zálohy se mohou vrátit.
- Termíny KP + RP = 1. liga západ, KS + RS = 2. liga. RS: termíny jsou známé dopředu, při menším počtu družstev
  se použijí první kola; skupiny RS se definují až na losovací schůzi (Rozdělení je typicky neobsahuje).

## API
`POST /api/v1/import/competitions?only=RPB,KSA` (náhled) · `…&apply=true` (uložení). Autorizace: session cookie
nebo `Authorization: Bearer vs_…` (osobní API token). CLI: `npm run cli -- import-competitions <file> [--only RPB] [--apply]`.

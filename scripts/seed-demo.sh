#!/usr/bin/env bash
# Demo data: RP B 2026/2027 from the real documents in doc/ (Rozpis, Rozdělení, anonymized e-soupisky),
# then the outcome of the draw meeting as published in the real initial bulletin (doc/rpb_26_27_uz_v3.docx):
# ŠK Spartak Čelákovice B and ŠACHY PRO RADOST!! A did not start (→ reserve), Šachy Polabí A joined,
# teams paired with chess.cz competition 3468 and draw numbers taken from its table order.
#
# Usage: VS_URL=https://vedouci.sachytynec.cz VS_TOKEN=vs_… ./scripts/seed-demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${VS_TOKEN:?Nastavte VS_TOKEN (stránka API tokeny)}"
URL="${VS_URL:-https://vedouci.sachytynec.cz}/api/v1"
api() { curl -sfS -X "$1" -H "Authorization: Bearer $VS_TOKEN" -H 'Content-Type: application/json' "$URL$2" ${3:+-d "$3"}; }
cli() { npm run --silent cli -- "$@"; }

find_comp() { api GET /competitions | python3 -c "import sys,json; print(next((c['id'] for c in json.load(sys.stdin)['competitions'] if c['short']=='RPB' and c['season']=='2026/2027'), ''))"; }
COMP=$(find_comp)
if [ -z "$COMP" ]; then
  # Only on the first run: re-importing the (older) Rozdělení would undo the draw-meeting changes below.
  echo "== Rozpis + rozdělení (RPB)"
  cli import-competitions doc/import/sss-2026-27-rozpis.json --only RPB --apply
  cli import-competitions doc/import/sss-2026-27-rozdeleni.json --only RPB --apply
  COMP=$(find_comp)
fi

echo "== E-soupisky"
cli import-soupisky RPB doc/soupisky/*.xlsx --apply || true

echo "== Výsledek losovací schůze"
DETAIL=$(api GET "/competitions/$COMP")
team_id() { python3 -c "import sys,json; print(next((t['id'] for t in json.load(sys.stdin)['teams'] if t['name']==sys.argv[1]), ''))" "$1" <<<"$DETAIL"; }
for name in "ŠK Spartak Čelákovice B" "ŠACHY PRO RADOST!! A"; do
  id=$(team_id "$name"); [ -n "$id" ] && api PATCH "/teams/$id" '{"status":"reserve"}' >/dev/null && echo "  do zálohy: $name"
done
if [ -z "$(team_id 'Šachy Polabí A')" ]; then
  api POST "/competitions/$COMP/teams" '{"name":"Šachy Polabí A","club_name":"Šachy Polabí","venue":"Misan s.r.o., Ke Vrutici 1795, 289 22 Lysá nad Labem (zvonek na sloupku u vjezdu)","notes":"Soupiska přišla ve starém formátu .xls — zadat ručně / uložit jako .xlsx."}' >/dev/null
  echo "  přidáno: Šachy Polabí A"
else
  api PATCH "/teams/$(team_id 'Šachy Polabí A')" '{"status":"active"}' >/dev/null
fi
api PATCH "/teams/$(team_id 'Šachový klub Bakov nad Jizerou C')" '{"notes":"Soupiska přišla ve vlastním formátu (nelze importovat) — zadat ručně."}' >/dev/null

echo "== Párování s chess.cz (3468) + losovací čísla"
api PATCH "/competitions/$COMP" '{"chesscz_comp_id":3468,"phase":"running"}' >/dev/null
TABLE=$(api GET /chesscz/competitions/3468/table)
DETAIL=$(api GET "/competitions/$COMP")
python3 - "$DETAIL" "$TABLE" <<'PY' | while read -r id body; do api PATCH "/teams/$id" "$body" >/dev/null; done
import sys, json, re, unicodedata
detail, table = json.loads(sys.argv[1]), json.loads(sys.argv[2])['data']
fold = lambda s: re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower())
# app team name -> chess.cz team name (names differ between the documents and chess.cz)
manual = {
  'TJ AŠ Mladá Boleslav A': 'TJ Auto Škoda Mladá Boleslav A', 'Mšeno': 'Sokol Mšeno',
  'Odolena Voda A': 'Aero Odolena Voda', 'TJ Kralupy nad Vltavou C': 'Kralupy C',
}
for t in detail['teams']:
    if t['status'] != 'active': continue
    target = fold(manual.get(t['name'], t['name']))
    hit = next((r for r in table if fold(r['teamName']) == target), None) \
       or next((r for r in table if set(fold(r['teamName']).split()) >= set(target.split()) - {'sk', 'tj'}), None)
    if hit:
        print(t['id'], json.dumps({'chesscz_team_id': hit['teamId'], 'draw_no': int(hit['teamRank'])}))
    else:
        print(f'  ! nespárováno: {t["name"]}', file=sys.stderr)
PY
# After the draw the list is kept in draw-number order.
ORDER=$(api GET "/competitions/$COMP" | python3 -c "import sys,json; t=[x for x in json.load(sys.stdin)['teams'] if x['status']=='active']; print(json.dumps({'order':[x['id'] for x in sorted(t, key=lambda x: x['draw_no'] or 99)]}))")
api PUT "/competitions/$COMP/teams/order" "$ORDER" >/dev/null
cli competitions

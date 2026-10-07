#!/usr/bin/env bash
# Deploy Vedoucí soutěže to Cloudflare (one Worker serving API + SPA assets).
# Runs type checks + tests + build, applies pending D1 migrations, then deploys.
# Rule: commit and push before deploying.
set -euo pipefail
cd "$(dirname "$0")"

# Cloudflare auth: API token lives in ~/.cloudflare/credentials (not in git).
[ -f "$HOME/.cloudflare/credentials" ] && source "$HOME/.cloudflare/credentials"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-5ba0d7cc5a68236aa70b51ac7c7e2613}"

# Local proxy breaks wrangler auth.
unproxy() {
  env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY "$@"
}

echo "== check + test + build =="
npm run check
npm test
npm run build

echo "== D1 migrations (remote) =="
unproxy npx wrangler d1 migrations apply vedouci-souteze-db --remote

echo "== wrangler deploy =="
unproxy npx wrangler deploy

echo "Done."

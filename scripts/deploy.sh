#!/usr/bin/env bash
# One-command public deploy of SuiEdge Memory Gateway.
#
# Targets Railway because it accepts a Dockerfile, has a public URL with no
# extra auth, and the CLI is open source. Works in two flavors:
#
#   1. Automated (CI / dev):  railway login (one-time), then `./scripts/deploy.sh`
#   2. Manual (one-click):    push to GitHub, click "Deploy" on the
#                             Railway template below, set env vars.
#
# Railway template:  https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2FDaviRain-Su%2Fsuiedge-memory-gateway
#
# Required env vars (paste into the Railway service's Variables tab):
#   SUI_PACKAGE_ID         the published package id (e.g. 0xf4bf00ae...)
#   SUI_PRIVATE_KEY        deployer keypair (suiprivkey1...)
#   SUI_CLIENT_LIVE        1
#   AUTH_STUB_PASS         0   (real wallet signature required in production)
#   WALRUS_PUBLISHER_URL   https://publisher.walrus-testnet.walrus.space
#   WALRUS_AGGREGATOR_URL  https://aggregator.walrus-testnet.walrus.space
#   DB_PATH                /data/dev.db   (must be a persistent volume mount)
#
# After deploy, the public URL is shown in the Railway dashboard. Demo flow:
#   1. Visit https://<your-app>.up.railway.app/
#   2. Connect a Sui wallet (or use ?owner=0x... SSR path)
#   3. Create space, write memory, etc.
#
# The deployer keypair owns the AgentSpace in this MVP. For production, see
# DESIGN.detailed.md §14 — the gateway should forward user-signed PTBs.

set -euo pipefail

if ! command -v railway >/dev/null 2>&1; then
  echo "railway CLI not found. Install: brew install railway"
  echo "Or use the manual path: open https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2FDaviRain-Su%2Fsuiedge-memory-gateway"
  exit 1
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "Not logged in. Running 'railway login'..."
  railway login
fi

# Init / link the project (idempotent)
if ! railway status >/dev/null 2>&1; then
  railway init --name suiedge-memory-gateway
fi

# Set env vars (idempotent — Railway upserts)
if [[ -f .env.testnet ]]; then
  set -a; . ./.env.testnet; set +a
fi

required=(SUI_PACKAGE_ID SUI_PRIVATE_KEY)
for v in "${required[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "Missing required env var: $v"
    echo "Either source .env.testnet (which publish:testnet writes) or set it inline."
    exit 1
  fi
done

railway variables set \
  SUI_PACKAGE_ID="$SUI_PACKAGE_ID" \
  SUI_PRIVATE_KEY="$SUI_PRIVATE_KEY" \
  SUI_CLIENT_LIVE=1 \
  AUTH_STUB_PASS=0 \
  WALRUS_PUBLISHER_URL="${WALRUS_PUBLISHER_URL:-https://publisher.walrus-testnet.walrus.space}" \
  WALRUS_AGGREGATOR_URL="${WALRUS_AGGREGATOR_URL:-https://aggregator.walrus-testnet.walrus.space}" \
  DB_PATH=/data/dev.db

# Persistent volume for SQLite
railway volume add --mount /data 2>/dev/null || true

# Deploy
railway up --detach

echo
echo "Deploying... waiting 30s for the first build..."
sleep 30
URL=$(railway domain 2>/dev/null || echo "<check dashboard>")
echo
echo "Deployed: https://$URL"
echo "Try: curl https://$URL/api/v1/spaces"

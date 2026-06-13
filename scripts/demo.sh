#!/usr/bin/env bash
# SuiEdge Memory Gateway — live testnet demo (7 steps).
#
# Reproducible: runs the full MVP flow against Sui testnet + Walrus
# testnet through the running Next.js gateway.
#
# Prerequisites:
#   1. .env.testnet is filled in (run `pnpm publish:testnet` first).
#   2. The server is started in live mode with AUTH_STUB_PASS=1
#      (see package.json `dev:live`).
#   3. `pnpm db:migrate` has been run so the SQLite index has tables.
#
# Usage:  SUI_OWNER=0x... ./scripts/demo.sh
#
# Each step writes its JSON response to /tmp/demo-step-N.json. The
# script prints a one-line summary at the end. Exit code is 0 on full
# success, non-zero on the first failed step.

set -euo pipefail

: "${SUI_OWNER:?SUI_OWNER env var required (0x + 64 hex)}"
BASE="http://localhost:3000/api/v1"
HDR_X_ADDR=(
  -H "X-Sui-Address: $SUI_OWNER"
  -H "X-Sui-Signature: stub"
  -H "Content-Type: application/json"
)

step() {
  local n="$1"
  local desc="$2"
  echo
  echo "=== Step $n: $desc ==="
}

post() {
  local n="$1" path="$2" data="$3"
  step "$n" "POST $path"
  local code
  code=$(curl -sS -X POST "$BASE$path" "${HDR_X_ADDR[@]}" -d "$data" -o "/tmp/demo-step-$n.json" -w "%{http_code}")
  echo "HTTP $code"
  cat "/tmp/demo-step-$n.json" | python3 -m json.tool
  if [[ "$code" -ge 400 ]]; then echo "STEP $n FAILED" >&2; return 1; fi
}

get() {
  local n="$1" path="$2"
  step "$n" "GET $path"
  local code
  code=$(curl -sS "$BASE$path" "${HDR_X_ADDR[@]}" -o "/tmp/demo-step-$n.json" -w "%{http_code}")
  echo "HTTP $code"
  cat "/tmp/demo-step-$n.json" | python3 -m json.tool
  if [[ "$code" -ge 400 ]]; then echo "STEP $n FAILED" >&2; return 1; fi
}

# Step 1: create the agent's private memory space on-chain.
post 1 "/spaces" '{"name":"suiedge-demo"}'
SPACE_ID=$(python3 -c "import json;print(json.load(open('/tmp/demo-step-1.json'))['id'])")
echo "space_id=$SPACE_ID"

# Step 2: write a memory (Walrus PUT + Sui add_memory_pointer PTB).
post 2 "/spaces/$SPACE_ID/memories" \
  '{"kind":"note","payload":"hello from live testnet via the Gateway","tags":["smoke","live","suiedge"]}'

# Step 3: load the full context (memory index + Walrus GET per blob).
get 3 "/spaces/$SPACE_ID/context"

# Step 4: share the space read-only with a second agent.
SUBJECT="0x9999999999999999999999999999999999999999999999999999999999999999"
post 4 "/spaces/$SPACE_ID/share" \
  "{\"subject\":\"$SUBJECT\",\"canRead\":true,\"canWrite\":false,\"canShare\":false}"

# Step 5: list the owner's spaces.
get 5 "/spaces?owner=$SUI_OWNER"

# Step 6: write an artifact (the agent's plan output).
PLAN_B64=$(printf '# Plan\n1. ship\n2. demo\n3. win' | base64)
post 6 "/spaces/$SPACE_ID/artifacts" \
  "$(printf '{"name":"hackathon-plan.md","mimeType":"text/markdown","payload":"%s","tags":["hackathon"]}' "$PLAN_B64")"

# Step 7: log a proof that the agent took a sensitive action.
post 7 "/spaces/$SPACE_ID/proof-logs" \
  '{"runId":"run-1","agentId":"agent-demo","input":"context.load","output":"loaded 1 memory"}'

echo
echo "=== All 7 steps passed against Sui testnet + Walrus testnet ==="
echo "Captured responses in /tmp/demo-step-{1..7}.json"
echo "View the dashboard:  http://localhost:3000/spaces/$SPACE_ID"

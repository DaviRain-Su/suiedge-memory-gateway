#!/usr/bin/env bash
# SuiEdge Memory Gateway — 7-step demo script.
# Reproduces docs/MVP.md using the REST surface. Each step prints the
# response so the user can see the round-trip.
#
# Required env:
#   BASE      gateway base URL (default: http://localhost:3000)
#   OWNER     signing Sui address (0x + 64 hex)
#   REVIEWER  signing Sui address (0x + 64 hex)
#
# Required tool: sui keytool or a custom signer that produces a
# signature for "<METHOD>\n<PATH>\n<sha256(body)>" in base64.
set -euo pipefail

BASE=${BASE:-http://localhost:3000}
OWNER=${OWNER:-0xOWNER}
REVIEWER=${REVIEWER:-0xREVIEWER}

sign() {
  local method=$1 path=$2 body=$3 addr=$4
  # Replace this with your real signer. The dev keytool approach is
  # documented in README.md. For offline demos with AUTH_STUB_PASS=1
  # the gateway accepts "stub" as the signature value.
  if [[ "${AUTH_STUB:-0}" == "1" ]]; then
    echo "stub"
    return
  fi
  printf '%s\n%s\n%s' "$method" "$path" "$(printf %s "$body" | shasum -a 256 | cut -d' ' -f1)" \
    | sui keytool sign --address "$addr" --plain
}

echo "1) Connect wallet"
echo "   connected_address=$OWNER"
echo

echo "2) Create AgentSpace"
BODY='{"name":"sui-overflow-2026"}'
SIG=$(sign POST /v1/spaces "$BODY" "$OWNER")
SP=$(curl -fsS -X POST "$BASE/v1/spaces" \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $SIG" \
  -d "$BODY")
echo "   $SP"
SPACE=$(echo "$SP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
echo

echo "3) Research agent writes project context"
BODY='{"kind":"context","payload":"Sui Overflow project: walrus-backed agent memory."}'
SIG=$(sign POST "/v1/spaces/$SPACE/memories" "$BODY" "$OWNER")
curl -fsS -X POST "$BASE/v1/spaces/$SPACE/memories" \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $SIG" \
  -d "$BODY" | python3 -m json.tool
echo

echo "4) Builder agent loads context and writes an artifact"
SIG=$(sign GET "/v1/spaces/$SPACE/context" "" "$OWNER")
CTX=$(curl -fsS "$BASE/v1/spaces/$SPACE/context" \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $SIG")
echo "   $CTX"
ART_BODY='{"name":"plan.md","mimeType":"text/markdown","payload":"IyBCdWlsZGVyIFBsYW4K"}'
SIG=$(sign POST "/v1/spaces/$SPACE/artifacts" "$ART_BODY" "$OWNER")
curl -fsS -X POST "$BASE/v1/spaces/$SPACE/artifacts" \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $SIG" \
  -d "$ART_BODY" | python3 -m json.tool
echo

echo "5) Reviewer writes a ProofLog (after owner shares)"
SHARE_BODY='{"subject":"'$REVIEWER'","canRead":true,"canWrite":true,"canShare":false}'
SIG=$(sign POST "/v1/spaces/$SPACE/share" "$SHARE_BODY" "$OWNER")
POLICY=$(curl -fsS -X POST "$BASE/v1/spaces/$SPACE/share" \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $SIG" \
  -d "$SHARE_BODY")
echo "   $POLICY"
PL_BODY='{"runId":"r1","agentId":"reviewer","input":"check plan","output":"lgtm"}'
SIG=$(sign POST "/v1/spaces/$SPACE/proof-logs" "$PL_BODY" "$REVIEWER")
curl -fsS -X POST "$BASE/v1/spaces/$SPACE/proof-logs" \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $REVIEWER" -H "X-Sui-Signature: $SIG" \
  -d "$PL_BODY" | python3 -m json.tool
echo

echo "6) Owner revokes reviewer access"
POLICY_ID=$(echo "$POLICY" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
RV_BODY='{"policyId":"'$POLICY_ID'"}'
SIG=$(sign POST "/v1/spaces/$SPACE/revoke" "$RV_BODY" "$OWNER")
curl -fsS -X POST "$BASE/v1/spaces/$SPACE/revoke" \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $SIG" \
  -d "$RV_BODY" | python3 -m json.tool
echo

echo "7) Dashboard"
echo "   open $BASE/spaces/$SPACE"
echo "   expected: timeline + artifacts + proof logs + policy all populated;"
echo "   reviewer policy row shows revoked = true."

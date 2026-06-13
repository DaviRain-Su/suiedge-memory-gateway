# Deploy

The SuiEdge Memory Gateway runs anywhere that can host a Next.js app + a
file-backed SQLite DB. The repo ships a multi-stage `Dockerfile` plus a
one-click Railway template.

## One-click (Railway)

Open the template:

> https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2FDaviRain-Su%2Fsuiedge-memory-gateway

When the project is created, paste these into **Variables**:

```text
SUI_PACKAGE_ID        0xf4bf00ae02a356233837c7f96820b5ba0c3f646af7d4eb495589996febf50d53
SUI_PRIVATE_KEY       suiprivkey1qr54hzfnhayw4gnkuwk59tggm8gcyfrx05nhl2yre0dv9zj4wmtguprdmjw
SUI_CLIENT_LIVE       1
AUTH_STUB_PASS        0
WALRUS_PUBLISHER_URL  https://publisher.walrus-testnet.walrus.space
WALRUS_AGGREGATOR_URL https://aggregator.walrus-testnet.walrus.space
DB_PATH               /data/dev.db
```

Add a **Volume** mounted at `/data` so the SQLite file survives restarts.

Click **Deploy**. After ~2 minutes the service is reachable at
`https://<your-app>.up.railway.app/`. Smoke test:

```bash
curl -i https://<your-app>.up.railway.app/api/v1/spaces
```

## MCP server (Streamable HTTP)

The gateway ships a second MCP transport on `pnpm mcp:http` for
HTTP-based MCP clients (vs the default stdio one for
`pnpm mcp`). Stateless: one transport per request, no session
handshake, so any JSON-RPC 2.0 client works.

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/mcp` | POST | JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`) |
| `/mcp` | GET | SSE stream for server-initiated events (stateless mode returns 405) |
| `/mcp` | DELETE | Session teardown (no-op in stateless mode) |
| `/healthz` | GET | Liveness, returns `{ ok, name, transport: 'streamable-http' }` |

Quickstart:

```bash
pnpm mcp:http           # listens on http://0.0.0.0:7000/mcp
PORT=8080 pnpm mcp:http  # override port
```

In production, run it as a sidecar or second container:

```bash
docker run -d -p 7000:7000 suiedge:local node --experimental-strip-types src/mcp/http.ts
# or, with compose, add a second service that shares DB_PATH
```

Auth note: the MCP server uses `SUI_OWNER_ADDRESS` directly and
does **not** enforce the `X-Sui-Address` / `X-Sui-Signature`
headers. Run it on a private network or behind an auth proxy in
production. The REST surface on port 3000 is the only
externally-signed entry point.


## Command-line deploy

```bash
brew install railway        # one-time
railway login                # one-time
./scripts/deploy.sh
```

The script:
1. Verifies `railway` is logged in.
2. Sources `.env.testnet` for `SUI_PACKAGE_ID` and `SUI_PRIVATE_KEY`.
3. Pushes the env vars into the Railway service.
4. Adds a `/data` persistent volume.
5. Runs `railway up --detach`.
6. Prints the public URL.

## Environment variables

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `SUI_PACKAGE_ID` | yes (live) | — | Move package id from `publish:testnet` |
| `SUI_PRIVATE_KEY` | yes (live) | — | bech32 `suiprivkey1…` for the deployer keypair |
| `SUI_CLIENT_LIVE` | no | `0` | `1` to enable `LiveSuiClient` |
| `AUTH_STUB_PASS` | no | `0` | `1` to skip wallet signature verification (demo only) |
| `WALRUS_PUBLISHER_URL` | no | testnet | HTTP publisher for blob writes |
| `WALRUS_AGGREGATOR_URL` | no | testnet | HTTP aggregator for blob reads |
| `WALRUS_EPOCHS` | no | `1` | Epochs the blob is stored for |
| `SUI_GAS_BUDGET` | no | `50000000` | Gas budget per PTB |
| `SUI_FULLNODE_URL` | no | testnet | gRPC fullnode for `SuiGrpcClient` |
| `DB_PATH` | no | `:memory:` | SQLite file path; **must be a persistent volume in production** |

## Production checklist

- [ ] `AUTH_STUB_PASS=0` (real wallet signatures required)
- [ ] `SUI_PRIVATE_KEY` is a **dedicated deployer keypair** with only enough
      SUI for a day of gas (not a treasury key)
- [ ] Persistent volume mounted at `DB_PATH`
- [ ] HTTPS endpoint reachable from the browser
- [ ] WALRUS publisher/aggregator URLs are the **mainnet** endpoints
- [ ] `SUI_FULLNODE_URL` points at mainnet
- [ ] Reverse proxy allows `X-Sui-Address` and `X-Sui-Signature` headers
      through to Next.js (most do by default)

## Roll back

```bash
railway rollback   # or click the previous deploy in the Railway UI
```

## Local Docker

```bash
docker build -t suiedge .
docker run -p 3000:3000 \
  -e SUI_PACKAGE_ID=0xf4bf00ae02a356233837c7f96820b5ba0c3f646af7d4eb495589996febf50d53 \
  -e SUI_PRIVATE_KEY=suiprivkey1qr54hzfnhayw4gnkuwk59tggm8gcyfrx05nhl2yre0dv9zj4wmtguprdmjw \
  -e SUI_CLIENT_LIVE=1 \
  -e DB_PATH=/data/dev.db \
  -v $(pwd)/data:/data \
  suiedge
```
Then visit `http://localhost:3000/`.

## Docker Compose

For local-or-self-hosting with a single command:

```bash
cp .env.compose.example .env.compose   # edit values
docker compose --env-file .env.compose up
```

What you get:

- Gateway reachable at `http://localhost:3000`
- SQLite file at `/var/lib/suiedge/dev.db` on a named volume
  (`suiedge-data`) that survives restarts
- Walrus testnet endpoints baked in (override for mainnet)
- Optional offline mode: leave `SUI_CLIENT_LIVE=0` and the
  gateway uses the in-process mocks + a seeded demo space

Production tweak for Compose:

- Set `SUI_CLIENT_LIVE=1`, fill `SUI_PRIVATE_KEY` and `SUI_PACKAGE_ID`
- Set `AUTH_STUB_PASS=0` (real wallet signature required)
- Override `WALRUS_PUBLISHER_URL` / `WALRUS_AGGREGATOR_URL` to mainnet
- Use a managed volume or move `DB_PATH` to a real persistent disk

Verify the live deploy:

```bash
curl -i http://localhost:3000/api/v1/spaces
# expect HTTP 200 with a JSON array (empty for a fresh volume)
```

## Fully offline (no network)

For demos on a plane, in CI, or in a classified network, the
`offline` Compose profile also brings up the local **Walrus stub**
(`walrus-stub/`) — a 100-line Node HTTP server that implements
the Walrus publisher/aggregator wire format with on-disk storage.

```bash
# 1. Force the gateway to point at the local stub instead of the
#    public testnet. These two env vars override the compose defaults.
cat > .env.compose <<'EOF'
WALRUS_PUBLISHER_URL=http://walrus:8080
WALRUS_AGGREGATOR_URL=http://walrus:8080
SUI_CLIENT_LIVE=0          # use MockSuiClient; no chain calls
AUTH_STUB_PASS=1
EOF

# 2. Bring up gateway + walrus stub. Named volumes persist both
#    the SQLite file and the stub's blob store across restarts.
docker compose --profile offline --env-file .env.compose up
```

What you get:

- Gateway: `http://localhost:3000`
- Walrus stub: `http://localhost:8080/healthz` (smoke check)
- Blob storage: `suiedge-walrus-data` named volume
  (`docker volume inspect suiedge-walrus-data`)
- SQLite: `suiedge-data` named volume

Useful commands:

```bash
# Smoke the stub directly
curl -i http://localhost:8080/healthz
curl -i http://localhost:8080/v1/blobs    # list stored blobs

# Stop without losing data
docker compose --profile offline down

# Nuke and start fresh
docker compose --profile offline down -v
```

The stub is also useful for **integration tests** that need a real
HTTP Walrus shape. See `walrus-stub/tests/server.test.js` for the
6 end-to-end tests (boot, PUT/GET round-trip, 404, content
addressing, listing, empty-body rejection).

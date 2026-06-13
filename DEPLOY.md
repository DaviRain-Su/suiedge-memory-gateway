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

# Submission Draft

## Project name

SuiEdge Memory Gateway

## Track

Walrus

## One-liner

A wallet-owned memory and artifact gateway for AI agents, powered by Walrus and anchored by Sui objects.

## Description

SuiEdge Memory Gateway lets AI agents persist, share, and audit long-running context across sessions and tools. Memory, artifacts, and execution logs are stored on Walrus. Sui objects anchor ownership, active versions, access policy, and revocation. Agent frameworks interact through REST or MCP, so they can use Walrus-backed memory without handling blob IDs, policy checks, or Sui object updates directly.

## Why Sui / Walrus

Walrus provides durable, portable, verifiable data for agent memory and artifacts. Sui provides wallet-owned objects, policy state, version pointers, and revocation. Together they make agent memory user-owned, shareable, auditable, and portable instead of app-locked.

## Demo checklist

- Create an `AgentSpace` with a Sui wallet.
- Write memory to Walrus.
- Anchor memory pointer on Sui.
- Restore context in a second agent session.
- Save generated artifact.
- Save proof log.
- Share access with another agent identity.
- Revoke access and show blocked read/write.

## Live verification (testnet)

The full MVP flow was executed against **Sui testnet** and **Walrus testnet** during the build, not just mocked locally. End-to-end artifacts:

- **Published Move package id**: `0xf4bf00ae02a356233837c7f96820b5ba0c3f646af7d4eb495589996febf50d53`
- **Walrus testnet round-trip**: PUT smoke blob → blobId `u_pRa6Ur-kUbguw6nJMmncIy47e8BpKC-gi51MinjhE` → GET bytes match
- **Sui testnet createSpace PTB**: digest `93Z6uizbPrKwE7z82iwRjUULAcB9WXJTQ7YEWwpoQ99n` (real `SuiGrpcClient.signAndExecuteTransaction`)
- **7-step e2e demo** (`scripts/demo.sh`): createSpace → write memory → context load → share policy → list spaces → write artifact → write proof log. All 7 steps return HTTP 201/200 against the live testnet in ~30 seconds total.
- **Live vitest suite** (`pnpm test:live`): 2/2 pass against real Sui + Walrus
- **Offline vitest suite** (`pnpm test`): 36/36 pass (uses `MockSuiClient` + `MemoryWalrusPublisher`)
- **Move unit tests** (`sui move test`): 7/7 pass
- **TypeScript** (`pnpm exec tsc --noEmit`): clean

Reproduce with:

```bash
pnpm run publish:testnet    # writes .env.testnet with the live package id
set -a && . .env.testnet && set +a
export SUI_CLIENT_LIVE=1 AUTH_STUB_PASS=1 SUI_PRIVATE_KEY=...
pnpm dev -p 3000 &
SUI_OWNER=0x... ./scripts/demo.sh
pnpm test:live
```

Dashboard screenshots (live data):

![home](./screenshots/01-home.png)
![space detail](./screenshots/02-space-detail.png)

---

[Chinese version](./SUBMISSION.zh.md)

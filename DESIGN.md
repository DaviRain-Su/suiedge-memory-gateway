# SuiEdge Memory Gateway — Design

> Single source of truth for how the hackathon build is shaped. The product README, `docs/MVP.md`, `docs/SUBMISSION.md`, and `move/README.md` define *what*; this document defines *how*.

## 1. Architecture overview

Three layers and one control plane:

```
┌──────────────────────────────────────────────────────────┐
│                  Agent frameworks (LLM / SDK)            │
│         call:  REST  /v1/...   or   MCP  memory.* 等     │
└────────────────────┬─────────────────────────────────────┘
                     │  HTTP / JSON-RPC
┌────────────────────▼─────────────────────────────────────┐
│            Next.js Gateway  (control plane)              │
│  - auth:  Sui wallet signature                            │
│  - policy: read AccessPolicy, enforce read/write/revoke  │
│  - orchestration: Walrus IO + Sui tx + context assembly  │
│  - off-chain index: SQLite for listing/search            │
└──────┬───────────────────────────────────────────┬───────┘
       │  tx / read                                │  PUT / GET
┌──────▼───────┐                          ┌────────▼───────┐
│   Sui Move   │                          │    Walrus      │
│  AgentSpace  │  ownership, policy,      │  blob storage  │
│  MemoryPtr   │  active version,         │  (memory,      │
│  ArtifactPtr │  revocation anchor       │   artifact,    │
│  ProofLog    │                          │   proof log)   │
│  AccessPolicy│                          │                │
└──────────────┘                          └────────────────┘
```

### Invariants (do not break)

- **Walrus holds bytes; Sui holds truth.** No content ever lives on Sui. Sui only stores pointers, hashes, versions, and policy state.
- **One control plane.** Only the Next.js Gateway knows the mapping between Walrus blob IDs and Sui object IDs. Clients never touch either directly.
- **Version monotonicity.** Within a space, `version` is strictly increasing and assigned by the gateway; Sui object IDs grow accordingly.
- **Revoke is terminal in this MVP.** Once `AccessPolicy.revoked = true`, no resurrection; the caller creates a new policy.

## 2. Module / directory layout

```
.
├── move/                                # Sui Move package
│   ├── sources/
│   │   ├── agent_space.move             # AgentSpace + create_space
│   │   ├── memory_pointer.move          # MemoryPointer, ArtifactPointer, ProofLog
│   │   └── access_policy.move           # AccessPolicy + share / revoke
│   ├── Move.toml
│   └── README.md
├── src/
│   ├── app/                             # Next.js App Router
│   │   ├── layout.tsx                   # dapp-kit provider
│   │   ├── page.tsx                     # / dashboard: spaces + create
│   │   ├── spaces/[id]/page.tsx         # space detail
│   │   └── api/v1/
│   │       ├── spaces/route.ts
│   │       ├── spaces/[id]/share/route.ts
│   │       ├── spaces/[id]/memories/route.ts
│   │       ├── spaces/[id]/context/route.ts
│   │       ├── spaces/[id]/artifacts/route.ts
│   │       ├── spaces/[id]/proof-logs/route.ts
│   │       └── spaces/[id]/revoke/route.ts
│   ├── mcp/                             # MCP server (separate process)
│   │   ├── server.ts
│   │   └── tools/
│   │       ├── space.ts                 # space.create
│   │       ├── memory.ts                # memory.write / memory.search
│   │       ├── context.ts               # context.load
│   │       ├── artifact.ts              # artifact.save
│   │       ├── trace.ts                 # trace.log
│   │       └── policy.ts                # policy.share / policy.revoke
│   ├── lib/
│   │   ├── types.ts                     # existing shared types
│   │   ├── sui.ts                       # dapp-kit + Move call helpers
│   │   ├── walrus.ts                    # publisher/aggregator wrapper
│   │   ├── policy.ts                    # AccessPolicy read + cache + revoke
│   │   ├── context.ts                   # active context assembly
│   │   ├── store.ts                     # SQLite (better-sqlite3) index
│   │   ├── auth.ts                      # wallet signature verification
│   │   └── service/                     # shared between REST and MCP
│   │       ├── spaces.ts
│   │       ├── memories.ts
│   │       ├── artifacts.ts
│   │       ├── proofLogs.ts
│   │       └── policy.ts
│   └── components/                      # Dashboard UI
│       ├── WalletConnect.tsx
│       ├── SpaceCard.tsx
│       ├── MemoryTimeline.tsx
│       ├── ArtifactList.tsx
│       ├── ProofLogList.tsx
│       └── PolicyPanel.tsx
├── tests/
│   ├── move/                            # sui move test
│   └── gateway/                         # vitest + supertest
├── docs/
├── DESIGN.md                            # this file
├── DESIGN.zh.md                         # Chinese version
└── README.md
```

### Why this shape

- **Move modules split per object.** Each object is its own `.move` file so reviewers can read the smallest possible unit.
- **MCP is a separate process.** A stdio MCP server imports the same `lib/service/*` modules as the REST routes, so there is one business-logic implementation and one store.
- **Service layer is the seam.** REST and MCP both call into `src/lib/service/*`; the route handlers and MCP tool definitions are thin adapters.
- **Components are dumb.** Dashboard components render; they call `lib/service/*` via server actions or route handlers, never directly into Walrus/Sui.

## 3. Data model

### On-chain (Move)

```move
public struct AgentSpace has key {
    id: UID,
    owner: address,
    name: String,
    active_memory_root: vector<u8>,   // latest MemoryPointer id (digest)
    policy_version: u64,
    version: u64,
}

public struct MemoryPointer has key, store {
    id: UID,
    space_id: ID,
    kind: u8,                          // 1=memory, 2=artifact, 3=proof_log
    walrus_blob_id: vector<u8>,
    content_hash: vector<u8>,
    version: u64,
    created_at: u64,
}

public struct AccessPolicy has key {
    id: UID,
    space_id: ID,
    subject: address,
    can_read: bool,
    can_write: bool,
    can_share: bool,
    revoked: bool,
}
```

`ArtifactPointer` and `ProofLog` are modeled as `MemoryPointer` with a `kind` discriminator. They are listed separately in the API for clarity but share the same on-chain shape.

### Off-chain (SQLite via `better-sqlite3`)

The gateway keeps an index for fast listing and search. Sui remains the source of truth; the index can be rebuilt from on-chain state.

```sql
CREATE TABLE spaces (
  space_id      TEXT PRIMARY KEY,
  owner         TEXT NOT NULL,
  name          TEXT NOT NULL,
  latest_version INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE blobs (
  blob_id       TEXT PRIMARY KEY,      -- Walrus blob id
  space_id      TEXT NOT NULL,
  object_id     TEXT NOT NULL,         -- Sui MemoryPointer object id
  kind          INTEGER NOT NULL,      -- 1 memory / 2 artifact / 3 proof log
  version       INTEGER NOT NULL,
  content_hash  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX blobs_by_space ON blobs(space_id, version);
CREATE INDEX blobs_by_kind  ON blobs(space_id, kind, version);

CREATE TABLE policy_cache (
  policy_id     TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  can_read      INTEGER NOT NULL,
  can_write     INTEGER NOT NULL,
  can_share     INTEGER NOT NULL,
  revoked       INTEGER NOT NULL,
  fetched_at    INTEGER NOT NULL
);
```

### Walrus

Three key prefixes (single bucket, namespace by prefix):

```
memories/{spaceId}/{version}      -> JSON or arbitrary bytes
artifacts/{spaceId}/{version}     -> bytes
proof-logs/{spaceId}/{runId}      -> JSON
```

Blobs are immutable. Version comes from the gateway's monotonic counter; the on-chain `MemoryPointer.version` matches the path segment.

## 4. Key flows

### 4.1 Create space

1. Client signs `POST /v1/spaces { name }` with the connected wallet.
2. Gateway verifies signature → calls `create_space(name)`.
3. Move mints `AgentSpace`, transfers to caller.
4. Gateway inserts into `spaces` table, returns `{ id, owner, version: 0 }`.

### 4.2 Write memory / artifact / proof log

1. Client → `POST /v1/spaces/:id/memories { kind, payload }`.
2. Gateway: fetch `AccessPolicy` for caller, reject if `revoked || !can_write`.
3. Serialize payload, PUT to Walrus publisher → get `blobId`.
4. Compute `contentHash` (sha256 of payload).
5. Bump `space.version`; call `add_memory_pointer(space, blobId, hash, version)`.
6. Update `AgentSpace.active_memory_root = pointerDigest`.
7. Insert into `blobs`; return `MemoryRecord`.

### 4.3 Load context

1. Client → `GET /v1/spaces/:id/context`.
2. Gateway: verify caller can read.
3. Read `AgentSpace.active_memory_root`; if missing return empty context.
4. Walk back through the last N `MemoryPointer`s (N bounded, e.g. 50) via the `blobs` index.
5. Pull each blob from Walrus aggregator; assemble `{ kind, content, version, hash }` ordered by version ascending.
6. Return `ContextBundle`.

### 4.4 Share / revoke

- **share**: gateway calls `share(space, subject, flags)`; on success upsert into `policy_cache`. Idempotent on `(space_id, subject)`.
- **revoke**: gateway calls `revoke(policy)`; sets `revoked = true` in `policy_cache`; invalidates the cache entry so the next read goes back to the chain.

## 5. API contracts

### REST

| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/v1/spaces` | `{ name }` | `AgentSpace` |
| GET  | `/v1/spaces` | — | `AgentSpace[]` |
| POST | `/v1/spaces/:id/share` | `{ subject, canRead, canWrite, canShare }` | `AccessPolicy` |
| POST | `/v1/spaces/:id/memories` | `{ kind, payload }` | `MemoryRecord` |
| GET  | `/v1/spaces/:id/memories` | — | `MemoryRecord[]` |
| GET  | `/v1/spaces/:id/context` | — | `ContextBundle` |
| POST | `/v1/spaces/:id/artifacts` | `{ name, mimeType, payload }` | `ArtifactRecord` |
| GET  | `/v1/spaces/:id/artifacts` | — | `ArtifactRecord[]` |
| POST | `/v1/spaces/:id/proof-logs` | `{ runId, agentId, input, output }` | `ProofLog` |
| GET  | `/v1/spaces/:id/proof-logs` | — | `ProofLog[]` |
| POST | `/v1/spaces/:id/revoke` | `{ policyId }` | `AccessPolicy` |

All requests are signed by the Sui wallet. The signature is in the `X-Sui-Signature` header; the address in `X-Sui-Address`. `zod` validates every body at the route boundary.

### MCP tools

| Tool | Input | Output |
|------|-------|--------|
| `space.create` | `{ name }` | `AgentSpace` |
| `space.list` | `{}` | `AgentSpace[]` |
| `memory.write` | `{ spaceId, kind, payload }` | `MemoryRecord` |
| `memory.search` | `{ spaceId, query }` | `MemoryRecord[]` |
| `context.load` | `{ spaceId }` | `ContextBundle` |
| `artifact.save` | `{ spaceId, name, mimeType, payload }` | `ArtifactRecord` |
| `trace.log` | `{ spaceId, runId, agentId, input, output }` | `ProofLog` |
| `policy.share` | `{ spaceId, subject, canRead, canWrite, canShare }` | `AccessPolicy` |
| `policy.revoke` | `{ policyId }` | `AccessPolicy` |

Both surfaces call the same `lib/service/*` functions. There is no business logic in route handlers or MCP tool definitions.

## 6. Implementation phases (6-day box)

| Day | Scope | Done when |
|-----|-------|-----------|
| 1 | Move 3 modules, Next.js shell, wallet connect, REST route stubs, MCP server skeleton | `next dev` up; `curl` POSTs return JSON; MCP `space.create` returns stub |
| 2 | Walrus publisher/aggregator wrappers, `create_space` real flow, Sui tx on testnet | wallet creates a space, object visible in Sui explorer |
| 3 | `memory.write` + `context.load`, version bump, timeline UI panel | A writes, B reads same context |
| 4 | `AccessPolicy`, `share` / `revoke`, multi-agent demo | revoke → 401 on next read |
| 5 | `artifact.save`, `trace.log`, full dashboard with 4 panels | timeline + artifacts + logs + policy render |
| 6 | deploy, screenshots, demo video, README polish | MVP.md 7-step demo runs end-to-end |

## 7. Testing

- **Move** (`sui move test`): non-owner cannot `add_memory_pointer`; revoked policy cannot share; version monotonic.
- **Gateway unit** (vitest): each `lib/service/*` and `lib/policy.ts` tested with mocked Sui and Walrus clients.
- **Gateway e2e** (vitest + supertest, real testnet): one happy-path test per REST route, plus the MVP 7-step flow.
- **MCP**: schema validation per tool, plus an integration test that runs the server over stdio.
- **Dashboard smoke** (Playwright, headless): `/` and `/spaces/[id]` render with seeded data.
- **Demo rehearsal**: run `docs/MVP.md` demo script on a fresh wallet; record 5-minute video.

## 8. Risks and decisions

| Risk | Decision |
|------|----------|
| Walrus write succeeds but Sui tx fails | always write Walrus first; if Move call fails, log orphan blob id and continue (Walrus is immutable) |
| Off-chain cache vs on-chain policy drift | revoke always invalidates cache; reads always re-fetch on miss |
| MCP and REST diverging | enforced by sharing `lib/service/*`; lint rule + import-graph check |
| Dashboard UI time crunch | 4 panels only; no animations; copy README's interface table into the UI as the source of truth |
| Walrus testnet unavailable | ship a `WalrusPublisher` interface with a `MemoryWalrusPublisher` test double; swap at the factory |
| Wallet signature format variations | use `@mysten/sui` `verifyPersonalMessage` exclusively; reject anything else with 400 |

## 9. Non-goals (re-stated for clarity)

Pulled from `docs/MVP.md` "Out of scope" — **do not** scope-creep into:

- Full SolEdge worker runtime.
- Decentralized edge node network.
- Payment rail / x402 billing.
- General-purpose vector database.
- DeepBook integration.

Anything in this list is a follow-up, not a Day-N task.

---

[中文版本](./DESIGN.zh.md)

# SuiEdge Memory Gateway — Detailed Implementation Plan

> Concrete, file-by-file plan that supersedes the high-level `DESIGN.md` for any implementation question. When `DESIGN.md` and this file disagree, **this file wins**.

The product README, `docs/MVP.md`, `docs/SUBMISSION.md`, and `move/README.md` define *what*; `DESIGN.md` defines the *shape*; this file defines the *exact code to write* and the *exact order to write it in*.

---

## 0. File manifest

Total implementation surface for the 6-day build:

- **Move package** — 3 modules, 1 `Move.toml`, 1 test file (6 tests).
- **SQLite** — 1 migration file (`0001_init.sql`), 1 store module, 1 schema_version table.
- **TypeScript** — 1 shared types file (extended), 7 lib modules, 5 service modules, 11 REST route files, 1 MCP server file, 6 MCP tool files, 6 UI components, 4 layout/page files, 1 auth module, 1 error module, 1 config module.
- **Tests** — 1 Move test file, 1 vitest config, ~12 gateway test files (unit + e2e), 1 Playwright smoke.

**78 files total: 62 created, 16 modified.** Plus this `DESIGN.detailed.md` plan file.

---

## 1. Architecture overview (recap from DESIGN.md)

```
Agent frameworks (LLM / SDK)
        │ REST /v1/...  or  MCP  memory.* / context.load / policy.share
        ▼
Next.js Gateway  (control plane, TypeScript)
        │ Sui SDK tx  +  Sui SDK read
        ▼
Sui Move package  (move/sources/*.move)   — ownership, policy, pointers, versions
        │
        ▼
Walrus publisher + aggregator  (HTTP)   — bytes

Side store: SQLite (better-sqlite3)  — index only, never authoritative.
```

Three invariants enforced by code shape, not documentation:

- `add_memory_pointer` is a single Move entry that **atomically** mints the pointer and updates `AgentSpace.active_memory_root` + `version` in one transaction (no separate "update root" call).
- All gateway writes follow **Walrus first, Sui second, SQLite third**; failure-mode handling is encoded in `lib/service/*.ts` return types.
- REST and MCP both call into `src/lib/service/*`; the "no direct Sui or Walrus imports outside `service/`" rule is enforced by an ESLint `no-restricted-imports` block.

---

## 2. Module / directory layout (recap, plus exact file list)

```
.
├── move/
│   ├── sources/
│   │   ├── agent_space.move
│   │   ├── memory_pointer.move
│   │   └── access_policy.move
│   ├── tests/
│   │   └── suiedge_tests.move
│   ├── Move.toml
│   └── README.md                       (exists, Chinese mirror in README.zh.md)
│
├── migrations/
│   └── 0001_init.sql
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                  (new — dapp-kit provider)
│   │   ├── page.tsx                    (new — dashboard home)
│   │   ├── spaces/[id]/page.tsx        (new — space detail)
│   │   ├── providers.tsx               (new — client-side wallet providers)
│   │   └── api/v1/
│   │       ├── spaces/route.ts                                  (POST + GET)
│   │       ├── spaces/[id]/share/route.ts                        (POST)
│   │       ├── spaces/[id]/memories/route.ts                     (POST + GET)
│   │       ├── spaces/[id]/context/route.ts                      (GET)
│   │       ├── spaces/[id]/artifacts/route.ts                    (POST + GET)
│   │       ├── spaces/[id]/proof-logs/route.ts                   (POST + GET)
│   │       └── spaces/[id]/revoke/route.ts                       (POST)
│   ├── mcp/
│   │   ├── server.ts                   (new — stdio MCP bootstrap)
│   │   └── tools/
│   │       ├── space.ts                (space.create, space.list)
│   │       ├── memory.ts               (memory.write, memory.search)
│   │       ├── context.ts              (context.load)
│   │       ├── artifact.ts             (artifact.save)
│   │       ├── trace.ts                (trace.log)
│   │       └── policy.ts               (policy.share, policy.revoke)
│   ├── lib/
│   │   ├── types.ts                    (modify — extend with new request/response types)
│   │   ├── config.ts                   (new — env loader + zod validation)
│   │   ├── auth.ts                     (new — wallet signature verification)
│   │   ├── errors.ts                   (new — GatewayError + HTTP code mapping)
│   │   ├── sui.ts                      (new — dapp-kit Move call helpers)
│   │   ├── walrus.ts                   (new — Walrus publisher/aggregator wrapper)
│   │   ├── policy.ts                   (new — AccessPolicy read/cache/revoke)
│   │   ├── context.ts                  (new — active context assembly)
│   │   ├── store.ts                    (new — better-sqlite3 wrapper + migrations runner)
│   │   ├── hash.ts                     (new — sha256 helpers)
│   │   └── service/
│   │       ├── spaces.ts               (new)
│   │       ├── memories.ts             (new)
│   │       ├── artifacts.ts            (new)
│   │       ├── proofLogs.ts            (new)
│   │       └── policy.ts               (new)
│   └── components/
│       ├── WalletConnect.tsx           (new)
│       ├── SpaceCard.tsx               (new)
│       ├── MemoryTimeline.tsx          (new)
│       ├── ArtifactList.tsx            (new)
│       ├── ProofLogList.tsx            (new)
│       └── PolicyPanel.tsx             (new)
│
├── tests/
│   └── gateway/
│       ├── helpers/
│       │   ├── mockSui.ts              (new)
│       │   ├── mockWalrus.ts           (new)
│       │   └── seedDb.ts               (new)
│       ├── service/
│       │   ├── spaces.test.ts          (new)
│       │   ├── memories.test.ts        (new)
│       │   ├── artifacts.test.ts       (new)
│       │   ├── proofLogs.test.ts       (new)
│       │   └── policy.test.ts          (new)
│       ├── routes/
│       │   ├── spaces.routes.test.ts   (new)
│       │   ├── memories.routes.test.ts (new)
│       │   ├── context.routes.test.ts  (new)
│       │   ├── artifacts.routes.test.ts(new)
│       │   ├── proofLogs.routes.test.ts(new)
│       │   └── policy.routes.test.ts   (new)
│       ├── mcp/
│       │   └── tools.test.ts           (new)
│       └── e2e/
│           └── mvp-flow.test.ts        (new — full 7-step demo)
│
├── playwright/
│   └── dashboard.spec.ts               (new — smoke for / and /spaces/[id])
│
├── .env.example                        (exists)
├── package.json                        (modify — add deps + scripts)
├── tsconfig.json                       (exists, no change)
├── next.config.ts                      (exists, no change)
├── vitest.config.ts                    (new)
├── README.md                           (exists, modify polish on Day 6)
└── DESIGN.detailed.md                  (this file)
```
### 2.1 Why this shape

- **Move modules split per object.** Each object is its own `.move` file so reviewers read the smallest unit.
- **MCP is a separate process.** A stdio MCP server imports the same `lib/service/*` modules as the REST routes — one business-logic implementation, one store.
- **Service layer is the seam.** REST and MCP both call into `src/lib/service/*`; route handlers and MCP tool definitions are thin adapters.
- **Components are dumb.** Dashboard components render; they call `lib/service/*` via server actions or route handlers, never directly into Walrus/Sui.

---

## 3. Move package

### 3.1 `move/Move.toml`

```toml
[package]
name = "suiedge_memory_gateway"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
suiedge = "0x0"
```

The package id is filled in at deploy time and exported as `SUI_PACKAGE_ID`. Every Move entry that mutates `AgentSpace` requires `ctx.sender() == space.owner`; this is asserted in the function body, not in a separate capability.

### 3.2 `move/sources/agent_space.move`

```move
module suiedge::agent_space;

use std::string::String;
use sui::event;
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::TxContext;

const E_NOT_OWNER: u64 = 1;
const E_INVALID_NAME: u64 = 2;

public struct AgentSpace has key, store {
    id: UID,
    owner: address,
    name: String,
    active_memory_root: vector<u8>,
    policy_version: u64,
    version: u64,
}

public struct AgentSpaceCreated has copy, drop {
    space_id: ID,
    owner: address,
    name: String,
    version: u64,
}

public fun owner(s: &AgentSpace): address { s.owner }
public fun name(s: &AgentSpace): &String { &s.name }
public fun version(s: &AgentSpace): u64 { s.version }
public fun active_memory_root(s: &AgentSpace): &vector<u8> { &s.active_memory_root }
public fun policy_version(s: &AgentSpace): u64 { s.policy_version }

public entry fun create_space(name: String, ctx: &mut TxContext) {
    assert!(std::string::length(&name) > 0 && std::string::length(&name) <= 64, E_INVALID_NAME);
    let owner = tx_context::sender(ctx);
    let id = object::new(ctx);
    let space_id = object::uid_to_inner(&id);
    let s = AgentSpace {
        id,
        owner,
        name,
        active_memory_root: vector::empty<u8>(),
        policy_version: 0,
        version: 0,
    };
    event::emit(AgentSpaceCreated { space_id, owner, name: s.name, version: 0 });
    transfer::transfer(s, owner);
}

// Friend-only — called by memory_pointer and access_policy to keep the root + version consistent.
public(friend) fun bump_after_pointer(
    s: &mut AgentSpace,
    new_root: vector<u8>,
    caller: address,
) {
    assert!(s.owner == caller, E_NOT_OWNER);
    s.active_memory_root = new_root;
    s.version = s.version + 1;
}

public(friend) fun bump_policy_version(s: &mut AgentSpace, caller: address) {
    assert!(s.owner == caller, E_NOT_OWNER);
    s.policy_version = s.policy_version + 1;
}
```

`friend` declarations:

```move
friend suiedge::memory_pointer;
friend suiedge::access_policy;
```

### 3.3 `move/sources/memory_pointer.move`

```move
module suiedge::memory_pointer;

use std::vector;
use sui::event;
use sui::hash;
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::TxContext;
use suiedge::agent_space::{Self, AgentSpace};

const E_NOT_OWNER: u64 = 10;
const E_BLOB_ID_EMPTY: u64 = 11;
const E_HASH_MISMATCH: u64 = 12;

const KIND_MEMORY:    u8 = 1;
const KIND_ARTIFACT:  u8 = 2;
const KIND_PROOF_LOG: u8 = 3;

public struct MemoryPointer has key, store {
    id: UID,
    space_id: ID,
    kind: u8,
    walrus_blob_id: vector<u8>,
    content_hash: vector<u8>,
    version: u64,
    created_at: u64,
}

public struct MemoryPointerAdded has copy, drop {
    pointer_id: ID,
    space_id: ID,
    kind: u8,
    walrus_blob_id: vector<u8>,
    version: u64,
}

public fun kind(p: &MemoryPointer): u8 { p.kind }
public fun space_id(p: &MemoryPointer): ID { p.space_id }
public fun walrus_blob_id(p: &MemoryPointer): &vector<u8> { &p.walrus_blob_id }
public fun content_hash(p: &MemoryPointer): &vector<u8> { &p.content_hash }
public fun version(p: &MemoryPointer): u64 { p.version }
public fun pointer_id(p: &MemoryPointer): ID { object::uid_to_inner(&p.id) }

public fun kind_memory(): u8    { KIND_MEMORY }
public fun kind_artifact(): u8  { KIND_ARTIFACT }
public fun kind_proof_log(): u8 { KIND_PROOF_LOG }

// Atomic: mints the pointer, updates AgentSpace root + version, transfers the pointer to the owner.
public entry fun add_memory_pointer(
    space: &mut AgentSpace,
    kind: u8,
    walrus_blob_id: vector<u8>,
    content_hash: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(vector::length(&walrus_blob_id) > 0, E_BLOB_ID_EMPTY);
    assert!(
        kind == KIND_MEMORY || kind == KIND_ARTIFACT || kind == KIND_PROOF_LOG,
        E_HASH_MISMATCH,
    );

    let pointer_uid = object::new(ctx);
    let pointer_id = object::uid_to_inner(&pointer_uid);
    let space_id = object::id(space);
    let new_version = agent_space::version(space) + 1;

    let p = MemoryPointer {
        id: pointer_uid,
        space_id,
        kind,
        walrus_blob_id,
        content_hash,
        version: new_version,
        created_at: tx_context::epoch_timestamp_ms(ctx),
    };

    let digest = hash::keccak256(&sui::bcs::to_bytes(&pointer_id));
    agent_space::bump_after_pointer(space, digest, tx_context::sender(ctx));

    event::emit(MemoryPointerAdded {
        pointer_id,
        space_id,
        kind,
        walrus_blob_id: p.walrus_blob_id,
        version: new_version,
    });

    transfer::transfer(p, agent_space::owner(space));
}
```

`ArtifactPointer` and `ProofLog` are **not** separate Move structs; they are `MemoryPointer` with `kind = 2` or `kind = 3`. The TypeScript layer and the REST/MCP surfaces distinguish them for human readability.

### 3.4 `move/sources/access_policy.move`

```move
module suiedge::access_policy;

use sui::event;
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::TxContext;
use suiedge::agent_space::{Self, AgentSpace};

const E_NOT_OWNER: u64 = 20;
const E_ALREADY_REVOKED: u64 = 21;
const E_INVALID_FLAGS: u64 = 22;

public struct AccessPolicy has key, store {
    id: UID,
    space_id: ID,
    subject: address,
    can_read: bool,
    can_write: bool,
    can_share: bool,
    revoked: bool,
}

public struct AccessPolicyCreated has copy, drop {
    policy_id: ID,
    space_id: ID,
    subject: address,
    can_read: bool,
    can_write: bool,
    can_share: bool,
}

public struct AccessPolicyRevoked has copy, drop {
    policy_id: ID,
    space_id: ID,
    subject: address,
}

public fun subject(p: &AccessPolicy): address { p.subject }
public fun can_read(p: &AccessPolicy): bool    { p.can_read && !p.revoked }
public fun can_write(p: &AccessPolicy): bool   { p.can_write && !p.revoked }
public fun can_share(p: &AccessPolicy): bool   { p.can_share && !p.revoked }
public fun revoked(p: &AccessPolicy): bool     { p.revoked }
public fun policy_space_id(p: &AccessPolicy): ID { p.space_id }

public entry fun share(
    space: &mut AgentSpace,
    subject: address,
    can_read: bool,
    can_write: bool,
    can_share: bool,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == agent_space::owner(space), E_NOT_OWNER);
    let uid = object::new(ctx);
    let policy_id = object::uid_to_inner(&uid);
    let space_id = object::id(space);
    let p = AccessPolicy {
        id: uid,
        space_id,
        subject,
        can_read,
        can_write,
        can_share,
        revoked: false,
    };
    agent_space::bump_policy_version(space, tx_context::sender(ctx));
    event::emit(AccessPolicyCreated { policy_id, space_id, subject, can_read, can_write, can_share });
    transfer::transfer(p, agent_space::owner(space));
}

public entry fun revoke(
    space: &mut AgentSpace,
    policy: &mut AccessPolicy,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == agent_space::owner(space), E_NOT_OWNER);
    assert!(!policy.revoked, E_ALREADY_REVOKED);
    policy.revoked = true;
    agent_space::bump_policy_version(space, tx_context::sender(ctx));
    event::emit(AccessPolicyRevoked {
        policy_id: object::id(policy),
        space_id: object::id(space),
        subject: policy.subject,
    });
}
```

Owner-check pattern: every mutating entry function takes `space: &mut AgentSpace` and asserts `sender == space.owner`. The `AccessPolicy` object is owned by the space owner; non-owners cannot call `revoke` even on policies addressed to them.

### 3.5 `move/tests/suiedge_tests.move`

Six named tests; each asserts one invariant. Run with `sui move test`.

| Test name | Asserts |
|-----------|---------|
| `test_create_space_emits_event_and_assigns_owner` | `AgentSpaceCreated` event fires with correct owner; returned object owner = sender. |
| `test_add_memory_pointer_bumps_version_and_root` | Version goes 0 → 1; `active_memory_root` changes; `MemoryPointerAdded` event matches. |
| `test_add_memory_pointer_rejects_empty_blob_id` | Calling with empty `walrus_blob_id` aborts with `E_BLOB_ID_EMPTY`. |
| `test_revoke_blocks_subsequent_can_read` | After `revoke`, `can_read(&policy)` returns `false`; second `revoke` aborts with `E_ALREADY_REVOKED`. |
| `test_non_owner_cannot_add_pointer` | A second address calling `add_memory_pointer` on a space they don't own aborts with `E_NOT_OWNER` (the friend call to `bump_after_pointer` enforces this). |
| `test_kind_artifact_and_proof_log_share_struct` | Adding an artifact and a proof log produces two `MemoryPointer` objects with `kind = 2` and `kind = 3` respectively, and `space.version = 2`. |

---

## 4. SQLite schema

### `migrations/0001_init.sql`

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL
);

CREATE TABLE spaces (
  space_id       TEXT PRIMARY KEY,
  owner          TEXT NOT NULL,
  name           TEXT NOT NULL,
  latest_version INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  CHECK (length(space_id) > 0),
  CHECK (length(owner) > 0)
);

CREATE TABLE blobs (
  blob_id       TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL,
  object_id     TEXT NOT NULL,
  kind          INTEGER NOT NULL,
  version       INTEGER NOT NULL,
  content_hash  TEXT NOT NULL,
  mime_type     TEXT,
  name          TEXT,
  run_id        TEXT,
  agent_id      TEXT,
  input_hash    TEXT,
  output_hash   TEXT,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  CHECK (kind IN (1, 2, 3)),
  CHECK (version >= 0)
);

CREATE INDEX blobs_by_space        ON blobs(space_id, version);
CREATE INDEX blobs_by_space_kind   ON blobs(space_id, kind, version);
CREATE INDEX blobs_by_blob         ON blobs(blob_id);
CREATE UNIQUE INDEX blobs_uniq_version ON blobs(space_id, kind, version);

CREATE TABLE policy_cache (
  policy_id    TEXT PRIMARY KEY,
  space_id     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  can_read     INTEGER NOT NULL,
  can_write    INTEGER NOT NULL,
  can_share    INTEGER NOT NULL,
  revoked      INTEGER NOT NULL,
  fetched_at   INTEGER NOT NULL,
  UNIQUE (space_id, subject),
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  CHECK (can_read IN (0, 1)),
  CHECK (can_write IN (0, 1)),
  CHECK (can_share IN (0, 1)),
  CHECK (revoked IN (0, 1))
);

CREATE INDEX policy_cache_by_space ON policy_cache(space_id);

INSERT INTO schema_version (version, applied_at) VALUES (1, strftime('%s', 'now'));
```

### Convention

- `migrations/NNNN_description.sql`, applied in ascending order, **never edited after merge**.
- A new migration is a new file; never edit an old one.
- `src/lib/store.ts` runs unapplied migrations on startup and updates `schema_version` accordingly.

---

## 5. TypeScript types — `src/lib/types.ts` (extend the existing file)

Existing types (`AgentSpace`, `MemoryRecord`, `ArtifactRecord`, `ProofLog`, `AccessPolicy`) stay as-is. New types added below.

```ts
// Memory kinds (must match Move KIND_*)
export type MemoryKind = 1 | 2 | 3;
export const MEMORY_KIND: Record<'memory' | 'artifact' | 'proofLog', MemoryKind> = {
  memory: 1, artifact: 2, proofLog: 3,
};

// Request bodies
export interface CreateSpaceRequest { name: string }
export interface ShareRequest {
  subject: string;
  canRead: boolean;
  canWrite: boolean;
  canShare: boolean;
}
export interface WriteMemoryRequest {
  kind: 'summary' | 'decision' | 'context' | 'note';
  payload: string;
}
export interface WriteArtifactRequest {
  name: string;
  mimeType: string;
  payload: string;          // base64
}
export interface WriteProofLogRequest {
  runId: string;
  agentId: string;
  input: string;
  output: string;
}
export interface RevokeRequest { policyId: string }

// Responses
export interface ContextBundle {
  spaceId: string;
  items: Array<{
    kind: 'summary' | 'decision' | 'context' | 'note';
    version: number;
    contentHash: string;
    content: string;
  }>;
}

// Error body shape — all non-2xx responses use this
export interface ErrorResponse {
  code:
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'SUI_TX_FAILED'
    | 'WALRUS_WRITE_FAILED'
    | 'INTERNAL';
  message: string;
  details?: Record<string, unknown>;
}
```

`MemoryRecord.kind` stays as the existing string union for human readability; the Move-side `kind: u8` is always `KIND_MEMORY (1)` for memories. Artifacts always carry `kind = 2` on-chain but their TypeScript shape is `ArtifactRecord` (no `kind` field needed in TS).

---

## 6. Service layer

All paths under `src/lib/service/`. Each function is the single business-logic entry point; REST routes and MCP tools both call these.

### 6.1 `lib/service/spaces.ts`

```ts
export async function createSpace(input: {
  owner: string;            // Sui address, verified
  name: string;
}): Promise<AgentSpace>;

export async function listSpaces(input: {
  owner: string;
}): Promise<AgentSpace[]>;
```

- Move: `agent_space::create_space(name)`.
- Walrus: none.
- SQLite: `spaces` (INSERT / SELECT).
- Errors: `SUI_TX_FAILED` if Move call rejected or no `AgentSpaceCreated` event parsed; `BAD_REQUEST` if name empty or > 64 chars.

### 6.2 `lib/service/memories.ts`

```ts
export async function writeMemory(input: {
  spaceId: string;
  caller: string;
  kind: 'summary' | 'decision' | 'context' | 'note';
  payload: string;
}): Promise<MemoryRecord>;

export async function listMemories(input: {
  spaceId: string;
  caller: string;
  limit?: number;
}): Promise<MemoryRecord[]>;

export async function searchMemories(input: {
  spaceId: string;
  caller: string;
  query: string;
  limit?: number;
}): Promise<MemoryRecord[]>;     // substring match on text fetched from Walrus
```

- Move: `memory_pointer::add_memory_pointer(space, KIND_MEMORY, blob_id, content_hash)`.
- Walrus: publisher PUT `memories/{spaceId}/{version+1}`.
- SQLite: `blobs` (INSERT) + `spaces` (UPDATE `latest_version`).
- Order: **Walrus → hash → Sui → SQLite**. If Walrus write fails, return `WALRUS_WRITE_FAILED` (no chain mess). If Sui Move fails after Walrus succeeded, log `{ orphan_blob_id, payload_size }` and return `SUI_TX_FAILED`; the orphan is invisible because it has no `blobs` row.
- Errors: `FORBIDDEN` if `AccessPolicy.can_write == false || revoked`; `WALRUS_WRITE_FAILED`; `SUI_TX_FAILED`.

### 6.3 `lib/service/artifacts.ts`

```ts
export async function writeArtifact(input: {
  spaceId: string;
  caller: string;
  name: string;
  mimeType: string;
  payload: string;        // base64
}): Promise<ArtifactRecord>;

export async function listArtifacts(input: {
  spaceId: string;
  caller: string;
}): Promise<ArtifactRecord[]>;
```

Same shape as memories; Move `kind = KIND_ARTIFACT`; Walrus key prefix `artifacts/{spaceId}/{version+1}`. Mime type and name stored in `blobs` nullable columns.

### 6.4 `lib/service/proofLogs.ts`

```ts
export async function writeProofLog(input: {
  spaceId: string;
  caller: string;
  runId: string;
  agentId: string;
  input: string;
  output: string;
}): Promise<ProofLog>;

export async function listProofLogs(input: {
  spaceId: string;
  caller: string;
}): Promise<ProofLog[]>;
```

Walrus key prefix `proof-logs/{spaceId}/{runId}`; on-chain `kind = KIND_PROOF_LOG`; `blobs` row stores `run_id`, `agent_id`, `input_hash`, `output_hash`.

### 6.5 `lib/service/policy.ts`

```ts
export async function share(input: {
  spaceId: string;
  caller: string;
  subject: string;
  canRead: boolean;
  canWrite: boolean;
  canShare: boolean;
}): Promise<AccessPolicy>;

export async function revoke(input: {
  spaceId: string;
  caller: string;
  policyId: string;
}): Promise<AccessPolicy>;

export async function getPolicy(input: {
  spaceId: string;
  subject: string;
}): Promise<AccessPolicy | null>;
```

- Move: `access_policy::share(space, subject, ...)` / `access_policy::revoke(space, policy)`.
- Walrus: none.
- SQLite: `policy_cache` (UPSERT on `(space_id, subject)`).
- `getPolicy` is the hot path: read `policy_cache` first; on miss, fetch the on-chain `AccessPolicy` object by `policy_id` and populate the cache. If `revoked = true`, return a row marked `revoked = 1` and short-circuit future reads.

### 6.6 `lib/service/context.ts`

```ts
export async function loadContext(input: {
  spaceId: string;
  caller: string;
  maxItems?: number;        // default 50, hard cap 200
}): Promise<ContextBundle>;
```

- Walrus: aggregator GET on each blob in the bundle.
- SQLite: read `blobs` ordered by `version DESC LIMIT N`.
- Move: read `AgentSpace.active_memory_root` to confirm the latest pointer id; the index is treated as authoritative for ordering.
- Errors: `FORBIDDEN` if no read policy; `NOT_FOUND` if space unknown.

---

## 7. REST routes

All routes under `src/app/api/v1/`. Auth: every route requires the headers below.

Headers:
- `X-Sui-Address`: `0x...` Sui address (caller).
- `X-Sui-Signature`: base64 of `verifyPersonalMessage` over the canonical string `"<METHOD>\n<PATH>\n<BODY_SHA256_HEX>"`.

Signature scheme is defined once in `src/lib/auth.ts`. That module is the only file that imports `@mysten/sui`'s `verifyPersonalMessage`.

### 7.1 `spaces/route.ts`

| Method | Path | Body (zod) | Success | Errors | Auth | Service |
|--------|------|------------|---------|--------|------|---------|
| POST | `/v1/spaces` | `z.object({ name: z.string().min(1).max(64) })` | `201 AgentSpace` | `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `500 SUI_TX_FAILED` | yes | `service.spaces.createSpace` |
| GET | `/v1/spaces` | query: `owner=0x...` (required) | `200 AgentSpace[]` | `400 BAD_REQUEST`, `401 UNAUTHORIZED` | yes | `service.spaces.listSpaces` |

### 7.2 `spaces/[id]/share/route.ts`

| Method | Path | Body (zod) | Success | Errors | Auth | Service |
|--------|------|------------|---------|--------|------|---------|
| POST | `/v1/spaces/:id/share` | `z.object({ subject: z.string().regex(/^0x[0-9a-fA-F]{64}$/), canRead: z.boolean(), canWrite: z.boolean(), canShare: z.boolean() })` | `201 AccessPolicy` | `400`, `401`, `403` (non-owner), `404`, `500 SUI_TX_FAILED` | yes | `service.policy.share` |

### 7.3 `spaces/[id]/memories/route.ts`

| Method | Path | Body (zod) | Success | Errors | Auth | Service |
|--------|------|------------|---------|--------|------|---------|
| POST | `/v1/spaces/:id/memories` | `z.object({ kind: z.enum(['summary','decision','context','note']), payload: z.string().min(1).max(1_000_000) })` | `201 MemoryRecord` | `400`, `401`, `403`, `404`, `500 WALRUS_WRITE_FAILED`, `500 SUI_TX_FAILED` | yes | `service.memories.writeMemory` |
| GET | `/v1/spaces/:id/memories` | query: `limit?` (default 50, cap 200) | `200 MemoryRecord[]` | `400`, `401`, `403`, `404` | yes | `service.memories.listMemories` |

### 7.4 `spaces/[id]/context/route.ts`

| Method | Path | Body (zod) | Success | Errors | Auth | Service |
|--------|------|------------|---------|--------|------|---------|
| GET | `/v1/spaces/:id/context` | query: `maxItems?` (default 50, cap 200) | `200 ContextBundle` | `400`, `401`, `403`, `404` | yes | `service.context.loadContext` |

### 7.5 `spaces/[id]/artifacts/route.ts`

| Method | Path | Body (zod) | Success | Errors | Auth | Service |
|--------|------|------------|---------|--------|------|---------|
| POST | `/v1/spaces/:id/artifacts` | `z.object({ name: z.string().min(1).max(128), mimeType: z.string().min(1).max(128), payload: z.string().min(1).max(10_000_000) })` (payload is base64) | `201 ArtifactRecord` | `400`, `401`, `403`, `404`, `500 WALRUS_WRITE_FAILED`, `500 SUI_TX_FAILED` | yes | `service.artifacts.writeArtifact` |
| GET | `/v1/spaces/:id/artifacts` | — | `200 ArtifactRecord[]` | `400`, `401`, `403`, `404` | yes | `service.artifacts.listArtifacts` |

### 7.6 `spaces/[id]/proof-logs/route.ts`

| Method | Path | Body (zod) | Success | Errors | Auth | Service |
|--------|------|------------|---------|--------|------|---------|
| POST | `/v1/spaces/:id/proof-logs` | `z.object({ runId: z.string().min(1).max(128), agentId: z.string().min(1).max(128), input: z.string().min(1).max(1_000_000), output: z.string().min(1).max(1_000_000) })` | `201 ProofLog` | `400`, `401`, `403`, `404`, `500 WALRUS_WRITE_FAILED`, `500 SUI_TX_FAILED` | yes | `service.proofLogs.writeProofLog` |
| GET | `/v1/spaces/:id/proof-logs` | — | `200 ProofLog[]` | same as memories | yes | `service.proofLogs.listProofLogs` |

### 7.7 `spaces/[id]/revoke/route.ts`

| Method | Path | Body (zod) | Success | Errors | Auth | Service |
|--------|------|------------|---------|--------|------|---------|
| POST | `/v1/spaces/:id/revoke` | `z.object({ policyId: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })` | `200 AccessPolicy` (with `revoked: true`) | `400`, `401`, `403`, `404`, `409` (already revoked), `500 SUI_TX_FAILED` | yes | `service.policy.revoke` |

---

## 8. MCP tools

`src/mcp/server.ts` exposes one tool per row. Each tool's input is JSON-validated at the boundary; the implementation calls the same `lib/service/*` function as the matching REST route.

| Tool | Input JSON schema | Output JSON schema | Service call |
|------|-------------------|--------------------|--------------|
| `space.create` | `{ name: string(1..64) }` | `AgentSpace` | `service.spaces.createSpace` |
| `space.list` | `{ owner: string(0x…) }` | `AgentSpace[]` | `service.spaces.listSpaces` |
| `memory.write` | `{ spaceId, kind: enum, payload }` | `MemoryRecord` | `service.memories.writeMemory` |
| `memory.search` | `{ spaceId, query: string, limit?: number }` | `MemoryRecord[]` | `service.memories.searchMemories` |
| `context.load` | `{ spaceId, maxItems?: number }` | `ContextBundle` | `service.context.loadContext` |
| `artifact.save` | `{ spaceId, name, mimeType, payload(base64) }` | `ArtifactRecord` | `service.artifacts.writeArtifact` |
| `trace.log` | `{ spaceId, runId, agentId, input, output }` | `ProofLog` | `service.proofLogs.writeProofLog` |
| `policy.share` | `{ spaceId, subject, canRead, canWrite, canShare }` | `AccessPolicy` | `service.policy.share` |
| `policy.revoke` | `{ policyId }` | `AccessPolicy` | `service.policy.revoke` |

### 8.1 `src/mcp/server.ts` outline

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toolDefinitions } from './tools/index.js';

const server = new Server({ name: 'suiedge', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = toolDefinitions.find(t => t.name === req.params.name);
  if (!tool) throw new Error(`unknown tool: ${req.params.name}`);
  return tool.handler(req.params.arguments ?? {});
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 9. UI components

All under `src/components/`. Server actions call `lib/service/*`; client components consume them.

| Component | Props | Renders | Data source | Interactions |
|-----------|-------|---------|-------------|--------------|
| `WalletConnect` | `{}` | "Connect Wallet" button; when connected, truncated `0x…` address | `@mysten/dapp-kit` `useCurrentAccount` | Click → opens dapp-kit modal |
| `SpaceCard` | `{ space: AgentSpace }` | Space name, owner (truncated), version, link to `/spaces/[id]` | server-fetched list passed from `app/page.tsx` | Click → router push to detail |
| `MemoryTimeline` | `{ spaceId: string }` | Reverse-chronological list of `MemoryRecord` with kind badge, content (text or "open in Walrus"), version, hash | server action `loadContext` then group by version | Click item → expand blob preview |
| `ArtifactList` | `{ spaceId: string }` | Table of `ArtifactRecord` (name, mime, size, hash, link) | server action `listArtifacts` | Click row → "Download from Walrus" (new tab) |
| `ProofLogList` | `{ spaceId: string }` | Table of `ProofLog` (runId, agentId, input/output hashes, link) | server action `listProofLogs` | Click row → modal with input/output text |
| `PolicyPanel` | `{ spaceId: string }` | List of `AccessPolicy` for the space with flags + revoked state; "Share" form; per-row "Revoke" | server action `getPolicy` + `share` + `revoke` | Form submit; revoke button with confirm |

Server actions are defined inline in the page or in `src/lib/actions/*.ts`. They validate inputs with zod and call `lib/service/*`.

---

## 10. Per-day breakdown

### Day 1 — Skeleton

**Files created:**
- `move/Move.toml`
- `move/sources/agent_space.move` (full)
- `move/sources/memory_pointer.move` (full)
- `move/sources/access_policy.move` (full)
- `move/tests/suiedge_tests.move` (all 6 tests)
- `migrations/0001_init.sql`
- `src/lib/store.ts`
- `src/lib/config.ts`
- `src/lib/errors.ts`
- `src/lib/types.ts` (extended with new request/response/error types)
- `src/app/api/v1/spaces/route.ts` (POST + GET returning stubs)
- `src/app/api/v1/spaces/[id]/share/route.ts` (stub 501)
- `src/app/api/v1/spaces/[id]/memories/route.ts` (stub 501)
- `src/app/api/v1/spaces/[id]/context/route.ts` (stub 501)
- `src/app/api/v1/spaces/[id]/artifacts/route.ts` (stub 501)
- `src/app/api/v1/spaces/[id]/proof-logs/route.ts` (stub 501)
- `src/app/api/v1/spaces/[id]/revoke/route.ts` (stub 501)
- `vitest.config.ts`

**Files modified:**
- `package.json` (add `better-sqlite3`, `zod`, `@mysten/dapp-kit`, `@mysten/sui`, `@modelcontextprotocol/sdk`, `vitest`, scripts: `test`, `test:move`, `lint`, `db:migrate`)
- `tsconfig.json` (add `tests/**/*` to `include`)

**Commands:**
```bash
pnpm install
sui move build
sui move test
pnpm exec tsc --noEmit
pnpm test -- --run
```

**Acceptance test:**
```bash
curl -s -X POST http://localhost:3000/api/v1/spaces \
  -H 'content-type: application/json' \
  -d '{"name":"demo"}' | jq .
# Expected: { "code": "INTERNAL", "message": "service not yet implemented" } (stub returns 501 JSON; or non-2xx on Day 1)
sui move test
# Expected: 6 passing
```

---

### Day 2 — Walrus + create_space real flow

**Files created:**
- `src/lib/sui.ts`
- `src/lib/walrus.ts`
- `src/lib/hash.ts`
- `src/lib/service/spaces.ts` (real)
- `src/lib/service/memories.ts` (real)
- `src/lib/service/artifacts.ts` (real)
- `src/lib/service/proofLogs.ts` (real)
- `src/lib/auth.ts`
- `tests/gateway/helpers/mockSui.ts`
- `tests/gateway/helpers/mockWalrus.ts`
- `tests/gateway/helpers/seedDb.ts`
- `tests/gateway/service/spaces.test.ts`

**Files modified:**
- `src/app/api/v1/spaces/route.ts` (real)
- `src/lib/store.ts` (real schema runner)

**Commands:**
```bash
sui client publish --gas-budget 500000000
# Capture SUI_PACKAGE_ID from output, write to .env
pnpm exec tsc --noEmit
pnpm test -- --run service/spaces
```

**Acceptance test:**
```bash
SIGNATURE=$(echo -n "POST\n/v1/spaces\n$(echo -n '{"name":"demo"}' | sha256sum | cut -d' ' -f1)" | sui keytool sign --address $OWNER)
curl -s -X POST http://localhost:3000/api/v1/spaces \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" \
  -H "X-Sui-Signature: $SIGNATURE" \
  -d '{"name":"demo"}' | jq .
# Expected: { "id": "0x...", "owner": "0x...", "name": "demo", "version": 0, ... }
sui object $SPACE_ID
# Expected: shows AgentSpace with active_memory_root = [] and version = 0
```

---

### Day 3 — Memory write + context load + version bump + timeline UI

**Files created:**
- `src/app/providers.tsx` (dapp-kit)
- `src/app/layout.tsx` (wraps providers)
- `src/app/page.tsx` (dashboard home)
- `src/app/spaces/[id]/page.tsx`
- `src/components/WalletConnect.tsx`
- `src/components/SpaceCard.tsx`
- `src/components/MemoryTimeline.tsx`
- `src/lib/context.ts`
- `src/lib/service/context.ts`
- `src/lib/actions/memories.ts`
- `src/lib/actions/context.ts`
- `tests/gateway/service/memories.test.ts`
- `tests/gateway/routes/memories.routes.test.ts`
- `tests/gateway/routes/context.routes.test.ts`

**Files modified:**
- `src/app/api/v1/spaces/[id]/memories/route.ts` (real)
- `src/app/api/v1/spaces/[id]/context/route.ts` (real)
- `package.json` (add `@mysten/dapp-kit` peer setup)

**Commands:**
```bash
pnpm install
pnpm exec tsc --noEmit
pnpm test -- --run service/memories routes/memories routes/context
pnpm dev
```

**Acceptance test:**
```bash
# Write 3 memories as owner
for i in 1 2 3; do
  curl -s -X POST http://localhost:3000/api/v1/spaces/$SPACE/memories \
    -H 'content-type: application/json' \
    -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $(sign POST /v1/spaces/$SPACE/memories $(jq -nc --arg p "memory $i" '{kind:"summary",payload:$p}' | sha256sum | cut -d' ' -f1))" \
    -d "$(jq -nc --arg p "memory $i" '{kind:"summary",payload:$p}')" | jq .
done
# Expected: 3× 201, each with version 1, 2, 3 and ascending walrusBlobId
curl -s http://localhost:3000/api/v1/spaces/$SPACE/context \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $(sign GET /v1/spaces/$SPACE/context $(echo -n GET | sha256sum | cut -d' ' -f1))" | jq .
# Expected: ContextBundle with items[0..2] in version order
open http://localhost:3000/spaces/$SPACE
# Expected: timeline panel shows 3 entries
```

---

### Day 4 — Access policy, share/revoke, multi-agent demo

**Files created:**
- `src/lib/policy.ts`
- `src/lib/service/policy.ts`
- `src/components/PolicyPanel.tsx`
- `src/lib/actions/policy.ts`
- `tests/gateway/service/policy.test.ts`
- `tests/gateway/routes/policy.routes.test.ts`

**Files modified:**
- `src/app/api/v1/spaces/[id]/share/route.ts` (real)
- `src/app/api/v1/spaces/[id]/revoke/route.ts` (real)
- `src/app/spaces/[id]/page.tsx` (mount `PolicyPanel`)

**Commands:**
```bash
pnpm exec tsc --noEmit
pnpm test -- --run service/policy routes/policy
```

**Acceptance test:**
```bash
# Owner shares with reviewer
curl -s -X POST http://localhost:3000/api/v1/spaces/$SPACE/share \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $(sign POST /v1/spaces/$SPACE/share ...)" \
  -d '{"subject":"0xREVIEWER","canRead":true,"canWrite":true,"canShare":false}' | jq .
# Expected: 201 AccessPolicy with revoked: false
# Reviewer writes
curl -s -X POST http://localhost:3000/api/v1/spaces/$SPACE/proof-logs \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: 0xREVIEWER" -H "X-Sui-Signature: $(sign POST ... 0xREVIEWER ...)" \
  -d '{"runId":"r1","agentId":"reviewer","input":"check","output":"lgtm"}' | jq .
# Expected: 201 ProofLog
# Owner revokes
curl -s -X POST http://localhost:3000/api/v1/spaces/$SPACE/revoke \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $(sign POST ... $OWNER ...)" \
  -d "{\"policyId\":\"$POLICY_ID\"}" | jq .
# Expected: 200 with revoked: true
# Reviewer tries again
curl -s -X POST http://localhost:3000/api/v1/spaces/$SPACE/proof-logs -H ... -H "X-Sui-Address: 0xREVIEWER" ... | jq .
# Expected: 403 FORBIDDEN
```

---

### Day 5 — Artifacts + proof logs + 4 dashboard panels

**Files created:**
- `src/components/ArtifactList.tsx`
- `src/components/ProofLogList.tsx`
- `src/lib/actions/artifacts.ts`
- `src/lib/actions/proofLogs.ts`
- `tests/gateway/service/artifacts.test.ts`
- `tests/gateway/service/proofLogs.test.ts`
- `tests/gateway/routes/artifacts.routes.test.ts`
- `tests/gateway/routes/proofLogs.routes.test.ts`
- `playwright/dashboard.spec.ts`

**Files modified:**
- `src/app/api/v1/spaces/[id]/artifacts/route.ts` (real)
- `src/app/api/v1/spaces/[id]/proof-logs/route.ts` (real)
- `src/app/spaces/[id]/page.tsx` (mount `ArtifactList`, `ProofLogList`)

**Commands:**
```bash
pnpm exec tsc --noEmit
pnpm test -- --run
pnpm exec playwright test
```

**Acceptance test:**
```bash
pnpm exec playwright test
# Expected: 2 passing
open http://localhost:3000/spaces/$SPACE
# Expected: 4 panels (timeline, artifacts, proof logs, policy) all populated
```

---

### Day 6 — MCP server, e2e demo, deploy

**Files created:**
- `src/mcp/server.ts`
- `src/mcp/tools/index.ts`
- `src/mcp/tools/space.ts`
- `src/mcp/tools/memory.ts`
- `src/mcp/tools/context.ts`
- `src/mcp/tools/artifact.ts`
- `src/mcp/tools/trace.ts`
- `src/mcp/tools/policy.ts`
- `tests/gateway/mcp/tools.test.ts`
- `tests/gateway/e2e/mvp-flow.test.ts`
- `docs/demo.sh`

**Files modified:**
- `package.json` (add `mcp` script)
- `README.md` (add demo recording, screenshots, run instructions)
- `docs/SUBMISSION.md` (final polish)
- `DESIGN.detailed.md` (note any deviations)

**Commands:**
```bash
pnpm test -- --run e2e/mvp-flow
pnpm run mcp &
# In another shell, exercise the 7-step demo
bash docs/demo.sh
sui client publish --gas-budget 500000000 --upgrade
# Deploy Next.js
vercel deploy --prod
```

**Acceptance test:**
```bash
bash docs/demo.sh
# Expected: 7 steps, each prints expected response shape; final dashboard URL returns 200
pnpm test -- --run e2e/mvp-flow
# Expected: 1 passing
```

---

## 11. End-to-end demo script (`docs/demo.sh`)

This is the canonical reproduction of the `docs/MVP.md` 7-step demo. Each step shows the expected response.

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
OWNER=${OWNER:-0xOWNER}
REVIEWER=${REVIEWER:-0xREVIEWER}

sign() {
  local method=$1 path=$2 body=$3 addr=$4
  printf '%s\n%s\n%s' "$method" "$path" "$(printf %s "$body" | shasum -a 256 | cut -d' ' -f1)" \
    | sui keytool sign --address "$addr" --plain
}

echo "1) Connect wallet (assume dapp-kit modal)"
echo "   connected_address=$OWNER"

echo "2) Create AgentSpace"
BODY='{"name":"sui-overflow-2026"}'
SIG=$(sign POST /v1/spaces "$BODY" "$OWNER")
SP=$(curl -fsS -X POST "$BASE/v1/spaces" \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $SIG" \
  -d "$BODY")
echo "   $SP"
SPACE=$(echo "$SP" | jq -r .id)

echo "3) Research agent writes project context"
BODY='{"kind":"context","payload":"Sui Overflow project: walrus-backed agent memory."}'
SIG=$(sign POST "/v1/spaces/$SPACE/memories" "$BODY" "$OWNER")
curl -fsS -X POST "$BASE/v1/spaces/$SPACE/memories" \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $SIG" \
  -d "$BODY" | jq .

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
  -d "$ART_BODY" | jq .

echo "5) Reviewer writes a ProofLog"
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
  -d "$PL_BODY" | jq .

echo "6) Owner revokes reviewer access"
POLICY_ID=$(echo "$POLICY" | jq -r .id)
RV_BODY='{"policyId":"'$POLICY_ID'"}'
SIG=$(sign POST "/v1/spaces/$SPACE/revoke" "$RV_BODY" "$OWNER")
curl -fsS -X POST "$BASE/v1/spaces/$SPACE/revoke" \
  -H 'content-type: application/json' \
  -H "X-Sui-Address: $OWNER" -H "X-Sui-Signature: $SIG" \
  -d "$RV_BODY" | jq .

echo "7) Dashboard: open $BASE/spaces/$SPACE"
echo "   Expected: 4 panels (timeline, artifacts, proof logs, policy) all populated;"
echo "   reviewer policy row shows revoked = true."
```

---

## 12. Test plan

| Test file | Test name | Asserts |
|-----------|-----------|---------|
| `move/tests/suiedge_tests.move` | `test_create_space_emits_event_and_assigns_owner` | `AgentSpaceCreated` event fires; object owner = sender. |
| | `test_add_memory_pointer_bumps_version_and_root` | Version 0 → 1; `active_memory_root` changes; `MemoryPointerAdded` event matches. |
| | `test_add_memory_pointer_rejects_empty_blob_id` | Empty `walrus_blob_id` aborts with `E_BLOB_ID_EMPTY`. |
| | `test_revoke_blocks_subsequent_can_read` | After `revoke`, `can_read` returns false; second `revoke` aborts with `E_ALREADY_REVOKED`. |
| | `test_non_owner_cannot_add_pointer` | Non-owner calling `add_memory_pointer` aborts with `E_NOT_OWNER`. |
| | `test_kind_artifact_and_proof_log_share_struct` | Two pointers with `kind = 2` and `kind = 3`; `space.version = 2`. |
| `tests/gateway/service/spaces.test.ts` | `createSpace writes SQLite row on Sui success` | After Move stub returns success, `spaces` table has one row. |
| | `createSpace returns SUI_TX_FAILED on Move rejection` | Move stub rejects → service throws `GatewayError('SUI_TX_FAILED')`. |
| | `listSpaces filters by owner` | Only rows with `owner = X` returned. |
| `tests/gateway/service/memories.test.ts` | `writeMemory writes Walrus before Sui before SQLite` | Mocked clients are called in this exact order. |
| | `writeMemory returns WALRUS_WRITE_FAILED if Walrus throws` | No Sui call attempted; no SQLite write. |
| | `writeMemory returns SUI_TX_FAILED if Sui throws after Walrus` | Logs `orphan_blob_id`; no SQLite write. |
| | `writeMemory rejects when policy forbids write` | Throws `FORBIDDEN`; no Walrus call. |
| | `listMemories reads from SQLite only` | No Walrus call; uses index. |
| | `searchMemories does substring match on text fetched from Walrus` | At most N Walrus GETs; matches case-insensitive. |
| `tests/gateway/service/policy.test.ts` | `share upserts policy_cache` | Single row per `(space_id, subject)`. |
| | `revoke flips revoked=1 in cache` | Subsequent `getPolicy` returns `revoked: true` without chain read. |
| | `getPolicy falls back to chain on cache miss` | Reads `AccessPolicy` on-chain; populates cache. |
| `tests/gateway/routes/spaces.routes.test.ts` | `POST /v1/spaces returns 201 with object id` | Service stub called; response body matches `AgentSpace`. |
| | `POST /v1/spaces returns 401 on missing signature` | No service call. |
| | `POST /v1/spaces returns 400 on empty name` | No service call. |
| | `GET /v1/spaces requires owner query param` | Returns 400 if missing. |
| `tests/gateway/routes/memories.routes.test.ts` | `POST /v1/spaces/:id/memories returns 201` | Service called with `kind=payload`; `201 MemoryRecord`. |
| | `POST returns 403 when policy denies` | Service throws `FORBIDDEN`; route returns 403. |
| | `POST returns 500 WALRUS_WRITE_FAILED` | Service throws; route returns 500 with that code. |
| `tests/gateway/routes/policy.routes.test.ts` | `POST /v1/spaces/:id/share returns 201` | Service called; response shape matches. |
| | `POST /v1/spaces/:id/revoke returns 200 with revoked: true` | Service flips cache; route reflects it. |
| | `POST revoke returns 409 on already revoked` | Service throws `CONFLICT`; route returns 409. |
| `tests/gateway/mcp/tools.test.ts` | `memory.write tool calls service.memories.writeMemory` | Same args, same return. |
| | `context.load tool calls service.context.loadContext` | Default `maxItems = 50`. |
| | `policy.share tool rejects invalid subject format` | Returns MCP error. |
| `tests/gateway/e2e/mvp-flow.test.ts` | `runs full 7-step MVP flow against testnet` | All 7 steps return expected responses; final dashboard fetch returns 200. |
| `playwright/dashboard.spec.ts` | `/ renders spaces list with seed data` | At least 1 `SpaceCard` visible. |
| | `/spaces/[id] renders 4 panels` | All 4 panels mounted. |

---

## 13. Risk register

| # | Risk | Code-shape mitigation |
|---|------|-----------------------|
| 1 | Walrus write succeeds but Sui Move call fails | `lib/service/*.ts` writes Walrus first; on Sui failure logs `{ orphan_blob_id, payload_size }` and returns `SUI_TX_FAILED`. Blob stays in Walrus (immutable); the next migration may add a janitor. |
| 2 | Off-chain `policy_cache` drifts from on-chain `AccessPolicy` | `revoke` always invalidates the cache; `getPolicy` always falls back to chain on miss. |
| 3 | MCP and REST diverge | Both call the same `lib/service/*`; ESLint `no-restricted-imports` blocks `@mysten/sui` and the Walrus client outside `lib/service/*` and `lib/sui.ts`/`lib/walrus.ts`. |
| 4 | Dashboard UI time crunch | 4 panels only, no animations, no SSR streaming; the dashboard text is the README interface table. |
| 5 | Walrus testnet unavailable | `lib/walrus.ts` exposes a `WalrusPublisher` interface with a `MemoryWalrusPublisher` test double; swap at the factory in `lib/config.ts`. |
| 6 | Wallet signature format variations | Only `@mysten/sui`'s `verifyPersonalMessage` over the canonical `"<METHOD>\n<PATH>\n<BODY_SHA256_HEX>"` string is accepted; anything else returns `400 BAD_REQUEST`. |
| 7 | SQLite write after Sui success fails | The Sui tx has already happened; we log and retry once; if still failing, the next read from a different process repopulates from chain events. |
| 8 | `active_memory_root` and pointer out of sync | `add_memory_pointer` is a single Move entry that updates both in one transaction; no separate "update root" call exists. |
| 9 | Memory payload size blow-up | zod caps at 1 MB for memories, 10 MB for artifacts; route returns `400` before Walrus is touched. |
| 10 | Multi-agent race on the same space | Move's `&mut AgentSpace` is single-writer per transaction; simultaneous `add_memory_pointer` calls serialize on the chain. The chain is the rate limiter. |

---

## 14. Non-goals (re-stated from `DESIGN.md`)

Do **not** add any of these, even if the demo asks nicely:

- Full SolEdge worker runtime.
- Decentralized edge node network.
- Payment rail / x402 billing.
- General-purpose vector database.
- DeepBook integration.

Anything in this list is post-hackathon work.

---

## 15. How to use this file

1. **Before each day**, read that day's section in full.
2. **Create the listed files first**, in the order they appear.
3. **Run the listed commands** verbatim.
4. **Run the acceptance test** and only mark the day done when the expected output matches.
5. If a step blocks, the **Risk register** section is the first place to look.
6. If you must deviate from this plan, **edit this file in the same commit** so the plan stays the source of truth.

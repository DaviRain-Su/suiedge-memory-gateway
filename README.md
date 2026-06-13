# SuiEdge Memory Gateway

Wallet-owned memory and artifact gateway for AI agents, powered by Walrus and anchored by Sui objects.

## Positioning

SuiEdge Memory Gateway is not a replacement for Walrus or MemWal. Walrus/MemWal are the durable data and memory backends. SuiEdge is the control plane and gateway that makes agent memory usable across tools:

- Sui objects anchor ownership, access policy, active version, and revocation.
- Walrus stores memory, artifacts, and execution logs.
- The gateway exposes REST and MCP interfaces so agent frameworks can read/write memory without knowing Walrus/Sui internals.
- The dashboard lets users inspect memory timelines, artifacts, proof logs, and sharing policy.

## Hackathon track

Primary track: Walrus.

Secondary narrative: Agentic Web.

Why Walrus: the product demonstrates persistent, portable, verifiable memory and artifacts for long-running AI agents.

## MVP flow

1. User connects a Sui wallet and creates an `AgentSpace`.
2. Gateway writes a memory or artifact to Walrus.
3. Sui Move object stores the active Walrus blob pointer, version, owner, and access policy.
4. Agent restores context through `GET /v1/spaces/:id/context`.
5. Another authorized agent can continue from the same context.
6. User revokes access; further reads/writes fail.

## Core concepts

- `AgentSpace`: wallet-owned workspace for one project or agent team.
- `MemoryPointer`: versioned pointer to Walrus-stored memory.
- `ArtifactPointer`: versioned pointer to Walrus-stored files or generated outputs.
- `ProofLog`: execution trace hash and Walrus blob pointer.
- `AccessPolicy`: read/write/share/revoke rules enforced by the gateway and anchored by Sui.

## Interfaces

REST:

```http
POST /v1/spaces
POST /v1/spaces/:id/memories
GET  /v1/spaces/:id/context
POST /v1/spaces/:id/artifacts
POST /v1/spaces/:id/proof-logs
POST /v1/spaces/:id/revoke
```

MCP tools:

```text
memory.write
memory.search
context.load
artifact.save
trace.log
policy.share
policy.revoke
```

## Six-day build plan

- Day 1: Sui Move package skeleton, Next.js app, wallet connect, API shape.
- Day 2: Walrus write/read integration, `AgentSpace` create flow.
- Day 3: Memory timeline, active context restore, version pointers.
- Day 4: Access policy, share/revoke, multi-agent demo.
- Day 5: ProofLog, artifact upload, dashboard polish.
- Day 6: deploy, README, submission text, five-minute demo video.

---

[Chinese version](./README.zh.md)

# MVP Scope

Purpose: define the smallest Sui Overflow submission that proves SuiEdge Memory Gateway is useful beyond a generic memory SDK.

## Product claim

AI agents need memory that is owned by the user, portable across tools, shareable across agents, and auditable after execution. Walrus provides durable data. SuiEdge provides the gateway, policy layer, and product workflow.

## In scope

- Create `AgentSpace` with Sui wallet ownership.
- Store memory blobs on Walrus.
- Store Sui object pointers for active memory version.
- Load context through a gateway endpoint.
- Store artifact pointers and execution proof logs.
- Share/revoke access for another agent identity.
- Dashboard showing space, memory timeline, artifacts, logs, and Sui/Walrus links.

## Out of scope

- Full SolEdge worker runtime.
- Decentralized edge node network.
- Payment rail or x402 billing.
- General vector database.
- DeepBook integration.

## Demo script

1. Connect wallet.
2. Create `AgentSpace` for a Sui Overflow project.
3. Research agent writes project context to Walrus.
4. Builder agent loads context and writes an artifact.
5. Reviewer agent writes a `ProofLog`.
6. Owner revokes reviewer access.
7. Dashboard shows Walrus blob IDs, Sui object IDs, versions, and policy state.

---

[Chinese version](./MVP.zh.md)

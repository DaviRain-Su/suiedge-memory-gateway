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

---

[Chinese version](./SUBMISSION.zh.md)

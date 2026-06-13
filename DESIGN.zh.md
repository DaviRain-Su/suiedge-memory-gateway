# SuiEdge Memory Gateway — 设计文档

> 仓库设计与实现的唯一事实来源。`README.md`、`docs/MVP.md`、`docs/SUBMISSION.md`、`move/README.md` 规定了**做什么**；本文规定**怎么做**。

## 1. 架构总览

三层 + 一个控制面：

```
┌──────────────────────────────────────────────────────────┐
│                  Agent frameworks (LLM / SDK)            │
│         call:  REST  /v1/...   or   MCP  memory.* 等     │
└────────────────────┬─────────────────────────────────────┘
                     │  HTTP / JSON-RPC
┌────────────────────▼─────────────────────────────────────┐
│            Next.js Gateway  (control plane)              │
│  - 鉴权：Sui 钱包签名                                     │
│  - 策略：读 AccessPolicy，执行 read/write/revoke 校验     │
│  - 编排：Walrus IO + Sui 交易 + 上下文拼装                │
│  - 链外索引：SQLite 用于列表与搜索                        │
└──────┬───────────────────────────────────────────┬───────┘
       │  tx / read                                │  PUT / GET
┌──────▼───────┐                          ┌────────▼───────┐
│   Sui Move   │                          │    Walrus      │
│  AgentSpace  │  所有权、策略、          │  blob storage  │
│  MemoryPtr   │  活跃版本、              │  (memory,      │
│  ArtifactPtr │  撤销锚定                │   artifact,    │
│  ProofLog    │                          │   proof log)   │
│  AccessPolicy│                          │                │
└──────────────┘                          └────────────────┘
```

### 不可破坏的不变量

- **Walrus 存字节，Sui 存真相。** 任何内容都不上 Sui；Sui 只存指针、哈希、版本和策略。
- **唯一控制面。** 只有 Next.js Gateway 知道 Walrus blob ID 和 Sui object ID 的映射；客户端永远不直接接触两者。
- **版本单调递增。** 同一 space 内 `version` 严格递增，由 gateway 分配；Sui object ID 随之增长。
- **撤销在本 MVP 中是终态。** `AccessPolicy.revoked = true` 后不可恢复；调用方需新建一个策略。

## 2. 模块 / 目录结构

```
.
├── move/                                # Sui Move 包
│   ├── sources/
│   │   ├── agent_space.move             # AgentSpace + create_space
│   │   ├── memory_pointer.move          # MemoryPointer、ArtifactPointer、ProofLog
│   │   └── access_policy.move           # AccessPolicy + share / revoke
│   ├── Move.toml
│   └── README.md
├── src/
│   ├── app/                             # Next.js App Router
│   │   ├── layout.tsx                   # dapp-kit provider
│   │   ├── page.tsx                     # / dashboard：spaces 列表 + 创建
│   │   ├── spaces/[id]/page.tsx         # space 详情
│   │   └── api/v1/
│   │       ├── spaces/route.ts
│   │       ├── spaces/[id]/share/route.ts
│   │       ├── spaces/[id]/memories/route.ts
│   │       ├── spaces/[id]/context/route.ts
│   │       ├── spaces/[id]/artifacts/route.ts
│   │       ├── spaces/[id]/proof-logs/route.ts
│   │       └── spaces/[id]/revoke/route.ts
│   ├── mcp/                             # MCP server（独立进程）
│   │   ├── server.ts
│   │   └── tools/
│   │       ├── space.ts                 # space.create
│   │       ├── memory.ts                # memory.write / memory.search
│   │       ├── context.ts               # context.load
│   │       ├── artifact.ts              # artifact.save
│   │       ├── trace.ts                 # trace.log
│   │       └── policy.ts                # policy.share / policy.revoke
│   ├── lib/
│   │   ├── types.ts                     # 已有的共享类型
│   │   ├── sui.ts                       # dapp-kit + Move 调用封装
│   │   ├── walrus.ts                    # publisher/aggregator 封装
│   │   ├── policy.ts                    # AccessPolicy 读取 + 缓存 + 撤销
│   │   ├── context.ts                   # 活跃上下文拼装
│   │   ├── store.ts                     # SQLite（better-sqlite3）索引
│   │   ├── auth.ts                      # 钱包签名验证
│   │   └── service/                     # REST 和 MCP 共用
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
├── DESIGN.md                            # 英文版（本仓库还有中文版）
├── DESIGN.zh.md                         # 本文件
└── README.md
```

### 为什么是这个形状

- **Move 每个对象一个 module。** 让评审者能读最小单元。
- **MCP 是独立进程。** stdio MCP server 引入与 REST 路由完全相同的 `lib/service/*`，保证一份业务逻辑、一份存储。
- **Service 层是接缝。** REST 和 MCP 都调用 `src/lib/service/*`；路由 handler 和 MCP tool 定义都只是薄适配层。
- **组件是无脑的。** Dashboard 组件只负责渲染；它们通过 server actions 或 route handler 调用 `lib/service/*`，不直接接触 Walrus/Sui。

## 3. 数据模型

### 链上（Move）

```move
public struct AgentSpace has key {
    id: UID,
    owner: address,
    name: String,
    active_memory_root: vector<u8>,   // 最新 MemoryPointer id（digest）
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

`ArtifactPointer` 和 `ProofLog` 在链上复用 `MemoryPointer`，靠 `kind` 字段区分。在 API 层为清晰起见分别暴露，但共享同一链上结构。

### 链外（SQLite via `better-sqlite3`）

Gateway 维护一个索引以支持快速列表和搜索。Sui 仍是真相源；索引可从链上状态重建。

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

三个 key 前缀（共用一个 bucket，按前缀划分命名空间）：

```
memories/{spaceId}/{version}      -> JSON 或任意字节
artifacts/{spaceId}/{version}     -> 字节
proof-logs/{spaceId}/{runId}      -> JSON
```

Blob 不可变。版本号由 gateway 的单调计数器分配；链上 `MemoryPointer.version` 与路径段一致。

## 4. 关键流程

### 4.1 创建 space

1. 客户端用已连接钱包对 `POST /v1/spaces { name }` 签名。
2. Gateway 验证签名 → 调 `create_space(name)`。
3. Move 铸造 `AgentSpace` 并转移给调用者。
4. Gateway 写入 `spaces` 表，返回 `{ id, owner, version: 0 }`。

### 4.2 写 memory / artifact / proof log

1. 客户端 → `POST /v1/spaces/:id/memories { kind, payload }`。
2. Gateway：拉取调用者对应的 `AccessPolicy`；若 `revoked || !can_write` 直接拒绝。
3. 序列化 payload，PUT 到 Walrus publisher → 拿 `blobId`。
4. 计算 `contentHash`（payload 的 sha256）。
5. `space.version` 自增；调 `add_memory_pointer(space, blobId, hash, version)`。
6. 更新 `AgentSpace.active_memory_root = pointerDigest`。
7. 写入 `blobs` 表；返回 `MemoryRecord`。

### 4.3 加载 context

1. 客户端 → `GET /v1/spaces/:id/context`。
2. Gateway：校验调用者有读权限。
3. 读 `AgentSpace.active_memory_root`；缺失则返回空 context。
4. 通过 `blobs` 索引倒序回溯最近 N 条 `MemoryPointer`（N 上限例如 50）。
5. 从 Walrus aggregator 拉每个 blob；按 version 升序组装 `{ kind, content, version, hash }`。
6. 返回 `ContextBundle`。

### 4.4 共享 / 撤销

- **share**：gateway 调 `share(space, subject, flags)`；成功后在 `policy_cache` 中 upsert。对 `(space_id, subject)` 幂等。
- **revoke**：gateway 调 `revoke(policy)`；在 `policy_cache` 中将 `revoked = true`；同时让缓存条目失效，下次读取强制回链上拉取。

## 5. API 契约

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

所有请求由 Sui 钱包签名。签名放在 `X-Sui-Signature` header，地址在 `X-Sui-Address`。`zod` 在路由边界校验所有 body。

### MCP 工具

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

两套接口都调用同样的 `lib/service/*` 函数。路由 handler 和 MCP tool 定义里都不放业务逻辑。

## 6. 实现阶段（6 天时间盒）

| Day | 范围 | 完成标准 |
|-----|------|----------|
| 1 | Move 3 module、Next.js 骨架、钱包连接、REST 路由 stub、MCP server 骨架 | `next dev` 起来；`curl` POST 返回 JSON；MCP `space.create` 返回 stub |
| 2 | Walrus publisher/aggregator 封装、`create_space` 真链路、testnet 上 Sui 交易 | 钱包创建 space 后对象在 Sui 浏览器可见 |
| 3 | `memory.write` + `context.load`、version 自增、timeline UI panel | A 写入、B 读出相同 context |
| 4 | `AccessPolicy`、`share` / `revoke`、多 agent 演示 | revoke 后 B 再次读返回 401 |
| 5 | `artifact.save`、`trace.log`、完整 dashboard 含 4 个 panel | timeline + artifacts + logs + policy 全部渲染 |
| 6 | 部署、截图、demo 视频、README 打磨 | `docs/MVP.md` 7 步演示端到端跑通 |

## 7. 测试

- **Move**（`sui move test`）：非 owner 不可 `add_memory_pointer`；被撤销的策略不可再 share；version 单调。
- **Gateway 单元**（vitest）：每个 `lib/service/*` 与 `lib/policy.ts`，mock 掉 Sui 和 Walrus 客户端。
- **Gateway e2e**（vitest + supertest，跑真 testnet）：每个 REST 路由一条 happy path，外加 MVP 7 步流程。
- **MCP**：每个 tool 的 schema 校验，加一条通过 stdio 跑 server 的集成测试。
- **Dashboard smoke**（Playwright headless）：`/` 与 `/spaces/[id]` 用种子数据渲染。
- **Demo 演练**：用 `docs/MVP.md` 脚本在全新钱包下跑一遍并录 5 分钟视频。

## 8. 风险与决策

| 风险 | 决策 |
|------|------|
| Walrus 写入成功但 Sui 交易失败 | 永远先写 Walrus；若 Move 调用失败，记录孤儿 blob id 后继续（Walrus 不可变） |
| 链外缓存与链上策略漂移 | revoke 必清缓存；读 miss 总是回链上拉一次 |
| MCP 和 REST 行为分叉 | 通过共用 `lib/service/*` 强制；用 lint 规则 + import 图校验 |
| Dashboard UI 时间不够 | 只做 4 个 panel；不做动画；把 README 接口表当 UI 文本来源 |
| Walrus testnet 不可用 | `WalrusPublisher` 接口 + `MemoryWalrusPublisher` 测试替身；通过工厂切换 |
| 钱包签名格式差异 | 一律用 `@mysten/sui` 的 `verifyPersonalMessage`；其他格式一律 400 |

## 9. 非目标（重申以防误解）

取自 `docs/MVP.md`「不在范围」——**不要**为了讨好评审而扩入：

- 完整 SolEdge worker 运行时。
- 去中心化边缘节点网络。
- 支付通道 / x402 计费。
- 通用向量数据库。
- DeepBook 集成。

以上任何一项都是后续工作，不是 Day-N 任务。

---

[English Version](./DESIGN.md)

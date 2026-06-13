# SuiEdge Memory Gateway

一个钱包所有的 AI Agent 记忆与工件网关，数据持久化在 Walrus，所有权与策略锚定在 Sui 对象上。

## 定位

SuiEdge Memory Gateway 不是要取代 Walrus 或 MemWal。Walrus / MemWal 是 durable 数据层与记忆后端，SuiEdge 是控制平面和网关，让 Agent 记忆可以跨工具使用：

- Sui 对象锚定所有权、访问策略、活跃版本与撤销。
- Walrus 存储记忆、工件与执行日志。
- 网关暴露 REST 与 MCP 接口，Agent 框架无需了解 Walrus / Sui 底层即可读写记忆。
- Dashboard 让用户查看记忆时间线、工件、证明日志与共享策略。

## 参赛赛道

主赛道：Walrus。

副叙事：Agentic Web。

选择 Walrus 的原因：产品展示了面向长运行 AI Agent 的持久化、可携带、可验证的记忆与工件。

## MVP 流程

1. 用户连接 Sui 钱包并创建 `AgentSpace`。
2. Gateway 将记忆或工件写入 Walrus。
3. Sui Move 对象存储活跃的 Walrus blob 指针、版本、所有者与访问策略。
4. Agent 通过 `GET /v1/spaces/:id/context` 恢复上下文。
5. 另一个被授权 Agent 可基于同一上下文继续工作。
6. 用户撤销访问权限，后续读写失败。

## 核心概念

- `AgentSpace`：钱包拥有的工作区，对应一个项目或 Agent 团队。
- `MemoryPointer`：指向 Walrus 存储记忆的版本化指针。
- `ArtifactPointer`：指向 Walrus 存储文件或生成输出的版本化指针。
- `ProofLog`：执行轨迹哈希与 Walrus blob 指针。
- `AccessPolicy`：网关执行、Sui 锚定的读/写/共享/撤销规则。

## 接口

REST：

```http
POST /v1/spaces
POST /v1/spaces/:id/memories
GET  /v1/spaces/:id/context
POST /v1/spaces/:id/artifacts
POST /v1/spaces/:id/proof-logs
POST /v1/spaces/:id/revoke
```

MCP 工具：

```text
memory.write
memory.search
context.load
artifact.save
trace.log
policy.share
policy.revoke
```

## 六天构建计划

- 第 1 天：Sui Move 包骨架、Next.js 应用、钱包连接、API 形态。
- 第 2 天：Walrus 读写集成、`AgentSpace` 创建流程。
- 第 3 天：记忆时间线、活跃上下文恢复、版本指针。
- 第 4 天：访问策略、共享/撤销、多 Agent 演示。
- 第 5 天：ProofLog、工件上传、Dashboard 打磨。
- 第 6 天：部署、README、提交文案、五分钟演示视频。

## 快速链接

- **GitHub 仓库**：https://github.com/DaviRain-Su/suiedge-memory-gateway
- **一键部署**：https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2FDaviRain-Su%2Fsuiedge-memory-gateway
- **部署指南**：[DEPLOY.md](./DEPLOY.md)
- **Demo 视频脚本**：[docs/STORYBOARD.md](./docs/STORYBOARD.md)、[docs/RECORDING.md](./docs/RECORDING.md)
- **提交文案**：[docs/SUBMISSION.md](./docs/SUBMISSION.md)

## 本地运行

```bash
pnpm install
sui move test                    # 7 Move tests
pnpm exec tsc --noEmit           # typecheck
pnpm test                        # 36 vitest tests
pnpm dev                         # http://localhost:3000
```

## 架构

三层：Agent 框架（LLM / SDK）调用 Next.js 网关；网关调用 Sui Move（`agent_space`、`memory_pointer`、`access_policy`）和 Walrus（HTTP PUT/GET）；链下 SQLite 索引维护 blob-id ↔ object-id 映射以加速读取。网关是唯一同时了解 Move 与 Walrus 的组件。详见 [DESIGN.md](./DESIGN.md) 与 [DESIGN.detailed.md](./DESIGN.detailed.md)。

## 上线（testnet）

```bash
# 1) 拿 testnet SUI
sui client new-address ed25519 testnet
sui client switch --address <alias>
sui client faucet

# 2) 发布 Move 包，抓 package id
pnpm run publish:testnet
set -a && . .env.testnet && set +a

# 3) 用 live 模式启动 dev 服务器
SUI_CLIENT_LIVE=1 pnpm dev
```

Live 模式与离线模式的不同：

- `LiveSuiClient` 替代 `MockSuiClient`，通过 `SuiGrpcClient` 提交真 PTB（testnet），用 `SUI_PRIVATE_KEY` 加载的 `EnvKeypairSigner` 签名。
- `HttpWalrusPublisher` 写入 Walrus testnet public publisher、从 public aggregator 读取，默认 URL 已在 `src/lib/config.ts`。
- `requireAuth` 对每个请求调用 `verifyPersonalMessageSignature`；`AUTH_STUB_PASS=1` 跳过校验用于离线演示。
- 部署者 keypair 持有 `AgentSpace`。真实产品里由用户钱包签名、网关转发 PTB；MVP 的折中方案写在 `DESIGN.detailed.md` §14。

### 上线验证（构建期间已跑过）

```text
已发布的 Move 包 id：0xf4bf00ae02a356233837c7f96820b5ba0c3f646af7d4eb495589996febf50d53
Walrus testnet 往返：PUT → blobId u_pRa6Ur-kUbguw6nJMmncIy47e8BpKC-gi51MinjhE → GET 字节完全一致
Sui testnet createSpace PTB：digest 93Z6uizbPrKwE7z82iwRjUULAcB9WXJTQ7YEWwpoQ99n
scripts/demo.sh 跑真服务器：7/7 步通过，~30 秒
tests/gateway/live/testnet.test.ts：2/2 通过
tests/gateway/e2e/mvp.test.ts：1/1 通过
pnpm test（离线套件）：36/36 通过
sui move test：7/7 通过
pnpm exec tsc --noEmit：clean
```

运行截图（来自 `scripts/screenshot.mjs`）：

![首页](./docs/screenshots/01-home.png)
![空间详情](./docs/screenshots/02-space-detail.png)
---

[English Version](./README.md)

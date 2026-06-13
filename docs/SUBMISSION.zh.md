# 提交文案草稿

## 项目名称

SuiEdge Memory Gateway

## 赛道

Walrus

## 一句话简介

一个钱包所有的 AI Agent 记忆与工件网关，由 Walrus 驱动并锚定在 Sui 对象上。

## 详细描述

SuiEdge Memory Gateway 让 AI Agent 跨会话和工具持久化、共享与审计长运行上下文。记忆、工件与执行日志存储在 Walrus。Sui 对象锚定所有权、活跃版本、访问策略与撤销。Agent 框架通过 REST 或 MCP 交互，无需直接处理 blob ID、策略检查或 Sui 对象更新。

## 为什么选择 Sui / Walrus

Walrus 为 Agent 记忆与工件提供 durable、可携带、可验证的数据。Sui 提供钱包拥有的对象、策略状态、版本指针与撤销。二者结合，让 Agent 记忆用户所有、可共享、可审计、可跨工具携带，而不是被锁定在单个应用中。

## 演示检查清单

- 使用 Sui 钱包创建 `AgentSpace`。
- 将记忆写入 Walrus。
- 将记忆指针锚定在 Sui 上。
- 在第二次 Agent 会话中恢复上下文。
- 保存生成的工件。
- 保存证明日志。
- 与另一个 Agent 身份共享访问权限。
- 撤销访问并展示读写被阻止。

## Live 验证（testnet）

完整 MVP 流程在构建期间已对 **Sui testnet** 与 **Walrus testnet** 实跑过，不是只本地 mock：

- **已发布的 Move 包 id**：`0xf4bf00ae02a356233837c7f96820b5ba0c3f646af7d4eb495589996febf50d53`
- **Walrus testnet 往返**：PUT smoke blob → blobId `u_pRa6Ur-kUbguw6nJMmncIy47e8BpKC-gi51MinjhE` → GET 字节完全一致
- **Sui testnet createSpace PTB**：digest `93Z6uizbPrKwE7z82iwRjUULAcB9WXJTQ7YEWwpoQ99n`（真的 `SuiGrpcClient.signAndExecuteTransaction`）
- **7 步 e2e demo**（`scripts/demo.sh`）：createSpace → write memory → context load → share policy → list spaces → write artifact → write proof log。全部 7 步对真 testnet 返回 HTTP 201/200，总耗时 ~30 秒。
- **Live vitest**（`pnpm test:live`）：2/2 通过，针对真 Sui + Walrus
- **离线 vitest**（`pnpm test`）：36/36 通过（用 `MockSuiClient` + `MemoryWalrusPublisher`）
- **Move 单元测试**（`sui move test`）：7/7 通过
- **TypeScript**（`pnpm exec tsc --noEmit`）：clean

复现命令：

```bash
pnpm run publish:testnet    # 把真 package id 写入 .env.testnet
set -a && . .env.testnet && set +a
export SUI_CLIENT_LIVE=1 AUTH_STUB_PASS=1 SUI_PRIVATE_KEY=...
pnpm dev -p 3000 &
SUI_OWNER=0x... ./scripts/demo.sh
pnpm test:live
```

Dashboard 截图（live 数据）：

![首页](./screenshots/01-home.png)
![空间详情](./screenshots/02-space-detail.png)

---

[English Version](./SUBMISSION.md)

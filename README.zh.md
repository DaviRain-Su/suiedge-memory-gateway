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

---

[English Version](./README.md)

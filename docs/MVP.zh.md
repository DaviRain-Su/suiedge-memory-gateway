# MVP 范围

目的：定义最小的 Sui Overflow 参赛作品，证明 SuiEdge Memory Gateway 不止是一个通用记忆 SDK。

## 产品主张

AI Agent 需要用户所有、跨工具可携带、可跨 Agent 共享、执行后可审计的记忆。Walrus 提供 durable 数据，SuiEdge 提供网关、策略层与产品工作流。

## 在范围内

- 使用 Sui 钱包创建 `AgentSpace` 并拥有它。
- 将记忆 blob 存储在 Walrus。
- 将活跃记忆版本的指针存储为 Sui 对象。
- 通过网关端点加载上下文。
- 存储工件指针与执行证明日志。
- 向另一个 Agent 身份共享/撤销访问权限。
- Dashboard 展示 space、记忆时间线、工件、日志与 Sui/Walrus 链接。

## 不在范围内

- 完整的 SolEdge worker 运行时。
- 去中心化边缘节点网络。
- 支付通道或 x402 计费。
- 通用向量数据库。
- DeepBook 集成。

## 演示脚本

1. 连接钱包。
2. 为一个 Sui Overflow 项目创建 `AgentSpace`。
3. 研究 Agent 将项目上下文写入 Walrus。
4. 构建 Agent 加载上下文并写入工件。
5. 审核 Agent 写入 `ProofLog`。
6. 所有者撤销审核者访问权限。
7. Dashboard 展示 Walrus blob ID、Sui 对象 ID、版本与策略状态。

---

[English Version](./MVP.md)

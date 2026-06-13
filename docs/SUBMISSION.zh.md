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

---

[English Version](./SUBMISSION.md)

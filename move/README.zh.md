# Move 包草图

目的：将黑客松的 Move 范围控制在最小：所有权锚定、版本指针与撤销放在 Sui；记忆/工件字节存储在 Walrus。

## 对象

```move
public struct AgentSpace has key {
    id: UID,
    owner: address,
    name: String,
    active_memory_root: vector<u8>,
    policy_version: u64,
    version: u64,
}

public struct MemoryPointer has key, store {
    id: UID,
    space_id: ID,
    walrus_blob_id: vector<u8>,
    content_hash: vector<u8>,
    version: u64,
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

## 入口函数

- `create_space(name)`
- `add_memory_pointer(space, walrus_blob_id, content_hash)`
- `share(space, subject, can_read, can_write, can_share)`
- `revoke(policy)`

## 规则

记忆内容不存储在 Sui 上。只有指针、哈希、所有权、策略与版本存储在链上。

---

[English Version](./README.md)

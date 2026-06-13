# Move package sketch

Purpose: keep the hackathon Move scope small: anchor ownership, version pointers, and revocation on Sui; store memory/artifact bytes on Walrus.

## Objects

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

## Entry functions

- `create_space(name)`
- `add_memory_pointer(space, walrus_blob_id, content_hash)`
- `share(space, subject, can_read, can_write, can_share)`
- `revoke(policy)`

## Rule

No memory content is stored on Sui. Only pointers, hashes, ownership, policy, and versions are stored on-chain.

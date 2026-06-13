module suiedge::memory_pointer;

use std::vector;
use sui::event;
use sui::hash;
use sui::object;
use sui::transfer;
use sui::tx_context::TxContext;
use suiedge::agent_space::{Self, AgentSpace};

const E_BLOB_ID_EMPTY: u64 = 11;
const E_INVALID_KIND: u64 = 12;

const KIND_MEMORY: u8 = 1;
const KIND_ARTIFACT: u8 = 2;
const KIND_PROOF_LOG: u8 = 3;

public struct MemoryPointer has key, store {
    id: object::UID,
    space_id: object::ID,
    kind: u8,
    walrus_blob_id: vector<u8>,
    content_hash: vector<u8>,
    version: u64,
    created_at: u64,
}

public struct MemoryPointerAdded has copy, drop {
    pointer_id: object::ID,
    space_id: object::ID,
    kind: u8,
    walrus_blob_id: vector<u8>,
    version: u64,
}

public fun kind(p: &MemoryPointer): u8 { p.kind }
public fun pointer_space_id(p: &MemoryPointer): object::ID { p.space_id }
public fun walrus_blob_id(p: &MemoryPointer): &vector<u8> { &p.walrus_blob_id }
public fun content_hash(p: &MemoryPointer): &vector<u8> { &p.content_hash }
public fun pointer_version(p: &MemoryPointer): u64 { p.version }
public fun pointer_id(p: &MemoryPointer): object::ID { object::uid_to_inner(&p.id) }

public fun kind_memory(): u8 { KIND_MEMORY }
public fun kind_artifact(): u8 { KIND_ARTIFACT }
public fun kind_proof_log(): u8 { KIND_PROOF_LOG }

public fun add_memory_pointer(
    space: &mut AgentSpace,
    kind: u8,
    walrus_blob_id: vector<u8>,
    content_hash_bytes: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(vector::length(&walrus_blob_id) > 0, E_BLOB_ID_EMPTY);
    assert!(
        kind == KIND_MEMORY || kind == KIND_ARTIFACT || kind == KIND_PROOF_LOG,
        E_INVALID_KIND,
    );

    let pointer_uid = object::new(ctx);
    let pointer_id = object::uid_to_inner(&pointer_uid);
    let space_id = object::id(space);
    let new_version = agent_space::version(space) + 1;

    let p = MemoryPointer {
        id: pointer_uid,
        space_id,
        kind,
        walrus_blob_id,
        content_hash: content_hash_bytes,
        version: new_version,
        created_at: tx_context::epoch_timestamp_ms(ctx),
    };

    let digest = hash::keccak256(&p.content_hash);
    agent_space::bump_after_pointer(space, digest, tx_context::sender(ctx));

    event::emit(MemoryPointerAdded {
        pointer_id,
        space_id,
        kind,
        walrus_blob_id: p.walrus_blob_id,
        version: new_version,
    });

    transfer::transfer(p, agent_space::owner(space));
}

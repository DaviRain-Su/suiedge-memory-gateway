module suiedge::agent_space;

use std::string::String;
use sui::event;
use sui::object;
use sui::transfer;
use sui::tx_context::TxContext;

const E_NOT_OWNER: u64 = 1;
const E_INVALID_NAME: u64 = 2;

public struct AgentSpace has key, store {
    id: object::UID,
    owner: address,
    name: String,
    active_memory_root: vector<u8>,
    policy_version: u64,
    version: u64,
}

public struct AgentSpaceCreated has copy, drop {
    space_id: object::ID,
    owner: address,
    name: String,
    version: u64,
}

public fun owner(s: &AgentSpace): address { s.owner }
public fun name(s: &AgentSpace): &String { &s.name }
public fun version(s: &AgentSpace): u64 { s.version }
public fun active_memory_root(s: &AgentSpace): &vector<u8> { &s.active_memory_root }
public fun policy_version(s: &AgentSpace): u64 { s.policy_version }

#[test_only]
public fun new_for_test(
    name: String,
    active_memory_root: vector<u8>,
    policy_version: u64,
    version: u64,
    owner: address,
    ctx: &mut TxContext,
): AgentSpace {
    AgentSpace {
        id: object::new(ctx),
        owner,
        name,
        active_memory_root,
        policy_version,
        version,
    }
}

public fun create_space(name: String, ctx: &mut TxContext) {
    assert!(std::string::length(&name) > 0 && std::string::length(&name) <= 64, E_INVALID_NAME);
    let owner = tx_context::sender(ctx);
    let uid = object::new(ctx);
    let space_id = object::uid_to_inner(&uid);
    let s = AgentSpace {
        id: uid,
        owner,
        name,
        active_memory_root: vector[],
        policy_version: 0,
        version: 0,
    };
    event::emit(AgentSpaceCreated { space_id, owner, name: s.name, version: 0 });
    transfer::transfer(s, owner);
}

public(package) fun bump_after_pointer(
    s: &mut AgentSpace,
    new_root: vector<u8>,
    caller: address,
) {
    assert!(s.owner == caller, E_NOT_OWNER);
    s.active_memory_root = new_root;
    s.version = s.version + 1;
}

public(package) fun bump_policy_version(s: &mut AgentSpace, caller: address) {
    assert!(s.owner == caller, E_NOT_OWNER);
    s.policy_version = s.policy_version + 1;
}

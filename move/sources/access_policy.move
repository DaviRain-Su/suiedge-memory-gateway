module suiedge::access_policy;

use sui::event;
use sui::object;
use sui::transfer;
use sui::tx_context::TxContext;
use suiedge::agent_space::{Self, AgentSpace};

const E_NOT_OWNER: u64 = 20;
const E_ALREADY_REVOKED: u64 = 21;

public struct AccessPolicy has key, store {
    id: object::UID,
    space_id: object::ID,
    subject: address,
    can_read: bool,
    can_write: bool,
    can_share: bool,
    revoked: bool,
}

public struct AccessPolicyCreated has copy, drop {
    policy_id: object::ID,
    space_id: object::ID,
    subject: address,
    can_read: bool,
    can_write: bool,
    can_share: bool,
}

public struct AccessPolicyRevoked has copy, drop {
    policy_id: object::ID,
    space_id: object::ID,
    subject: address,
}

public fun subject(p: &AccessPolicy): address { p.subject }
public fun can_read(p: &AccessPolicy): bool { p.can_read && !p.revoked }
public fun can_write(p: &AccessPolicy): bool { p.can_write && !p.revoked }
public fun can_share(p: &AccessPolicy): bool { p.can_share && !p.revoked }
public fun revoked(p: &AccessPolicy): bool { p.revoked }
public fun policy_space_id(p: &AccessPolicy): object::ID { p.space_id }
public fun policy_id(p: &AccessPolicy): object::ID { object::uid_to_inner(&p.id) }

#[test_only]
public fun new_for_test(
    space_id: object::ID,
    subject: address,
    can_read: bool,
    can_write: bool,
    can_share: bool,
    ctx: &mut TxContext,
): AccessPolicy {
    AccessPolicy {
        id: object::new(ctx),
        space_id,
        subject,
        can_read,
        can_write,
        can_share,
        revoked: false,
    }
}

public fun share(
    space: &mut AgentSpace,
    subject: address,
    can_read: bool,
    can_write: bool,
    can_share: bool,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == agent_space::owner(space), E_NOT_OWNER);
    let uid = object::new(ctx);
    let policy_id = object::uid_to_inner(&uid);
    let space_id = object::id(space);
    let p = AccessPolicy {
        id: uid,
        space_id,
        subject,
        can_read,
        can_write,
        can_share,
        revoked: false,
    };
    agent_space::bump_policy_version(space, tx_context::sender(ctx));
    event::emit(AccessPolicyCreated {
        policy_id,
        space_id,
        subject,
        can_read,
        can_write,
        can_share,
    });
    transfer::transfer(p, agent_space::owner(space));
}

public fun revoke(
    space: &mut AgentSpace,
    policy: &mut AccessPolicy,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == agent_space::owner(space), E_NOT_OWNER);
    assert!(!policy.revoked, E_ALREADY_REVOKED);
    policy.revoked = true;
    agent_space::bump_policy_version(space, tx_context::sender(ctx));
    event::emit(AccessPolicyRevoked {
        policy_id: object::id(policy),
        space_id: object::id(space),
        subject: policy.subject,
    });
}

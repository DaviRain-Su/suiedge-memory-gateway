#[test_only]
module suiedge::suiedge_tests;

use std::string;
use sui::test_scenario as ts;
use suiedge::access_policy;
use suiedge::agent_space;
use suiedge::memory_pointer;

const OWNER: address = @0xA;
const REVIEWER: address = @0xB;

#[test]
fun test_create_space_emits_event_and_assigns_owner() {
    let mut scen = ts::begin(OWNER);
    let name = string::utf8(b"demo-space");
    agent_space::create_space(name, ts::ctx(&mut scen));

    scen.next_tx(OWNER);
    let space = ts::take_from_sender<agent_space::AgentSpace>(&scen);
    assert!(agent_space::owner(&space) == OWNER, 0);
    assert!(agent_space::name(&space) == &name, 1);
    assert!(agent_space::version(&space) == 0, 2);
    assert!(agent_space::policy_version(&space) == 0, 3);
    assert!(agent_space::active_memory_root(&space).length() == 0, 4);
    ts::return_to_sender(&scen, space);
    ts::end(scen);
}

#[test]
fun test_add_memory_pointer_bumps_version_and_root() {
    let mut scen = ts::begin(OWNER);
    let name = string::utf8(b"demo-space");
    agent_space::create_space(name, ts::ctx(&mut scen));

    scen.next_tx(OWNER);
    let mut space = ts::take_from_sender<agent_space::AgentSpace>(&scen);
    let blob: vector<u8> = b"blob-1";
    let hash: vector<u8> = b"hash-1";
    memory_pointer::add_memory_pointer(
        &mut space,
        memory_pointer::kind_memory(),
        blob,
        hash,
        ts::ctx(&mut scen),
    );
    assert!(agent_space::version(&space) == 1, 10);
    assert!(agent_space::active_memory_root(&space).length() == 32, 11);
    ts::return_to_sender(&scen, space);
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = 11, location = suiedge::memory_pointer)]
fun test_add_memory_pointer_rejects_empty_blob_id() {
    let mut scen = ts::begin(OWNER);
    let name = string::utf8(b"demo-space");
    agent_space::create_space(name, ts::ctx(&mut scen));

    scen.next_tx(OWNER);
    let mut space = ts::take_from_sender<agent_space::AgentSpace>(&scen);
    let empty: vector<u8> = vector[];
    let hash: vector<u8> = b"hash-1";
    memory_pointer::add_memory_pointer(
        &mut space,
        memory_pointer::kind_memory(),
        empty,
        hash,
        ts::ctx(&mut scen),
    );
    ts::return_to_sender(&scen, space);
    ts::end(scen);
}

#[test]
fun test_revoke_blocks_subsequent_can_read() {
    let mut scen = ts::begin(OWNER);
    let name = string::utf8(b"demo-space");
    agent_space::create_space(name, ts::ctx(&mut scen));

    scen.next_tx(OWNER);
    let mut space = ts::take_from_sender<agent_space::AgentSpace>(&scen);
    access_policy::share(
        &mut space,
        REVIEWER,
        true,
        true,
        false,
        ts::ctx(&mut scen),
    );
    ts::return_to_sender(&scen, space);

    scen.next_tx(OWNER);
    let mut space2 = ts::take_from_sender<agent_space::AgentSpace>(&scen);
    let mut pol = ts::take_from_sender<access_policy::AccessPolicy>(&scen);
    assert!(access_policy::can_read(&pol), 20);
    assert!(!access_policy::revoked(&pol), 21);
    access_policy::revoke(&mut space2, &mut pol, ts::ctx(&mut scen));
    assert!(!access_policy::can_read(&pol), 22);
    assert!(access_policy::revoked(&pol), 23);
    assert!(agent_space::policy_version(&space2) == 2, 24);
    ts::return_to_sender(&scen, pol);
    ts::return_to_sender(&scen, space2);
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = 21, location = suiedge::access_policy)]
fun test_revoke_twice_aborts_with_already_revoked() {
    let mut scen = ts::begin(OWNER);
    let name = string::utf8(b"demo-space");
    agent_space::create_space(name, ts::ctx(&mut scen));

    scen.next_tx(OWNER);
    let mut space = ts::take_from_sender<agent_space::AgentSpace>(&scen);
    access_policy::share(
        &mut space,
        REVIEWER,
        true,
        true,
        false,
        ts::ctx(&mut scen),
    );
    ts::return_to_sender(&scen, space);

    scen.next_tx(OWNER);
    let mut space2 = ts::take_from_sender<agent_space::AgentSpace>(&scen);
    let mut pol = ts::take_from_sender<access_policy::AccessPolicy>(&scen);
    access_policy::revoke(&mut space2, &mut pol, ts::ctx(&mut scen));
    // Second revoke must abort
    access_policy::revoke(&mut space2, &mut pol, ts::ctx(&mut scen));
    ts::return_to_sender(&scen, pol);
    ts::return_to_sender(&scen, space2);
    ts::end(scen);
}

#[test]
fun test_kind_artifact_and_proof_log_share_struct() {
    let mut scen = ts::begin(OWNER);
    let name = string::utf8(b"demo-space");
    agent_space::create_space(name, ts::ctx(&mut scen));

    scen.next_tx(OWNER);
    let mut space = ts::take_from_sender<agent_space::AgentSpace>(&scen);
    memory_pointer::add_memory_pointer(
        &mut space,
        memory_pointer::kind_artifact(),
        b"blob-art",
        b"hash-art",
        ts::ctx(&mut scen),
    );
    memory_pointer::add_memory_pointer(
        &mut space,
        memory_pointer::kind_proof_log(),
        b"blob-pl",
        b"hash-pl",
        ts::ctx(&mut scen),
    );
    assert!(agent_space::version(&space) == 2, 30);
    ts::return_to_sender(&scen, space);

    scen.next_tx(OWNER);
    let p1 = ts::take_from_sender<memory_pointer::MemoryPointer>(&scen);
    let p2 = ts::take_from_sender<memory_pointer::MemoryPointer>(&scen);
    let kinds = if (memory_pointer::kind(&p1) == 2 && memory_pointer::kind(&p2) == 3) {
        true
    } else if (memory_pointer::kind(&p1) == 3 && memory_pointer::kind(&p2) == 2) {
        true
    } else {
        false
    };
    assert!(kinds, 31);
    ts::return_to_sender(&scen, p1);
    ts::return_to_sender(&scen, p2);
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = 20, location = suiedge::access_policy)]
fun test_non_owner_cannot_share_policy() {
    let mut scen = ts::begin(REVIEWER);
    let mut space = agent_space::new_for_test(
        string::utf8(b"synthetic"),
        vector[],
        0u64,
        0u64,
        OWNER,
        ts::ctx(&mut scen),
    );
    access_policy::share(
        &mut space,
        @0xC,
        true,
        true,
        false,
        ts::ctx(&mut scen),
    );
    ts::return_to_sender(&scen, space);
    ts::end(scen);
}

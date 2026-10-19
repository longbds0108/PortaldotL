// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DisputeRegistry} from "../src/DisputeRegistry.sol";
import {IDisputeRegistry} from "../src/interfaces/IDisputeRegistry.sol";

contract RegistryHarness is DisputeRegistry {
    constructor(address arbiter_) DisputeRegistry(arbiter_) {}

    function count() external view returns (uint256) {
        return _disputes.length;
    }

    function dispute(uint256 id) external view returns (Dispute memory) {
        return _open(id);
    }
}

contract DisputeRegistryTest is Test {
    RegistryHarness internal reg;
    address internal arbiter = makeAddr("arbiter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    bytes32 internal constant EVIDENCE = keccak256("evidence");
    bytes32 internal constant DECISION = keccak256("decision");

    IDisputeRegistry.TargetKind internal constant TENDER = IDisputeRegistry.TargetKind.Tender;
    IDisputeRegistry.TargetKind internal constant AUCTION = IDisputeRegistry.TargetKind.NftAuction;

    function setUp() public {
        reg = new RegistryHarness(arbiter);
    }

    function _open(address who, IDisputeRegistry.TargetKind kind, uint64 target) internal returns (uint256 id) {
        vm.prank(who);
        id = reg.openDispute(kind, target, 1, EVIDENCE);
    }

    // ───────────── storage layout (web/lib/disputes.ts) ─────────────

    uint256 internal constant DISPUTES_SLOT = 0;

    function test_storageLayoutMatchesApp() public {
        _open(alice, TENDER, 3);
        uint256 id = _open(bob, AUCTION, 7);
        vm.prank(arbiter);
        reg.setStatus(id, IDisputeRegistry.Status.UnderReview, 0);

        assertEq(uint256(vm.load(address(reg), bytes32(DISPUTES_SLOT))), 2);
        uint256 w = uint256(vm.load(address(reg), bytes32(uint256(keccak256(abi.encode(DISPUTES_SLOT))) + id)));
        IDisputeRegistry.Dispute memory d = reg.dispute(id);
        assertEq(address(uint160(w)), d.opener);
        assertEq(uint8(w >> 160), uint8(d.kind));
        assertEq(uint8(w >> 168), uint8(d.status));
        assertEq(uint8(w >> 176), d.reason);
        assertEq(uint64(w >> 184), d.targetId);
        assertEq(d.opener, bob);
        assertEq(uint8(d.kind), uint8(AUCTION));
        assertEq(uint8(d.status), uint8(IDisputeRegistry.Status.UnderReview));
        assertEq(d.targetId, 7);
    }

    // ───────────── open ─────────────

    function test_open_storesAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit IDisputeRegistry.DisputeOpened(0, alice, (uint256(1) << 64) | 42, 3, EVIDENCE);
        vm.prank(alice);
        uint256 id = reg.openDispute(AUCTION, 42, 3, EVIDENCE);
        assertEq(id, 0);
        IDisputeRegistry.Dispute memory d = reg.dispute(0);
        assertEq(d.opener, alice);
        assertEq(d.reason, 3);
        assertEq(uint8(d.status), uint8(IDisputeRegistry.Status.Open));
    }

    function test_open_rejectsBadInput() public {
        vm.startPrank(alice);
        vm.expectRevert(IDisputeRegistry.EmptyEvidence.selector);
        reg.openDispute(TENDER, 1, 0, bytes32(0));
        vm.expectRevert(IDisputeRegistry.InvalidReason.selector);
        reg.openDispute(TENDER, 1, 6, EVIDENCE);
        vm.stopPrank();
        // an out-of-range kind is rejected by ABI decoding
        (bool ok,) = address(reg).call(abi.encodeWithSelector(reg.openDispute.selector, uint8(2), uint64(1), uint8(0), EVIDENCE));
        assertFalse(ok);
        assertEq(reg.count(), 0);
    }

    function test_constructor_rejectsZeroArbiter() public {
        vm.expectRevert(IDisputeRegistry.ZeroArbiter.selector);
        new DisputeRegistry(address(0));
    }

    // ───────────── respond ─────────────

    function test_respond_anyoneUntilClosed() public {
        uint256 id = _open(alice, TENDER, 1);
        vm.expectEmit(true, true, false, true);
        emit IDisputeRegistry.DisputeResponse(id, bob, EVIDENCE);
        vm.prank(bob);
        reg.respond(id, EVIDENCE);

        vm.prank(arbiter);
        reg.setStatus(id, IDisputeRegistry.Status.UnderReview, 0);
        vm.prank(alice);
        reg.respond(id, EVIDENCE); // still open for evidence during review

        vm.prank(arbiter);
        reg.setStatus(id, IDisputeRegistry.Status.Rejected, DECISION);
        vm.prank(bob);
        vm.expectRevert(IDisputeRegistry.DisputeClosed.selector);
        reg.respond(id, EVIDENCE);
    }

    function test_respond_rejects() public {
        vm.expectRevert(IDisputeRegistry.DisputeNotFound.selector);
        reg.respond(0, EVIDENCE);
        uint256 id = _open(alice, TENDER, 1);
        vm.expectRevert(IDisputeRegistry.EmptyEvidence.selector);
        reg.respond(id, bytes32(0));
    }

    // ───────────── arbiter ─────────────

    function test_status_onlyArbiter() public {
        uint256 id = _open(alice, TENDER, 1);
        vm.prank(alice);
        vm.expectRevert(IDisputeRegistry.NotArbiter.selector);
        reg.setStatus(id, IDisputeRegistry.Status.Resolved, DECISION);
        vm.prank(arbiter);
        vm.expectRevert(IDisputeRegistry.DisputeNotFound.selector);
        reg.setStatus(9, IDisputeRegistry.Status.UnderReview, 0);
    }

    function test_status_transitions() public {
        uint256 id = _open(alice, TENDER, 1);
        vm.startPrank(arbiter);
        vm.expectRevert(IDisputeRegistry.InvalidStatus.selector);
        reg.setStatus(id, IDisputeRegistry.Status.Open, DECISION);
        vm.expectRevert(IDisputeRegistry.InvalidStatus.selector);
        reg.setStatus(id, IDisputeRegistry.Status.Resolved, 0); // closing needs a decision document

        reg.setStatus(id, IDisputeRegistry.Status.UnderReview, 0);
        vm.expectRevert(IDisputeRegistry.InvalidStatus.selector);
        reg.setStatus(id, IDisputeRegistry.Status.UnderReview, 0);

        vm.expectEmit(true, false, false, true);
        emit IDisputeRegistry.DisputeStatusChanged(id, IDisputeRegistry.Status.Resolved, DECISION);
        reg.setStatus(id, IDisputeRegistry.Status.Resolved, DECISION);
        vm.expectRevert(IDisputeRegistry.DisputeClosed.selector);
        reg.setStatus(id, IDisputeRegistry.Status.Rejected, DECISION);
        vm.stopPrank();
        assertEq(uint8(reg.dispute(id).status), uint8(IDisputeRegistry.Status.Resolved));
    }

    function test_status_closeDirectlyFromOpen() public {
        uint256 id = _open(alice, AUCTION, 2);
        vm.prank(arbiter);
        reg.setStatus(id, IDisputeRegistry.Status.Rejected, DECISION);
        assertEq(uint8(reg.dispute(id).status), uint8(IDisputeRegistry.Status.Rejected));
    }

    function testFuzz_onlyArbiterChangesStatus(address caller, uint8 s) public {
        vm.assume(caller != arbiter);
        uint256 id = _open(alice, TENDER, 1);
        vm.prank(caller);
        vm.expectRevert(IDisputeRegistry.NotArbiter.selector);
        reg.setStatus(id, IDisputeRegistry.Status(bound(s, 1, 3)), DECISION);
    }
}

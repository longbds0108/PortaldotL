// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommitReveal} from "../src/CommitReveal.sol";
import {SealedScores} from "../examples/SealedScores.sol";

contract CommitRevealTest is Test {
    string internal constant FILE = "test/vectors.json";
    bytes32 internal constant TAG = keccak256("example.sealed-scores.commit.v1");

    function _s(string memory json, uint256 i, string memory key) internal pure returns (string memory) {
        return vm.parseJsonString(json, string.concat(".commitments[", vm.toString(i), "].", key));
    }

    function _commitmentAt(string memory json, uint256 i) internal pure returns (bytes32) {
        return CommitReveal.compute(
            TAG,
            vm.parseUint(_s(json, i, "chainId")),
            vm.parseAddress(_s(json, i, "contract")),
            vm.parseUint(_s(json, i, "roundId")),
            vm.parseAddress(_s(json, i, "committer")),
            keccak256(abi.encode(vm.parseUint(_s(json, i, "value")))),
            vm.parseBytes32(_s(json, i, "salt"))
        );
    }

    function test_matchesVectors() public view {
        string memory json = vm.readFile(FILE);
        assertEq(vm.parseJsonBytes32(json, ".domainTag"), TAG);
        for (uint256 i; i < 5; i++) {
            assertEq(_commitmentAt(json, i), vm.parseBytes32(_s(json, i, "commitment")));
        }
    }

    function test_foldMatchesVectors() public view {
        string memory json = vm.readFile(FILE);
        bytes32 d = CommitReveal.foldReveal(0, vm.parseAddress(_s(json, 0, "committer")), 87, _commitmentAt(json, 0));
        assertEq(d, vm.parseJsonBytes32(json, ".foldReveal.after1"));
        d = CommitReveal.foldReveal(d, vm.parseAddress(_s(json, 1, "committer")), 92, _commitmentAt(json, 1));
        assertEq(d, vm.parseJsonBytes32(json, ".foldReveal.after2"));
    }

    function testFuzz_everyFieldBinds(uint256 chain, address at, uint256 round, address who, bytes32 payload, bytes32 salt)
        public
        pure
    {
        vm.assume(chain < type(uint256).max && round < type(uint256).max);
        bytes32 c = CommitReveal.compute(TAG, chain, at, round, who, payload, salt);
        assertTrue(c != CommitReveal.compute(~TAG, chain, at, round, who, payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chain + 1, at, round, who, payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chain, address(uint160(at) ^ 1), round, who, payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chain, at, round + 1, who, payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chain, at, round, address(uint160(who) ^ 1), payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chain, at, round, who, ~payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chain, at, round, who, payload, ~salt));
    }

    function test_foldDependsOnOrder() public pure {
        bytes32 a = CommitReveal.foldReveal(CommitReveal.foldReveal(0, address(1), 1, "x"), address(2), 2, "y");
        bytes32 b = CommitReveal.foldReveal(CommitReveal.foldReveal(0, address(2), 2, "y"), address(1), 1, "x");
        assertTrue(a != b);
    }
}

contract SealedScoresTest is Test {
    SealedScores internal scores;
    address internal judge = makeAddr("judge");
    address internal other = makeAddr("other");
    uint64 internal commitDeadline;
    uint64 internal revealDeadline;

    function setUp() public {
        vm.warp(1_750_000_000);
        scores = new SealedScores();
        commitDeadline = uint64(block.timestamp) + 1 days;
        revealDeadline = commitDeadline + 1 days;
        scores.open(commitDeadline, revealDeadline);
    }

    function _commitment(address who, uint256 score, bytes32 salt) internal view returns (bytes32) {
        return CommitReveal.compute(
            keccak256("example.sealed-scores.commit.v1"),
            block.chainid,
            address(scores),
            0,
            who,
            keccak256(abi.encode(score)),
            salt
        );
    }

    function test_commitThenReveal() public {
        bytes32 c = _commitment(judge, 87, "s");
        vm.prank(judge);
        scores.commit(0, c);
        vm.warp(commitDeadline);
        vm.prank(judge);
        scores.reveal(0, 87, "s");
        (,, uint32 revealed, uint256 total, bytes32 digest) = scores.rounds(0);
        assertEq(revealed, 1);
        assertEq(total, 87);
        assertEq(digest, CommitReveal.foldReveal(0, judge, 87, c));
    }

    function test_revealRejects() public {
        bytes32 c = _commitment(judge, 87, "s");
        vm.prank(judge);
        scores.commit(0, c);
        vm.prank(judge);
        vm.expectRevert(SealedScores.WrongPhase.selector);
        scores.reveal(0, 87, "s"); // too early

        vm.warp(commitDeadline);
        vm.prank(judge);
        vm.expectRevert(SealedScores.BadOpening.selector);
        scores.reveal(0, 88, "s"); // changed score
        vm.prank(judge);
        vm.expectRevert(SealedScores.BadOpening.selector);
        scores.reveal(0, 87, "t"); // changed salt
        vm.prank(other);
        vm.expectRevert(SealedScores.NothingCommitted.selector);
        scores.reveal(0, 87, "s");

        vm.prank(judge);
        scores.reveal(0, 87, "s");
        vm.prank(judge);
        vm.expectRevert(SealedScores.NothingCommitted.selector);
        scores.reveal(0, 87, "s"); // once only

        vm.warp(revealDeadline);
        vm.prank(judge);
        vm.expectRevert(SealedScores.WrongPhase.selector);
        scores.reveal(0, 87, "s"); // too late
    }

    function test_copiedCommitmentCannotBeRevealedByAnotherAccount() public {
        bytes32 c = _commitment(judge, 87, "s");
        vm.prank(judge);
        scores.commit(0, c);
        vm.prank(other);
        scores.commit(0, c);
        vm.warp(commitDeadline);
        vm.prank(other);
        vm.expectRevert(SealedScores.BadOpening.selector);
        scores.reveal(0, 87, "s");
    }

    function test_commitAndOpenRejectBadTiming() public {
        vm.expectRevert(SealedScores.BadDeadlines.selector);
        scores.open(uint64(block.timestamp), revealDeadline);
        vm.expectRevert(SealedScores.BadDeadlines.selector);
        scores.open(commitDeadline, commitDeadline);
        vm.warp(commitDeadline);
        vm.expectRevert(SealedScores.WrongPhase.selector);
        scores.commit(0, "c");
    }
}

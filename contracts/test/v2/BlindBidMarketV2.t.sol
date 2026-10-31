// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IBlindBidMarket} from "../../src/interfaces/IBlindBidMarket.sol";
import {IBlindBidMarketV2} from "../../src/interfaces/IBlindBidMarketV2.sol";
import {BlindBidMarketV2} from "../../src/v2/BlindBidMarketV2.sol";
import {CommitReveal} from "../../src/v2/CommitReveal.sol";
import {MarketV2Probe} from "./Harnesses.sol";

/// @dev Tries to re-enter withdrawBond when it receives tPOTv3.
contract ReentrantV2Bidder {
    BlindBidMarketV2 internal immutable market;
    uint256 internal id;

    constructor(BlindBidMarketV2 m) {
        market = m;
    }

    function bid(uint256 id_, bytes32 c, bytes32 doc) external payable {
        id = id_;
        market.submitBid{value: msg.value}(id_, c, doc);
    }

    function reveal(uint128 amount, bytes32 salt, bytes32 key) external {
        market.revealBid(id, amount, salt, key);
    }

    function pull() external {
        market.withdrawBond(id);
    }

    receive() external payable {
        market.withdrawBond(id);
    }
}

contract RejectsPayment {
    receive() external payable {
        revert("no");
    }
}

contract BlindBidMarketV2Test is Test {
    MarketV2Probe internal market;

    address internal buyer = makeAddr("buyer");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint128 internal constant MIN = 5_000 ether;
    uint128 internal constant MAX = 10_000 ether;
    uint96 internal constant BOND = 10 ether;
    bytes32 internal constant META = keccak256("metadata");
    bytes32 internal constant DOC = keccak256("cipher");
    bytes32 internal constant REASON = keccak256("reason");
    bytes32 internal constant TAG = keccak256("plinths.tender.commit.v2");

    uint64 internal submissionDeadline;
    uint64 internal revealDeadline;

    function setUp() public {
        vm.warp(1_750_000_000);
        market = new MarketV2Probe(treasury);
        submissionDeadline = uint64(block.timestamp) + 3 days;
        revealDeadline = submissionDeadline + 1 days;
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
        vm.deal(carol, 1_000 ether);
    }

    function _create(uint96 bond) internal returns (uint256 id) {
        vm.prank(buyer);
        id = market.createTender(META, MIN, MAX, submissionDeadline, revealDeadline, bond);
    }

    function _commit(uint256 id, address bidder, uint256 amount, bytes32 salt, bytes32 key)
        internal
        view
        returns (bytes32)
    {
        bytes32 payload = keccak256(abi.encode(amount, keccak256(abi.encodePacked(key))));
        return CommitReveal.compute(TAG, block.chainid, address(market), id, bidder, payload, salt);
    }

    function _bid(uint256 id, address bidder, uint128 amount, bytes32 salt, bytes32 key) internal {
        uint256 bond = market.tender(id).bidBond;
        vm.prank(bidder);
        market.submitBid{value: bond}(id, _commit(id, bidder, amount, salt, key), DOC);
    }

    function _reveal(uint256 id, address bidder, uint128 amount, bytes32 salt, bytes32 key) internal {
        vm.prank(bidder);
        market.revealBid(id, amount, salt, key);
    }

    // ───────────── shared vectors (web/lib/commitment.test.ts asserts the same file) ─────────────

    function test_domainTagMatchesInterface() public view {
        assertEq(market.COMMITMENT_DOMAIN(), TAG);
    }

    function test_commitmentMatchesSharedVectors() public view {
        string memory json = vm.readFile("test/fixtures/commitment-v2-vectors.json");
        assertEq(vm.parseJsonBytes32(json, ".tenderDomainTag"), TAG);
        for (uint256 i; i < 4; i++) {
            string memory p = string.concat(".tender[", vm.toString(i), "]");
            uint256 amount = vm.parseUint(vm.parseJsonString(json, string.concat(p, ".amount")));
            bytes32 docKey = vm.parseJsonBytes32(json, string.concat(p, ".docKey"));
            bytes32 payload = keccak256(abi.encode(amount, keccak256(abi.encodePacked(docKey))));
            assertEq(payload, vm.parseJsonBytes32(json, string.concat(p, ".payloadHash")));
            assertEq(
                CommitReveal.compute(
                    TAG,
                    vm.parseUint(vm.parseJsonString(json, string.concat(p, ".chainId"))),
                    vm.parseJsonAddress(json, string.concat(p, ".contract")),
                    vm.parseUint(vm.parseJsonString(json, string.concat(p, ".tenderId"))),
                    vm.parseJsonAddress(json, string.concat(p, ".bidder")),
                    payload,
                    vm.parseJsonBytes32(json, string.concat(p, ".salt"))
                ),
                vm.parseJsonBytes32(json, string.concat(p, ".commitment"))
            );
        }
    }

    /// The contract itself, at the vector's chain and address, accepts the vector's opening.
    function test_contractAcceptsSharedVectorOpening() public {
        string memory json = vm.readFile("test/fixtures/commitment-v2-vectors.json");
        vm.chainId(vm.parseUint(vm.parseJsonString(json, ".tender[0].chainId")));
        address at = vm.parseJsonAddress(json, ".tender[0].contract");
        deployCodeTo("BlindBidMarketV2.sol:BlindBidMarketV2", abi.encode(treasury), at);
        BlindBidMarketV2 m = BlindBidMarketV2(at);
        address bidder = vm.parseJsonAddress(json, ".tender[0].bidder");
        vm.deal(bidder, 1 ether);

        vm.prank(buyer);
        m.createTender(META, 1, type(uint128).max, submissionDeadline, revealDeadline, 0);
        vm.prank(bidder);
        m.submitBid(0, vm.parseJsonBytes32(json, ".tender[0].commitment"), DOC);
        vm.warp(submissionDeadline);
        vm.prank(bidder);
        m.revealBid(
            0,
            uint128(vm.parseUint(vm.parseJsonString(json, ".tender[0].amount"))),
            vm.parseJsonBytes32(json, ".tender[0].salt"),
            vm.parseJsonBytes32(json, ".tender[0].docKey")
        );
    }

    // ───────────── storage layout read by the app (mirror of web/lib/market-storage.ts) ─────────────

    function test_storageLayoutMatchesApp() public {
        _create(BOND);
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500 ether, "s", "k");
        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500 ether, "s", "k");

        assertEq(uint256(vm.load(address(market), bytes32(uint256(1)))), 2);
        uint256 base = uint256(keccak256(abi.encode(uint256(1)))) + id * 5;
        IBlindBidMarketV2.TenderV2 memory t = market.tender(id);
        uint256 w0 = uint256(vm.load(address(market), bytes32(base)));
        uint256 w1 = uint256(vm.load(address(market), bytes32(base + 1)));
        uint256 w2 = uint256(vm.load(address(market), bytes32(base + 2)));
        uint256 w3 = uint256(vm.load(address(market), bytes32(base + 3)));
        assertEq(address(uint160(w0)), t.buyer);
        assertEq(uint64(w0 >> 160), t.submissionDeadline);
        assertEq(uint32(w0 >> 224), t.bidCount);
        assertEq(address(uint160(w1)), t.winner);
        assertEq(uint64(w1 >> 160), t.revealDeadline);
        assertEq(uint32(w1 >> 224), t.revealedCount);
        assertEq(uint96(w2), t.bidBond);
        assertEq(uint64(w2 >> 96), t.createdBlock);
        assertEq(uint128(w3), t.budgetMin);
        assertEq(uint128(w3 >> 128), t.budgetMax);
        assertEq(vm.load(address(market), bytes32(base + 4)), t.revealSetDigest);

        // Bid layout is unchanged from V1.
        bytes32 slot = keccak256(abi.encode(alice, keccak256(abi.encode(id, uint256(2)))));
        assertEq(vm.load(address(market), slot), market.bid(id, alice).commitment);
    }

    // ───────────── create ─────────────

    function test_createTender_rejectsBadInput() public {
        vm.startPrank(buyer);
        vm.expectRevert(IBlindBidMarket.EmptyDocument.selector);
        market.createTender(0, MIN, MAX, submissionDeadline, revealDeadline, BOND);
        vm.expectRevert(IBlindBidMarket.InvalidBudget.selector);
        market.createTender(META, MAX, MIN, submissionDeadline, revealDeadline, BOND);
        vm.expectRevert(IBlindBidMarket.InvalidBudget.selector);
        market.createTender(META, 0, 0, submissionDeadline, revealDeadline, BOND);
        vm.expectRevert(IBlindBidMarket.InvalidDeadlines.selector);
        market.createTender(META, MIN, MAX, uint64(block.timestamp), revealDeadline, BOND);
        vm.expectRevert(IBlindBidMarket.InvalidDeadlines.selector);
        market.createTender(META, MIN, MAX, submissionDeadline, submissionDeadline + 1 days - 1, BOND);
        vm.stopPrank();
    }

    function test_createTender_storesBudget() public {
        uint256 id = _create(BOND);
        assertEq(market.tender(id).budgetMin, MIN);
        assertEq(market.tender(id).budgetMax, MAX);
        assertEq(market.tender(id).revealSetDigest, bytes32(0));
    }

    function test_constructor_rejectsZeroTreasury() public {
        vm.expectRevert(IBlindBidMarket.ZeroTreasury.selector);
        new BlindBidMarketV2(address(0));
    }

    function test_unknownTenderReverts() public {
        vm.expectRevert(IBlindBidMarket.TenderNotFound.selector);
        market.sweepForfeitedBonds(7);
        vm.expectRevert(IBlindBidMarket.TenderNotFound.selector);
        market.cancel(7);
    }

    // ───────────── bid ─────────────

    function test_submitBid_rejects() public {
        uint256 id = _create(BOND);
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.BuyerCannotBid.selector);
        market.submitBid(id, "c", DOC);
        vm.startPrank(alice);
        vm.expectRevert(IBlindBidMarket.ZeroCommitment.selector);
        market.submitBid{value: BOND}(id, 0, DOC);
        vm.expectRevert(IBlindBidMarket.EmptyDocument.selector);
        market.submitBid{value: BOND}(id, "c", 0);
        vm.expectRevert(IBlindBidMarket.WrongBond.selector);
        market.submitBid(id, "c", DOC);
        vm.stopPrank();
        vm.warp(submissionDeadline);
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.submitBid{value: BOND}(id, "c", DOC);
    }

    function test_resubmit_replacesWithoutSecondBond() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_000 ether, "s", "k");
        vm.startPrank(alice);
        vm.expectRevert(IBlindBidMarket.WrongBond.selector);
        market.submitBid{value: BOND}(id, "c2", DOC);
        market.submitBid(id, _commit(id, alice, 8_000 ether, "s2", "k2"), DOC);
        vm.stopPrank();
        assertEq(market.tender(id).bidCount, 1);
        assertEq(address(market).balance, BOND);

        vm.warp(submissionDeadline);
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        market.revealBid(id, 7_000 ether, "s", "k"); // the replaced opening no longer works
        _reveal(id, alice, 8_000 ether, "s2", "k2");
    }

    // ───────────── reveal ─────────────

    function test_reveal_rejects() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500 ether, "s", "k");
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        _reveal(id, alice, 7_500 ether, "s", "k");
        vm.warp(submissionDeadline);
        vm.expectRevert(IBlindBidMarket.NoBid.selector);
        _reveal(id, bob, 7_500 ether, "s", "k");
        vm.expectRevert(IBlindBidMarket.ZeroAmount.selector);
        _reveal(id, alice, 0, "s", "k");
        _reveal(id, alice, 7_500 ether, "s", "k");
        vm.expectRevert(IBlindBidMarket.AlreadyRevealed.selector);
        _reveal(id, alice, 7_500 ether, "s", "k");
        vm.warp(revealDeadline);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        _reveal(id, bob, 7_500 ether, "s", "k");
    }

    function test_reveal_cannotReuseAnotherBiddersCommitment() public {
        uint256 id = _create(BOND);
        bytes32 c = _commit(id, alice, 7_500 ether, "s", "k");
        vm.prank(alice);
        market.submitBid{value: BOND}(id, c, DOC);
        vm.prank(bob);
        market.submitBid{value: BOND}(id, c, DOC);
        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500 ether, "s", "k");
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        _reveal(id, bob, 7_500 ether, "s", "k");
    }

    function test_reveal_rejectsCrossTenderReplay() public {
        uint256 a = _create(BOND);
        uint256 b = _create(BOND);
        bytes32 c = _commit(a, alice, 7_500 ether, "s", "k");
        vm.startPrank(alice);
        market.submitBid{value: BOND}(a, c, DOC);
        market.submitBid{value: BOND}(b, c, DOC);
        vm.warp(submissionDeadline);
        market.revealBid(a, 7_500 ether, "s", "k");
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        market.revealBid(b, 7_500 ether, "s", "k");
        vm.stopPrank();
    }

    function testFuzz_reveal_wrongOpeningReverts(
        uint128 amount,
        bytes32 salt,
        bytes32 key,
        uint128 badAmount,
        bytes32 badSalt,
        bytes32 badKey
    ) public {
        amount = uint128(bound(amount, 1, type(uint128).max));
        badAmount = uint128(bound(badAmount, 1, type(uint128).max));
        vm.assume(amount != badAmount || salt != badSalt || key != badKey);
        uint256 id = _create(BOND);
        _bid(id, alice, amount, salt, key);
        vm.warp(submissionDeadline);
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        _reveal(id, alice, badAmount, badSalt, badKey);
    }

    /// Changing any single field of the domain or payload changes the commitment.
    function testFuzz_commitmentBindsEveryField(
        uint256 chainId,
        address at,
        uint256 id,
        address who,
        bytes32 payload,
        bytes32 salt
    ) public pure {
        vm.assume(chainId < type(uint256).max && id < type(uint256).max);
        bytes32 c = CommitReveal.compute(TAG, chainId, at, id, who, payload, salt);
        assertTrue(c != CommitReveal.compute(~TAG, chainId, at, id, who, payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chainId + 1, at, id, who, payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chainId, address(uint160(at) ^ 1), id, who, payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chainId, at, id + 1, who, payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chainId, at, id, address(uint160(who) ^ 1), payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chainId, at, id, who, ~payload, salt));
        assertTrue(c != CommitReveal.compute(TAG, chainId, at, id, who, payload, ~salt));
    }

    // ───────────── reveal-set digest ─────────────

    function test_revealSetDigest_followsRevealOrder() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_000 ether, "a", "ka");
        _bid(id, bob, 8_000 ether, "b", "kb");
        vm.warp(submissionDeadline);
        _reveal(id, bob, 8_000 ether, "b", "kb");
        bytes32 d = CommitReveal.foldReveal(0, bob, 8_000 ether, _commit(id, bob, 8_000 ether, "b", "kb"));
        assertEq(market.tender(id).revealSetDigest, d);
        _reveal(id, alice, 7_000 ether, "a", "ka");
        d = CommitReveal.foldReveal(d, alice, 7_000 ether, _commit(id, alice, 7_000 ether, "a", "ka"));
        assertEq(market.tender(id).revealSetDigest, d);

        vm.warp(revealDeadline);
        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarketV2.SelectionRecorded(id, alice, d, 2, 1);
        vm.prank(buyer);
        market.award(id, alice, REASON);
    }

    // ───────────── award ─────────────

    function _revealedTender(uint128 amount) internal returns (uint256 id) {
        id = _create(BOND);
        _bid(id, alice, amount, "s", "k");
        vm.warp(submissionDeadline);
        _reveal(id, alice, amount, "s", "k");
        vm.warp(revealDeadline);
    }

    function test_award_budgetBoundsAreInclusive() public {
        uint256 low = _revealedTender(MIN);
        vm.prank(buyer);
        market.award(low, alice, REASON);
        assertEq(market.tender(low).winner, alice);

        submissionDeadline = uint64(block.timestamp) + 1 days;
        revealDeadline = submissionDeadline + 1 days;
        uint256 high = _revealedTender(MAX);
        vm.prank(buyer);
        market.award(high, alice, REASON);
        assertEq(market.tender(high).winner, alice);
    }

    function test_award_rejectsJustOutsideBudget() public {
        uint256 low = _revealedTender(MIN - 1);
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarketV2.BidOutOfBudget.selector);
        market.award(low, alice, REASON);

        submissionDeadline = uint64(block.timestamp) + 1 days;
        revealDeadline = submissionDeadline + 1 days;
        uint256 high = _revealedTender(MAX + 1);
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarketV2.BidOutOfBudget.selector);
        market.award(high, alice, REASON);
    }

    function testFuzz_award_enforcesBudget(uint128 amount) public {
        amount = uint128(bound(amount, 1, type(uint128).max));
        uint256 id = _revealedTender(amount);
        vm.prank(buyer);
        if (amount < MIN || amount > MAX) vm.expectRevert(IBlindBidMarketV2.BidOutOfBudget.selector);
        market.award(id, alice, REASON);
    }

    /// The buyer may pick any bid in the range: lowest price does not have to win a multi-criteria tender.
    function test_award_buyerMayChooseAPricierBidInBudget() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 6_000 ether, "a", "ka");
        _bid(id, bob, 9_000 ether, "b", "kb");
        vm.warp(submissionDeadline);
        _reveal(id, alice, 6_000 ether, "a", "ka");
        _reveal(id, bob, 9_000 ether, "b", "kb");
        vm.warp(revealDeadline);
        vm.prank(buyer);
        market.award(id, bob, REASON);
        assertEq(market.tender(id).winner, bob);
    }

    function test_award_rejectsWrongCaller_phase_winner_reason_andRepeat() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500 ether, "a", "ka");
        _bid(id, bob, 8_000 ether, "b", "kb");
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.award(id, alice, REASON);
        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500 ether, "a", "ka");
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.award(id, alice, REASON);
        vm.warp(revealDeadline);

        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NotBuyer.selector);
        market.award(id, alice, REASON);
        vm.startPrank(buyer);
        vm.expectRevert(IBlindBidMarket.EmptyDocument.selector);
        market.award(id, alice, 0);
        vm.expectRevert(IBlindBidMarket.WinnerNotRevealed.selector);
        market.award(id, bob, REASON);
        market.award(id, alice, REASON);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.award(id, alice, REASON);
        vm.stopPrank();
        assertEq(uint8(market.state(id)), uint8(IBlindBidMarket.TenderState.Awarded));
    }

    // ───────────── cancel, failure, bonds ─────────────

    function test_cancel_onlyBuyerOnlyOpenWithoutBids() public {
        uint256 id = _create(BOND);
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NotBuyer.selector);
        market.cancel(id);
        _bid(id, alice, 7_500 ether, "s", "k");
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.HasBids.selector);
        market.cancel(id);

        uint256 empty = _create(BOND);
        vm.startPrank(buyer);
        market.cancel(empty);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.cancel(empty);
        vm.stopPrank();
        assertEq(uint8(market.state(empty)), uint8(IBlindBidMarket.TenderState.Cancelled));
    }

    function test_noReveal_failed_andBondSweptOnce() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500 ether, "s", "k");
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.sweepForfeitedBonds(id);
        vm.warp(revealDeadline);
        assertEq(uint8(market.state(id)), uint8(IBlindBidMarket.TenderState.Failed));
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.withdrawBond(id);
        market.sweepForfeitedBonds(id);
        assertEq(treasury.balance, BOND);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.sweepForfeitedBonds(id);
    }

    function test_bond_withdrawOnceEvenWhenOutOfBudget() public {
        uint256 id = _revealedTender(MAX + 1); // out of budget: cannot win, still gets the bond back
        uint256 before = alice.balance;
        vm.startPrank(alice);
        market.withdrawBond(id);
        assertEq(alice.balance, before + BOND);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.withdrawBond(id);
        vm.stopPrank();
    }

    function test_bond_zeroBondHasNothingToWithdrawOrSweep() public {
        uint256 id = _create(0);
        _bid(id, alice, 7_500 ether, "s", "k");
        _bid(id, bob, 7_500 ether, "s", "k");
        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500 ether, "s", "k");
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.withdrawBond(id);
        vm.warp(revealDeadline);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.sweepForfeitedBonds(id);
    }

    function test_bond_reentrancyBlocked() public {
        uint256 id = _create(BOND);
        ReentrantV2Bidder attacker = new ReentrantV2Bidder(market);
        vm.deal(address(attacker), 0);
        bytes32 c = _commit(id, address(attacker), 7_500 ether, "s", "k");
        attacker.bid{value: BOND}(id, c, DOC);
        _bid(id, alice, 7_500 ether, "s", "k");
        vm.warp(submissionDeadline);
        attacker.reveal(7_500 ether, "s", "k");
        vm.expectRevert(IBlindBidMarket.TransferFailed.selector);
        attacker.pull();
    }

    function test_bond_failedPaymentReverts() public {
        RejectsPayment t = new RejectsPayment();
        MarketV2Probe m = new MarketV2Probe(address(t));
        vm.prank(buyer);
        uint256 id = m.createTender(META, MIN, MAX, submissionDeadline, revealDeadline, BOND);
        bytes32 payload = keccak256(abi.encode(uint256(1), keccak256(abi.encodePacked(bytes32("k")))));
        vm.prank(alice);
        m.submitBid{value: BOND}(id, CommitReveal.compute(TAG, block.chainid, address(m), id, alice, payload, "s"), DOC);
        vm.warp(revealDeadline);
        vm.expectRevert(IBlindBidMarket.TransferFailed.selector);
        m.sweepForfeitedBonds(id);
    }
}

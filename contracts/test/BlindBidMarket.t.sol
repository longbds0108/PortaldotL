// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BlindBidMarket} from "../src/BlindBidMarket.sol";
import {IBlindBidMarket} from "../src/interfaces/IBlindBidMarket.sol";
import {CommitmentLib} from "../src/CommitmentLib.sol";

/// @dev The market has no views (storage-lean for PortaldotV3); the harness exposes what tests assert on.
contract MarketHarness is BlindBidMarket {
    constructor(address treasury_) BlindBidMarket(treasury_) {}

    function tenderCount() external view returns (uint256) {
        return _tenders.length;
    }

    function tender(uint256 id) external view returns (Tender memory) {
        return _tender(id);
    }

    function state(uint256 id) external view returns (TenderState) {
        return _state(_tender(id));
    }

    function bid(uint256 id, address bidder) external view returns (Bid memory) {
        return _bids[id][bidder];
    }
}

contract BlindBidMarketTest is Test {
    MarketHarness internal market;

    address internal buyer = makeAddr("buyer");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint96 internal constant BOND = 10 ether; // 10 tPOTv3 in EVM units (18 decimals)
    uint64 internal constant SUBMIT_WINDOW = 3 days;
    uint64 internal constant REVEAL_WINDOW = 1 days;
    bytes32 internal constant META = keccak256("metadata");
    bytes32 internal constant DOC = keccak256("cipher");
    bytes32 internal constant REASON = keccak256("reason");

    uint64 internal submissionDeadline;
    uint64 internal revealDeadline;

    function setUp() public {
        vm.warp(1_750_000_000);
        market = new MarketHarness(treasury);
        submissionDeadline = uint64(block.timestamp) + SUBMIT_WINDOW;
        revealDeadline = submissionDeadline + REVEAL_WINDOW;
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    // ───────────── helpers ─────────────

    function _create(uint96 bond) internal returns (uint256 id) {
        vm.prank(buyer);
        id = market.createTender(META, 5_000 ether, 10_000 ether, submissionDeadline, revealDeadline, bond);
    }

    function _commit(uint256 id, address bidder, uint256 amount, bytes32 salt, bytes32 key)
        internal
        pure
        returns (bytes32)
    {
        return CommitmentLib.compute(id, bidder, amount, salt, key);
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

    function _expectState(uint256 id, IBlindBidMarket.TenderState s) internal view {
        assertEq(uint8(market.state(id)), uint8(s));
    }

    // ───────────── commitment cross-check (TS <-> Solidity <-> cast) ─────────────

    function test_commitmentMatchesSharedVectors() public view {
        string memory json = vm.readFile("test/fixtures/commitment-vectors.json");
        for (uint256 i = 0; i < 3; i++) {
            string memory p = string.concat(".vectors[", vm.toString(i), "]");
            uint256 tenderId = vm.parseUint(vm.parseJsonString(json, string.concat(p, ".tenderId")));
            address bidder = vm.parseJsonAddress(json, string.concat(p, ".bidder"));
            uint256 amount = vm.parseUint(vm.parseJsonString(json, string.concat(p, ".amount")));
            bytes32 salt = vm.parseJsonBytes32(json, string.concat(p, ".salt"));
            bytes32 docKey = vm.parseJsonBytes32(json, string.concat(p, ".docKey"));
            bytes32 docKeyHash = vm.parseJsonBytes32(json, string.concat(p, ".docKeyHash"));
            bytes32 expected = vm.parseJsonBytes32(json, string.concat(p, ".commitment"));

            assertEq(keccak256(abi.encodePacked(docKey)), docKeyHash, "docKeyHash");
            assertEq(CommitmentLib.compute(tenderId, bidder, amount, salt, docKey), expected, "commitment");
        }
    }

    // ───────────── storage layout read by the app (mirror of web/lib/market-storage.ts) ─────────────

    uint256 internal constant TENDERS_SLOT = 1; // Tender[] (slot 0 is ReentrancyGuard._status)
    uint256 internal constant BIDS_SLOT = 2; // mapping(uint256 => mapping(address => Bid))
    uint256 internal constant TENDER_WORDS = 3;

    function test_storageLayoutMatchesApp() public {
        uint256 id0 = _create(BOND);
        uint256 id = _create(BOND);
        assertEq(id0, 0);
        _bid(id, alice, 7_500 ether, "s", "k");
        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500 ether, "s", "k");

        // array length = tenderCount
        assertEq(uint256(vm.load(address(market), bytes32(TENDERS_SLOT))), 2);

        // Tender #1 words
        uint256 base = uint256(keccak256(abi.encode(TENDERS_SLOT))) + id * TENDER_WORDS;
        uint256 w0 = uint256(vm.load(address(market), bytes32(base)));
        uint256 w1 = uint256(vm.load(address(market), bytes32(base + 1)));
        uint256 w2 = uint256(vm.load(address(market), bytes32(base + 2)));
        IBlindBidMarket.Tender memory t = market.tender(id);
        assertEq(address(uint160(w0)), t.buyer);
        assertEq(uint64(w0 >> 160), t.submissionDeadline);
        assertEq(uint32(w0 >> 224), t.bidCount);
        assertEq(address(uint160(w1)), t.winner);
        assertEq(uint64(w1 >> 160), t.revealDeadline);
        assertEq(uint32(w1 >> 224), t.revealedCount);
        assertEq(uint96(w2), t.bidBond);
        assertEq(uint64(w2 >> 96), t.createdBlock);
        assertEq(uint8(w2 >> 160) == 1, t.cancelled);
        assertEq(uint8(w2 >> 168) == 1, t.awarded);
        assertEq(uint8(w2 >> 176) == 1, t.forfeitSwept);

        // Bid words: keccak(bidder . keccak(id . BIDS_SLOT))
        bytes32 inner = keccak256(abi.encode(id, BIDS_SLOT));
        uint256 bBase = uint256(keccak256(abi.encode(alice, inner)));
        uint256 b1 = uint256(vm.load(address(market), bytes32(bBase + 1)));
        IBlindBidMarket.Bid memory b = market.bid(id, alice);
        assertEq(vm.load(address(market), bytes32(bBase)), b.commitment);
        assertEq(uint96(b1), b.bond);
        assertEq(uint128(b1 >> 96), b.amount);
        assertEq(uint8(b1 >> 224) == 1, b.revealed);
        assertEq(uint8(b1 >> 232) == 1, b.bondWithdrawn);
        assertTrue(b.revealed);
    }

    // ───────────── createTender ─────────────

    function test_createTender_storesFieldsAndEmits() public {
        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarket.TenderCreated(0, buyer, META, 5_000 ether, 10_000 ether, submissionDeadline, revealDeadline, BOND);
        uint256 id = _create(BOND);
        IBlindBidMarket.Tender memory t = market.tender(id);
        assertEq(id, 0);
        assertEq(market.tenderCount(), 1);
        assertEq(t.buyer, buyer);
        assertEq(t.bidBond, BOND);
        assertEq(t.submissionDeadline, submissionDeadline);
        assertEq(t.revealDeadline, revealDeadline);
        assertEq(t.createdBlock, block.number);
        _expectState(id, IBlindBidMarket.TenderState.Open);
    }

    function test_createTender_rejectsBadInput() public {
        vm.startPrank(buyer);
        vm.expectRevert(IBlindBidMarket.EmptyDocument.selector);
        market.createTender(0, 1, 2, submissionDeadline, revealDeadline, 0);

        vm.expectRevert(IBlindBidMarket.InvalidBudget.selector);
        market.createTender(META, 3, 2, submissionDeadline, revealDeadline, 0);

        vm.expectRevert(IBlindBidMarket.InvalidDeadlines.selector);
        market.createTender(META, 1, 2, uint64(block.timestamp), revealDeadline, 0);

        uint64 tooShort = submissionDeadline + market.MIN_REVEAL_WINDOW() - 1;
        vm.expectRevert(IBlindBidMarket.InvalidDeadlines.selector);
        market.createTender(META, 1, 2, submissionDeadline, tooShort, 0);
        vm.stopPrank();
    }

    function test_unknownTenderReverts() public {
        vm.expectRevert(IBlindBidMarket.TenderNotFound.selector);
        market.submitBid(0, bytes32(uint256(1)), DOC);
        vm.expectRevert(IBlindBidMarket.TenderNotFound.selector);
        market.sweepForfeitedBonds(0);
    }

    // ───────────── submit / update ─────────────

    function test_submitBid_hidesAmountUntilReveal() public {
        uint256 id = _create(BOND);
        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarket.BidSubmitted(id, alice, _commit(id, alice, 7_500 ether, "s", "k"), DOC, true);
        _bid(id, alice, 7_500 ether, "s", "k");

        IBlindBidMarket.Bid memory b = market.bid(id, alice);
        assertEq(b.amount, 0);
        assertEq(b.bond, BOND);
        assertFalse(b.revealed);
        assertEq(market.tender(id).bidCount, 1);
        assertEq(address(market).balance, BOND);
    }

    function test_submitBid_rejects() public {
        uint256 id = _create(BOND);
        bytes32 c = _commit(id, alice, 1, "s", "k");

        vm.deal(buyer, 100 ether);
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.BuyerCannotBid.selector);
        market.submitBid{value: BOND}(id, c, DOC);

        vm.startPrank(alice);
        vm.expectRevert(IBlindBidMarket.WrongBond.selector);
        market.submitBid{value: BOND - 1}(id, c, DOC);

        vm.expectRevert(IBlindBidMarket.ZeroCommitment.selector);
        market.submitBid{value: BOND}(id, bytes32(0), DOC);

        vm.expectRevert(IBlindBidMarket.EmptyDocument.selector);
        market.submitBid{value: BOND}(id, c, bytes32(0));

        market.submitBid{value: BOND}(id, c, DOC);
        // a replacement must not send the bond again
        vm.expectRevert(IBlindBidMarket.WrongBond.selector);
        market.submitBid{value: BOND}(id, c, DOC);
        vm.stopPrank();
    }

    function test_submitBid_closedAtDeadline() public {
        uint256 id = _create(0);
        vm.warp(submissionDeadline);
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.submitBid(id, bytes32(uint256(1)), DOC);
    }

    function test_resubmit_replacesCommitmentWithoutSecondBond() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 9_000 ether, "s1", "k1");
        bytes32 c2 = _commit(id, alice, 8_000 ether, "s2", "k2");
        bytes32 doc2 = keccak256("cipher2");
        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarket.BidSubmitted(id, alice, c2, doc2, false);
        vm.prank(alice);
        market.submitBid(id, c2, doc2);

        IBlindBidMarket.Bid memory b = market.bid(id, alice);
        assertEq(b.commitment, c2);
        assertEq(b.bond, BOND);
        assertEq(market.tender(id).bidCount, 1);
        assertEq(address(market).balance, BOND);

        vm.warp(submissionDeadline);
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        _reveal(id, alice, 9_000 ether, "s1", "k1");
        _reveal(id, alice, 8_000 ether, "s2", "k2");
    }

    // ───────────── reveal ─────────────

    function test_reveal_happyPath() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500 ether, "s", "k");
        vm.warp(submissionDeadline);
        _expectState(id, IBlindBidMarket.TenderState.Reveal);

        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarket.BidRevealed(id, alice, 7_500 ether, "s", "k");
        _reveal(id, alice, 7_500 ether, "s", "k");

        IBlindBidMarket.Bid memory b = market.bid(id, alice);
        assertTrue(b.revealed);
        assertEq(b.amount, 7_500 ether);
        assertEq(market.tender(id).revealedCount, 1);

        vm.expectRevert(IBlindBidMarket.AlreadyRevealed.selector);
        _reveal(id, alice, 7_500 ether, "s", "k");
    }

    function test_reveal_cannotReuseAnotherBiddersCommitment() public {
        uint256 id = _create(0);
        _bid(id, alice, 7_500 ether, "s", "k");
        bytes32 aliceCommitment = market.bid(id, alice).commitment;
        vm.prank(bob);
        market.submitBid(id, aliceCommitment, DOC);

        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500 ether, "s", "k");
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        _reveal(id, bob, 7_500 ether, "s", "k");
    }

    function test_reveal_rejectsZeroAmountAndNoBid() public {
        uint256 id = _create(0);
        _bid(id, alice, 0, "s", "k");
        vm.warp(submissionDeadline);
        vm.expectRevert(IBlindBidMarket.ZeroAmount.selector);
        _reveal(id, alice, 0, "s", "k");
        vm.expectRevert(IBlindBidMarket.NoBid.selector);
        _reveal(id, bob, 1, "s", "k");
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
        vm.assume(badAmount != amount || badSalt != salt || badKey != key);

        uint256 id = _create(0);
        _bid(id, alice, amount, salt, key);
        vm.warp(submissionDeadline);

        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        _reveal(id, alice, badAmount, badSalt, badKey);
        _reveal(id, alice, amount, salt, key);
    }

    function testFuzz_reveal_outsideWindowReverts(uint256 t, bool early) public {
        uint256 id = _create(0);
        _bid(id, alice, 1_000 ether, "s", "k");
        t = early ? bound(t, block.timestamp, submissionDeadline - 1) : bound(t, revealDeadline, type(uint64).max);
        vm.warp(t);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        _reveal(id, alice, 1_000 ether, "s", "k");
    }

    function testFuzz_reveal_insideWindowSucceeds(uint64 dt) public {
        uint256 id = _create(0);
        _bid(id, alice, 1_000 ether, "s", "k");
        vm.warp(submissionDeadline + (dt % REVEAL_WINDOW));
        _reveal(id, alice, 1_000 ether, "s", "k");
        assertTrue(market.bid(id, alice).revealed);
    }

    // ───────────── lifecycle / award ─────────────

    function test_fullLifecycle_award() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500 ether, "a", "ka");
        _bid(id, bob, 6_900 ether, "b", "kb");
        _bid(id, carol, 8_100 ether, "c", "kc"); // will not reveal

        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500 ether, "a", "ka");
        _reveal(id, bob, 6_900 ether, "b", "kb");

        vm.warp(revealDeadline);
        _expectState(id, IBlindBidMarket.TenderState.Evaluation);

        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.WinnerNotRevealed.selector);
        market.award(id, carol, REASON);

        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NotBuyer.selector);
        market.award(id, alice, REASON);

        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.EmptyDocument.selector);
        market.award(id, bob, bytes32(0));

        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarket.TenderAwarded(id, bob, 6_900 ether, REASON);
        vm.prank(buyer);
        market.award(id, bob, REASON);

        assertEq(market.tender(id).winner, bob);
        _expectState(id, IBlindBidMarket.TenderState.Awarded);

        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.award(id, alice, REASON);
    }

    function test_award_onlyInEvaluation() public {
        uint256 id = _create(0);
        _bid(id, alice, 1, "s", "k");
        vm.warp(submissionDeadline);
        _reveal(id, alice, 1, "s", "k");
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.award(id, alice, REASON);
    }

    function test_noRevealedBids_failed() public {
        uint256 id = _create(0);
        _bid(id, alice, 1, "s", "k");
        vm.warp(revealDeadline);
        _expectState(id, IBlindBidMarket.TenderState.Failed);
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.award(id, alice, REASON);
    }

    function test_noBidsAtAll_failed() public {
        uint256 id = _create(0);
        vm.warp(revealDeadline);
        _expectState(id, IBlindBidMarket.TenderState.Failed);
    }

    // ───────────── cancel ─────────────

    function test_cancel_onlyBuyerOnlyOpenWithoutBids() public {
        uint256 id = _create(0);
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NotBuyer.selector);
        market.cancel(id);

        vm.expectEmit(true, false, false, false);
        emit IBlindBidMarket.TenderCancelled(id);
        vm.prank(buyer);
        market.cancel(id);
        _expectState(id, IBlindBidMarket.TenderState.Cancelled);

        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.InvalidState.selector);
        market.submitBid(id, bytes32(uint256(1)), DOC);

        uint256 id2 = _create(0);
        _bid(id2, alice, 1, "s", "k");
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.HasBids.selector);
        market.cancel(id2);
    }

    // ───────────── bonds ─────────────

    function test_constructor_rejectsZeroTreasury() public {
        vm.expectRevert(IBlindBidMarket.ZeroTreasury.selector);
        new BlindBidMarket(address(0));
        assertEq(market.treasury(), treasury);
    }

    function test_minRevealWindowIs24h() public {
        assertEq(market.MIN_REVEAL_WINDOW(), 24 hours);
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.InvalidDeadlines.selector);
        market.createTender(META, 1, 2, submissionDeadline, submissionDeadline + 24 hours - 1, BOND);
        vm.prank(buyer);
        market.createTender(META, 1, 2, submissionDeadline, submissionDeadline + 24 hours, BOND);
    }

    function test_bond_revealedBidderWithdraws_unrevealedForfeitsToTreasury() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500 ether, "a", "ka");
        _bid(id, bob, 6_900 ether, "b", "kb");
        _bid(id, carol, 8_100 ether, "c", "kc");

        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.withdrawBond(id);

        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500 ether, "a", "ka");

        uint256 before = alice.balance;
        vm.prank(alice);
        market.withdrawBond(id);
        assertEq(alice.balance, before + BOND);

        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.withdrawBond(id);

        // forfeits only sweepable after revealDeadline
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.sweepForfeitedBonds(id);

        vm.warp(revealDeadline);
        // anyone may trigger the sweep, but the money always goes to the treasury — never the buyer or caller
        vm.expectEmit(true, false, false, true);
        emit IBlindBidMarket.ForfeitedBondsSwept(id, 2 * uint256(BOND));
        vm.prank(buyer);
        market.sweepForfeitedBonds(id);
        assertEq(treasury.balance, 2 * uint256(BOND));
        assertEq(buyer.balance, 0);
        assertTrue(market.tender(id).forfeitSwept);
        assertEq(address(market).balance, 0);

        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.sweepForfeitedBonds(id);

        vm.prank(carol);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.withdrawBond(id);
    }

    function test_bond_zeroBondNothingToWithdraw() public {
        uint256 id = _create(0);
        _bid(id, alice, 1, "s", "k");
        vm.warp(submissionDeadline);
        _reveal(id, alice, 1, "s", "k");
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.withdrawBond(id);
    }

    function test_bond_withdrawIsReentrancySafe() public {
        uint256 id = _create(BOND);
        ReentrantBidder attacker = new ReentrantBidder(market, id);
        vm.deal(address(attacker), BOND);
        attacker.bid(_commit(id, address(attacker), 1, "s", "k"));
        _bid(id, alice, 1, "a", "ka");

        vm.warp(submissionDeadline);
        attacker.reveal(1, "s", "k");
        _reveal(id, alice, 1, "a", "ka");

        attacker.withdraw();
        assertEq(address(attacker).balance, BOND);
        assertEq(address(market).balance, BOND); // alice's bond untouched
        assertTrue(attacker.reentryBlocked());
    }

    /// @dev Invariant-style fuzz: contract balance always equals outstanding bonds.
    function testFuzz_bondAccounting(uint8 nBidders, uint8 revealMask, bool sweepFirst, address sweeper) public {
        vm.assume(sweeper != address(0) && sweeper != treasury);
        nBidders = uint8(bound(nBidders, 1, 8));
        uint256 id = _create(BOND);
        address[] memory bidders = new address[](nBidders);
        for (uint256 i = 0; i < nBidders; i++) {
            bidders[i] = address(uint160(0x1000 + i));
            vm.deal(bidders[i], BOND);
            _bid(id, bidders[i], uint128(i + 1), bytes32(i), bytes32(i + 100));
        }
        vm.warp(submissionDeadline);
        uint256 revealed;
        for (uint256 i = 0; i < nBidders; i++) {
            if ((revealMask >> i) & 1 == 1) {
                _reveal(id, bidders[i], uint128(i + 1), bytes32(i), bytes32(i + 100));
                revealed++;
            }
        }
        vm.warp(revealDeadline);
        if (sweepFirst && revealed < nBidders) {
            vm.prank(sweeper);
            market.sweepForfeitedBonds(id);
        }
        for (uint256 i = 0; i < nBidders; i++) {
            if ((revealMask >> i) & 1 == 1) {
                vm.prank(bidders[i]);
                market.withdrawBond(id);
            }
        }
        if (!sweepFirst && revealed < nBidders) {
            vm.prank(sweeper);
            market.sweepForfeitedBonds(id);
        }
        assertEq(address(market).balance, 0);
        assertEq(treasury.balance, uint256(BOND) * (nBidders - revealed));
        assertEq(buyer.balance, 0);
    }
}

contract ReentrantBidder {
    BlindBidMarket internal immutable market;
    uint256 internal immutable tenderId;
    bool public reentryBlocked;

    constructor(BlindBidMarket market_, uint256 tenderId_) {
        market = market_;
        tenderId = tenderId_;
    }

    function bid(bytes32 commitment) external {
        market.submitBid{value: address(this).balance}(tenderId, commitment, keccak256("x"));
    }

    function reveal(uint128 amount, bytes32 salt, bytes32 key) external {
        market.revealBid(tenderId, amount, salt, key);
    }

    function withdraw() external {
        market.withdrawBond(tenderId);
    }

    receive() external payable {
        try market.withdrawBond(tenderId) {}
        catch {
            reentryBlocked = true;
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BlindBidMarket} from "../src/BlindBidMarket.sol";
import {IBlindBidMarket} from "../src/interfaces/IBlindBidMarket.sol";
import {CommitmentLib} from "../src/CommitmentLib.sol";

contract BlindBidMarketTest is Test {
    BlindBidMarket internal market;

    address internal buyer = makeAddr("buyer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant BOND = 10 ether; // 10 native USDC (18 decimals)
    uint64 internal constant SUBMIT_WINDOW = 3 days;
    uint64 internal constant REVEAL_WINDOW = 1 days;

    uint64 internal submissionDeadline;
    uint64 internal revealDeadline;

    function setUp() public {
        vm.warp(1_750_000_000);
        market = new BlindBidMarket();
        submissionDeadline = uint64(block.timestamp) + SUBMIT_WINDOW;
        revealDeadline = submissionDeadline + REVEAL_WINDOW;
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    // ───────────── helpers ─────────────

    function _create(uint256 bond) internal returns (uint256 id) {
        vm.prank(buyer);
        id = market.createTender("ipfs://meta", 5_000e6, 10_000e6, submissionDeadline, revealDeadline, bond);
    }

    function _commit(uint256 id, address bidder, uint256 amount, bytes32 salt, bytes32 key)
        internal
        pure
        returns (bytes32)
    {
        return CommitmentLib.compute(id, bidder, amount, salt, key);
    }

    function _bid(uint256 id, address bidder, uint256 amount, bytes32 salt, bytes32 key) internal {
        uint256 bond = market.getTender(id).bidBond;
        vm.prank(bidder);
        market.submitBid{value: bond}(id, _commit(id, bidder, amount, salt, key), "ipfs://cipher");
    }

    function _reveal(uint256 id, address bidder, uint256 amount, bytes32 salt, bytes32 key) internal {
        vm.prank(bidder);
        market.revealBid(id, amount, salt, key);
    }

    function _expectState(uint256 id, IBlindBidMarket.TenderState s) internal view {
        assertEq(uint8(market.getTenderState(id)), uint8(s));
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

    // ───────────── createTender ─────────────

    function test_createTender_storesFields() public {
        uint256 id = _create(BOND);
        IBlindBidMarket.Tender memory t = market.getTender(id);
        assertEq(id, 0);
        assertEq(market.tenderCount(), 1);
        assertEq(t.buyer, buyer);
        assertEq(t.budgetMin, 5_000e6);
        assertEq(t.budgetMax, 10_000e6);
        assertEq(t.bidBond, BOND);
        assertEq(t.metadataURI, "ipfs://meta");
        assertEq(t.createdBlock, block.number);
        assertEq(market.getBuyerTenders(buyer).length, 1);
        _expectState(id, IBlindBidMarket.TenderState.Open);
    }

    function test_createTender_rejectsBadInput() public {
        vm.startPrank(buyer);
        vm.expectRevert(IBlindBidMarket.EmptyURI.selector);
        market.createTender("", 1, 2, submissionDeadline, revealDeadline, 0);

        vm.expectRevert(IBlindBidMarket.InvalidBudget.selector);
        market.createTender("m", 3, 2, submissionDeadline, revealDeadline, 0);

        vm.expectRevert(IBlindBidMarket.InvalidDeadlines.selector);
        market.createTender("m", 1, 2, uint64(block.timestamp), revealDeadline, 0);

        uint64 tooShort = submissionDeadline + market.MIN_REVEAL_WINDOW() - 1;
        vm.expectRevert(IBlindBidMarket.InvalidDeadlines.selector);
        market.createTender("m", 1, 2, submissionDeadline, tooShort, 0);
        vm.stopPrank();
    }

    function test_unknownTenderReverts() public {
        vm.expectRevert(IBlindBidMarket.TenderNotFound.selector);
        market.getTender(0);
        vm.expectRevert(IBlindBidMarket.TenderNotFound.selector);
        market.submitBid(0, bytes32(uint256(1)), "x");
    }

    // ───────────── submit / update ─────────────

    function test_submitBid_hidesAmountUntilReveal() public {
        uint256 id = _create(BOND);
        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarket.BidSubmitted(id, alice, _commit(id, alice, 7_500e6, "s", "k"), "ipfs://cipher");
        _bid(id, alice, 7_500e6, "s", "k");

        IBlindBidMarket.Bid memory b = market.getBid(id, alice);
        assertEq(b.amount, 0);
        assertEq(b.salt, bytes32(0));
        assertEq(b.docKey, bytes32(0));
        assertEq(b.bond, BOND);
        assertEq(b.committedBlock, block.number);
        assertEq(b.revealedBlock, 0);
        assertEq(market.getTender(id).bidCount, 1);
        assertEq(market.getBidders(id)[0], alice);
        assertEq(market.getBidderTenders(alice)[0], id);
        assertEq(address(market).balance, BOND);
    }

    function test_submitBid_rejects() public {
        uint256 id = _create(BOND);
        bytes32 c = _commit(id, alice, 1, "s", "k");

        vm.deal(buyer, 100 ether);
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.BuyerCannotBid.selector);
        market.submitBid{value: BOND}(id, c, "x");

        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBlindBidMarket.WrongBond.selector, BOND, BOND - 1));
        market.submitBid{value: BOND - 1}(id, c, "x");

        vm.expectRevert(IBlindBidMarket.ZeroCommitment.selector);
        market.submitBid{value: BOND}(id, bytes32(0), "x");

        vm.expectRevert(IBlindBidMarket.EmptyURI.selector);
        market.submitBid{value: BOND}(id, c, "");

        market.submitBid{value: BOND}(id, c, "x");
        vm.expectRevert(IBlindBidMarket.AlreadyBid.selector);
        market.submitBid{value: BOND}(id, c, "x");
        vm.stopPrank();
    }

    function test_submitBid_closedAtDeadline() public {
        uint256 id = _create(0);
        vm.warp(submissionDeadline);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IBlindBidMarket.InvalidState.selector, IBlindBidMarket.TenderState.Reveal)
        );
        market.submitBid(id, bytes32(uint256(1)), "x");
    }

    function test_updateBid_overwritesCommitment() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 9_000e6, "s1", "k1");
        bytes32 c2 = _commit(id, alice, 8_000e6, "s2", "k2");
        vm.prank(alice);
        market.updateBid(id, c2, "ipfs://cipher2");

        IBlindBidMarket.Bid memory b = market.getBid(id, alice);
        assertEq(b.commitment, c2);
        assertEq(b.encryptedDocURI, "ipfs://cipher2");
        assertEq(market.getTender(id).bidCount, 1);

        vm.warp(submissionDeadline);
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        _reveal(id, alice, 9_000e6, "s1", "k1");
        _reveal(id, alice, 8_000e6, "s2", "k2");
    }

    function test_updateBid_requiresExistingBidAndOpen() public {
        uint256 id = _create(0);
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NoBid.selector);
        market.updateBid(id, bytes32(uint256(1)), "x");

        _bid(id, alice, 1, "s", "k");
        vm.warp(submissionDeadline);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IBlindBidMarket.InvalidState.selector, IBlindBidMarket.TenderState.Reveal)
        );
        market.updateBid(id, bytes32(uint256(1)), "x");
    }

    // ───────────── reveal ─────────────

    function test_reveal_happyPath() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500e6, "s", "k");
        vm.warp(submissionDeadline);
        vm.roll(block.number + 10);
        _expectState(id, IBlindBidMarket.TenderState.Reveal);

        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarket.BidRevealed(id, alice, 7_500e6);
        _reveal(id, alice, 7_500e6, "s", "k");

        IBlindBidMarket.Bid memory b = market.getBid(id, alice);
        assertTrue(b.revealed);
        assertEq(b.amount, 7_500e6);
        assertEq(b.salt, bytes32("s"));
        assertEq(b.docKey, bytes32("k"));
        assertEq(b.revealedBlock, block.number);
        assertEq(market.getTender(id).revealedCount, 1);

        vm.expectRevert(IBlindBidMarket.AlreadyRevealed.selector);
        _reveal(id, alice, 7_500e6, "s", "k");
    }

    function test_reveal_cannotReuseAnotherBiddersCommitment() public {
        uint256 id = _create(0);
        _bid(id, alice, 7_500e6, "s", "k");
        // bob copies alice's commitment verbatim
        bytes32 aliceCommitment = market.getBid(id, alice).commitment;
        vm.prank(bob);
        market.submitBid(id, aliceCommitment, "ipfs://copy");

        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500e6, "s", "k");
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        _reveal(id, bob, 7_500e6, "s", "k");
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
        uint256 amount,
        bytes32 salt,
        bytes32 key,
        uint256 badAmount,
        bytes32 badSalt,
        bytes32 badKey
    ) public {
        amount = bound(amount, 1, type(uint128).max);
        badAmount = bound(badAmount, 1, type(uint128).max);
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
        _bid(id, alice, 1_000e6, "s", "k");
        t = early ? bound(t, block.timestamp, submissionDeadline - 1) : bound(t, revealDeadline, type(uint64).max);
        vm.warp(t);
        vm.expectRevert();
        _reveal(id, alice, 1_000e6, "s", "k");
    }

    function testFuzz_reveal_insideWindowSucceeds(uint64 dt) public {
        uint256 id = _create(0);
        _bid(id, alice, 1_000e6, "s", "k");
        vm.warp(submissionDeadline + (dt % REVEAL_WINDOW));
        _reveal(id, alice, 1_000e6, "s", "k");
        assertTrue(market.getBid(id, alice).revealed);
    }

    // ───────────── lifecycle / award ─────────────

    function test_fullLifecycle_award() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500e6, "a", "ka");
        _bid(id, bob, 6_900e6, "b", "kb");
        _bid(id, carol, 8_100e6, "c", "kc"); // will not reveal

        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500e6, "a", "ka");
        _reveal(id, bob, 6_900e6, "b", "kb");

        vm.warp(revealDeadline);
        _expectState(id, IBlindBidMarket.TenderState.Evaluation);

        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.WinnerNotRevealed.selector);
        market.award(id, carol, "ipfs://reason");

        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NotBuyer.selector);
        market.award(id, alice, "ipfs://reason");

        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.EmptyURI.selector);
        market.award(id, bob, "");

        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarket.TenderAwarded(id, bob, 6_900e6, "ipfs://reason");
        vm.prank(buyer);
        market.award(id, bob, "ipfs://reason");

        IBlindBidMarket.Tender memory t = market.getTender(id);
        assertEq(t.winner, bob);
        assertEq(t.reasonURI, "ipfs://reason");
        assertEq(t.awardedBlock, block.number);
        _expectState(id, IBlindBidMarket.TenderState.Awarded);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IBlindBidMarket.InvalidState.selector, IBlindBidMarket.TenderState.Awarded)
        );
        market.award(id, alice, "ipfs://again");
    }

    function test_award_onlyInEvaluation() public {
        uint256 id = _create(0);
        _bid(id, alice, 1, "s", "k");
        vm.warp(submissionDeadline);
        _reveal(id, alice, 1, "s", "k");
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IBlindBidMarket.InvalidState.selector, IBlindBidMarket.TenderState.Reveal)
        );
        market.award(id, alice, "r");
    }

    function test_noRevealedBids_failed() public {
        uint256 id = _create(0);
        _bid(id, alice, 1, "s", "k");
        vm.warp(revealDeadline);
        _expectState(id, IBlindBidMarket.TenderState.Failed);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IBlindBidMarket.InvalidState.selector, IBlindBidMarket.TenderState.Failed)
        );
        market.award(id, alice, "r");
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

        vm.prank(buyer);
        market.cancel(id);
        _expectState(id, IBlindBidMarket.TenderState.Cancelled);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IBlindBidMarket.InvalidState.selector, IBlindBidMarket.TenderState.Cancelled)
        );
        market.submitBid(id, bytes32(uint256(1)), "x");

        uint256 id2 = _create(0);
        _bid(id2, alice, 1, "s", "k");
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.HasBids.selector);
        market.cancel(id2);
    }

    // ───────────── bonds ─────────────

    function test_bond_revealedBidderWithdraws_unrevealedForfeitsToBuyer() public {
        uint256 id = _create(BOND);
        _bid(id, alice, 7_500e6, "a", "ka");
        _bid(id, bob, 6_900e6, "b", "kb");
        _bid(id, carol, 8_100e6, "c", "kc");

        // nothing withdrawable before reveal
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.withdrawBond(id);

        vm.warp(submissionDeadline);
        _reveal(id, alice, 7_500e6, "a", "ka");

        uint256 before = alice.balance;
        vm.prank(alice);
        market.withdrawBond(id);
        assertEq(alice.balance, before + BOND);

        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.withdrawBond(id);

        // forfeits only claimable after revealDeadline
        assertEq(market.forfeitedBonds(id), 0);
        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.claimForfeitedBonds(id);

        vm.warp(revealDeadline);
        assertEq(market.forfeitedBonds(id), 2 * BOND);

        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.NotBuyer.selector);
        market.claimForfeitedBonds(id);

        vm.prank(buyer);
        market.claimForfeitedBonds(id);
        assertEq(buyer.balance, 2 * BOND);
        assertEq(market.forfeitedBonds(id), 0);
        assertEq(address(market).balance, 0);

        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarket.NothingToWithdraw.selector);
        market.claimForfeitedBonds(id);

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
    function testFuzz_bondAccounting(uint8 nBidders, uint8 revealMask, bool claimFirst) public {
        nBidders = uint8(bound(nBidders, 1, 8));
        uint256 id = _create(BOND);
        address[] memory bidders = new address[](nBidders);
        for (uint256 i = 0; i < nBidders; i++) {
            bidders[i] = address(uint160(0x1000 + i));
            vm.deal(bidders[i], BOND);
            _bid(id, bidders[i], i + 1, bytes32(i), bytes32(i + 100));
        }
        vm.warp(submissionDeadline);
        uint256 revealed;
        for (uint256 i = 0; i < nBidders; i++) {
            if ((revealMask >> i) & 1 == 1) {
                _reveal(id, bidders[i], i + 1, bytes32(i), bytes32(i + 100));
                revealed++;
            }
        }
        vm.warp(revealDeadline);
        if (claimFirst && revealed < nBidders) {
            vm.prank(buyer);
            market.claimForfeitedBonds(id);
        }
        for (uint256 i = 0; i < nBidders; i++) {
            if ((revealMask >> i) & 1 == 1) {
                vm.prank(bidders[i]);
                market.withdrawBond(id);
            }
        }
        if (!claimFirst && revealed < nBidders) {
            vm.prank(buyer);
            market.claimForfeitedBonds(id);
        }
        assertEq(address(market).balance, 0);
        assertEq(buyer.balance, BOND * (nBidders - revealed));
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
        market.submitBid{value: address(this).balance}(tenderId, commitment, "ipfs://x");
    }

    function reveal(uint256 amount, bytes32 salt, bytes32 key) external {
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

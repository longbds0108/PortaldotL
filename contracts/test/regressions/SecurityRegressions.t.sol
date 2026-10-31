// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BlindBidMarket} from "../../src/BlindBidMarket.sol";
import {CommitmentLib} from "../../src/CommitmentLib.sol";
import {NFTCommitmentLib} from "../../src/NFTCommitmentLib.sol";
import {PlinthsTestNFT} from "../../src/PlinthsTestNFT.sol";
import {SealedNFTAuction} from "../../src/SealedNFTAuction.sol";
import {IBlindBidMarket} from "../../src/interfaces/IBlindBidMarket.sol";
import {IBlindBidMarketV2} from "../../src/interfaces/IBlindBidMarketV2.sol";
import {ISealedNFTAuction} from "../../src/interfaces/ISealedNFTAuction.sol";
import {ISealedNFTAuctionV2} from "../../src/interfaces/ISealedNFTAuctionV2.sol";
import {BlindBidMarketV2} from "../../src/v2/BlindBidMarketV2.sol";
import {CommitReveal} from "../../src/v2/CommitReveal.sol";
import {SealedNFTAuctionV2} from "../../src/v2/SealedNFTAuctionV2.sol";

/// @notice Each finding in docs/issues/ has two tests. `test_V1_*` passes because the weakness EXISTS in the deployed
///         source. `test_V2_*` passes because the fix rejects the same steps. Local EVM only, nothing is deployed.
contract SecurityRegressions is Test {
    address internal buyer = makeAddr("buyer");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint128 internal constant BUDGET_MIN = 5_000 ether;
    uint128 internal constant BUDGET_MAX = 10_000 ether;
    uint96 internal constant BOND = 10 ether;
    uint64 internal submissionDeadline;
    uint64 internal revealDeadline;
    bytes32 internal constant META = keccak256("metadata");
    bytes32 internal constant DOC = keccak256("cipher");
    bytes32 internal constant REASON = keccak256("reason");
    bytes32 internal constant SALT = keccak256("salt");
    bytes32 internal constant KEY = keccak256("key");
    bytes32 internal constant TENDER_TAG = keccak256("plinths.tender.commit.v2");

    function setUp() public {
        vm.warp(1_750_000_000);
        submissionDeadline = uint64(block.timestamp) + 1 days;
        revealDeadline = submissionDeadline + 1 days;
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
    }

    // ───────────── ISSUE-001: award() ignores the published budget ─────────────

    function _v1BidAndReveal(BlindBidMarket market, uint256 id, address bidder, uint128 amount) internal {
        vm.prank(bidder);
        market.submitBid{value: BOND}(id, CommitmentLib.compute(id, bidder, amount, SALT, KEY), DOC);
        vm.warp(submissionDeadline);
        vm.prank(bidder);
        market.revealBid(id, amount, SALT, KEY);
        vm.warp(revealDeadline);
    }

    function _v2Commit(BlindBidMarketV2 market, uint256 id, address bidder, uint128 amount)
        internal
        view
        returns (bytes32)
    {
        bytes32 payload = keccak256(abi.encode(uint256(amount), keccak256(abi.encodePacked(KEY))));
        return CommitReveal.compute(TENDER_TAG, block.chainid, address(market), id, bidder, payload, SALT);
    }

    function _v2BidAndReveal(BlindBidMarketV2 market, uint256 id, address bidder, uint128 amount) internal {
        vm.prank(bidder);
        market.submitBid{value: BOND}(id, _v2Commit(market, id, bidder, amount), DOC);
        vm.warp(submissionDeadline);
        vm.prank(bidder);
        market.revealBid(id, amount, SALT, KEY);
        vm.warp(revealDeadline);
    }

    function test_V1_award_acceptsBidAboveBudget() public {
        BlindBidMarket market = new BlindBidMarket(treasury);
        vm.prank(buyer);
        uint256 id = market.createTender(META, BUDGET_MIN, BUDGET_MAX, submissionDeadline, revealDeadline, BOND);
        _v1BidAndReveal(market, id, alice, 50_000 ether); // five times the published maximum

        vm.expectEmit(true, true, false, true);
        emit IBlindBidMarket.TenderAwarded(id, alice, 50_000 ether, REASON);
        vm.prank(buyer);
        market.award(id, alice, REASON); // no revert: the weakness is real
    }

    function test_V1_award_acceptsBidBelowBudget() public {
        BlindBidMarket market = new BlindBidMarket(treasury);
        vm.prank(buyer);
        uint256 id = market.createTender(META, BUDGET_MIN, BUDGET_MAX, submissionDeadline, revealDeadline, BOND);
        _v1BidAndReveal(market, id, alice, 1 ether);

        vm.prank(buyer);
        market.award(id, alice, REASON);
    }

    function test_V2_award_rejectsBidAboveBudget() public {
        BlindBidMarketV2 market = new BlindBidMarketV2(treasury);
        vm.prank(buyer);
        uint256 id = market.createTender(META, BUDGET_MIN, BUDGET_MAX, submissionDeadline, revealDeadline, BOND);
        _v2BidAndReveal(market, id, alice, 50_000 ether);

        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarketV2.BidOutOfBudget.selector);
        market.award(id, alice, REASON);
    }

    function test_V2_award_rejectsBidBelowBudget() public {
        BlindBidMarketV2 market = new BlindBidMarketV2(treasury);
        vm.prank(buyer);
        uint256 id = market.createTender(META, BUDGET_MIN, BUDGET_MAX, submissionDeadline, revealDeadline, BOND);
        _v2BidAndReveal(market, id, alice, 1 ether);

        vm.prank(buyer);
        vm.expectRevert(IBlindBidMarketV2.BidOutOfBudget.selector);
        market.award(id, alice, REASON);
    }

    // ───────────── ISSUE-002: commitments are not bound to a chain or contract ─────────────

    function test_V1_commitment_replaysOnAnotherContract() public {
        BlindBidMarket first = new BlindBidMarket(treasury);
        BlindBidMarket second = new BlindBidMarket(treasury);
        vm.startPrank(buyer);
        uint256 id = first.createTender(META, BUDGET_MIN, BUDGET_MAX, submissionDeadline, revealDeadline, BOND);
        assertEq(second.createTender(META, BUDGET_MIN, BUDGET_MAX, submissionDeadline, revealDeadline, BOND), id);
        vm.stopPrank();

        // The same commitment and opening work on both markets, so one reveal also opens the other.
        bytes32 c = CommitmentLib.compute(id, alice, 7_500 ether, SALT, KEY);
        vm.startPrank(alice);
        first.submitBid{value: BOND}(id, c, DOC);
        second.submitBid{value: BOND}(id, c, DOC);
        vm.warp(submissionDeadline);
        first.revealBid(id, 7_500 ether, SALT, KEY);
        second.revealBid(id, 7_500 ether, SALT, KEY); // no revert: the weakness is real
        vm.stopPrank();
    }

    function test_V1_commitment_replaysOnAnotherChain() public {
        bytes32 here = CommitmentLib.compute(0, alice, 7_500 ether, SALT, KEY);
        vm.chainId(1);
        assertEq(CommitmentLib.compute(0, alice, 7_500 ether, SALT, KEY), here);
    }

    function test_V2_commitment_rejectedOnAnotherContract() public {
        BlindBidMarketV2 first = new BlindBidMarketV2(treasury);
        BlindBidMarketV2 second = new BlindBidMarketV2(treasury);
        vm.startPrank(buyer);
        uint256 id = first.createTender(META, BUDGET_MIN, BUDGET_MAX, submissionDeadline, revealDeadline, BOND);
        second.createTender(META, BUDGET_MIN, BUDGET_MAX, submissionDeadline, revealDeadline, BOND);
        vm.stopPrank();

        bytes32 c = _v2Commit(first, id, alice, 7_500 ether);
        vm.startPrank(alice);
        first.submitBid{value: BOND}(id, c, DOC);
        second.submitBid{value: BOND}(id, c, DOC); // accepted: a commitment is opaque until it is opened
        vm.warp(submissionDeadline);
        first.revealBid(id, 7_500 ether, SALT, KEY);
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        second.revealBid(id, 7_500 ether, SALT, KEY);
        vm.stopPrank();
    }

    function test_V2_commitment_rejectedOnAnotherChain() public {
        BlindBidMarketV2 market = new BlindBidMarketV2(treasury);
        vm.prank(buyer);
        uint256 id = market.createTender(META, BUDGET_MIN, BUDGET_MAX, submissionDeadline, revealDeadline, BOND);
        bytes32 c = _v2Commit(market, id, alice, 7_500 ether);
        vm.prank(alice);
        market.submitBid{value: BOND}(id, c, DOC);

        vm.warp(submissionDeadline);
        vm.chainId(block.chainid + 1); // what the same contract address would compute on another chain
        vm.prank(alice);
        vm.expectRevert(IBlindBidMarket.CommitmentMismatch.selector);
        market.revealBid(id, 7_500 ether, SALT, KEY);
    }

    // ───────────── ISSUE-003: anyone can create an auction for a token that never arrived ─────────────

    function _listing() internal view returns (bytes memory) {
        return abi.encode(uint256(1 ether), uint64(submissionDeadline), uint64(revealDeadline));
    }

    function test_V1_phantomListing_trapsTheWinnersMoney() public {
        SealedNFTAuction auction = new SealedNFTAuction(treasury);
        address scammer = makeAddr("scammer"); // has no code and no token
        vm.prank(scammer);
        auction.onERC721Received(scammer, scammer, 1, _listing()); // accepted without any transfer

        bytes32 c = NFTCommitmentLib.compute(0, alice, 2 ether, SALT);
        vm.prank(alice);
        auction.placeBid{value: 3 ether}(0, c);
        vm.warp(submissionDeadline);
        vm.prank(alice);
        auction.revealBid(0, 2 ether, SALT);
        vm.warp(revealDeadline);

        // settle can never succeed, so the winning price stays locked in the contract for good.
        vm.expectRevert();
        auction.settle(0);
        vm.prank(alice);
        auction.withdraw(0);
        assertEq(address(auction).balance, 2 ether, "winning price is stranded");
        vm.prank(scammer);
        vm.expectRevert(ISealedNFTAuction.NothingToWithdraw.selector);
        auction.withdraw(0);
    }

    function test_V2_phantomListing_rejectedFromAccountWithoutCode() public {
        SealedNFTAuctionV2 auction = new SealedNFTAuctionV2(treasury);
        address scammer = makeAddr("scammer");
        vm.prank(scammer);
        vm.expectRevert();
        auction.onERC721Received(scammer, scammer, 1, _listing());
    }

    function test_V2_phantomListing_rejectedWhenTokenIsNotInEscrow() public {
        SealedNFTAuctionV2 auction = new SealedNFTAuctionV2(treasury);
        PlinthsTestNFT nft = new PlinthsTestNFT(); // this test contract owns the tokens
        vm.prank(address(nft));
        vm.expectRevert(ISealedNFTAuctionV2.NftNotEscrowed.selector);
        auction.onERC721Received(address(this), address(this), 1, _listing());
    }

    function test_V2_listing_rejectsZeroSeller() public {
        SealedNFTAuctionV2 auction = new SealedNFTAuctionV2(treasury);
        PlinthsTestNFT nft = new PlinthsTestNFT();
        nft.transferFrom(address(this), address(auction), 1);
        vm.prank(address(nft));
        vm.expectRevert(ISealedNFTAuction.InvalidListingData.selector);
        auction.onERC721Received(address(0), address(0), 1, _listing());
    }
}

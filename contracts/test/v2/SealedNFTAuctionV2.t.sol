// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SealedNFTAuctionV2} from "../../src/v2/SealedNFTAuctionV2.sol";
import {CommitReveal} from "../../src/v2/CommitReveal.sol";
import {ISealedNFTAuction} from "../../src/interfaces/ISealedNFTAuction.sol";
import {PlinthsTestNFT} from "../../src/PlinthsTestNFT.sol";
import {AuctionV2Probe} from "./Harnesses.sol";

/// @dev Same scenarios as test/SealedNFTAuction.t.sol, run against V2 with the V2 commitment.
/// @dev Tries to re-enter withdraw when it receives tPOTv3.
contract ReentrantV2AuctionBidder {
    SealedNFTAuctionV2 internal immutable auction;
    uint256 internal id;
    bool internal reentered;

    constructor(SealedNFTAuctionV2 a) {
        auction = a;
    }

    function bid(uint256 id_, bytes32 c) external payable {
        id = id_;
        auction.placeBid{value: msg.value}(id_, c);
    }

    function reveal(uint112 amount, bytes32 salt) external {
        auction.revealBid(id, amount, salt);
    }

    function pull() external {
        auction.withdraw(id);
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            try auction.withdraw(id) {
                revert("re-entered");
            } catch {}
        }
    }
}

contract SealedNFTAuctionV2Test is Test {
    AuctionV2Probe internal auction;
    PlinthsTestNFT internal nft;

    address internal seller = makeAddr("seller");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint64 internal constant BID_WINDOW = 2 days;
    uint64 internal constant REVEAL_WINDOW = 1 days;
    uint256 internal constant RESERVE = 5 ether;
    bytes32 internal constant TAG = keccak256("plinths.nft-auction.commit.v2");

    uint64 internal bidDeadline;
    uint64 internal revealDeadline;

    function setUp() public {
        vm.warp(1_750_000_000);
        auction = new AuctionV2Probe(treasury);
        vm.prank(seller);
        nft = new PlinthsTestNFT(); // ids 1..3 owned by seller
        bidDeadline = uint64(block.timestamp) + BID_WINDOW;
        revealDeadline = bidDeadline + REVEAL_WINDOW;
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
        vm.deal(carol, 1_000 ether);
        vm.deal(seller, 1_000 ether);
    }

    // ───────────── helpers ─────────────

    function _data(uint256 reserve, uint64 bd, uint64 rd) internal pure returns (bytes memory) {
        return abi.encode(reserve, bd, rd);
    }

    function _list(uint256 tokenId) internal returns (uint256 id) {
        id = auction.auctionCount();
        vm.prank(seller);
        nft.safeTransferFrom(seller, address(auction), tokenId, _data(RESERVE, bidDeadline, revealDeadline));
    }

    function _commit(uint256 id, address bidder, uint256 amount, bytes32 salt) internal view returns (bytes32) {
        bytes32 payload = keccak256(abi.encode(amount));
        return CommitReveal.compute(TAG, block.chainid, address(auction), id, bidder, payload, salt);
    }

    function _bid(uint256 id, address bidder, uint112 amount, uint256 deposit, bytes32 salt) internal {
        vm.prank(bidder);
        auction.placeBid{value: deposit}(id, _commit(id, bidder, amount, salt));
    }

    function _reveal(uint256 id, address bidder, uint112 amount, bytes32 salt) internal {
        vm.prank(bidder);
        auction.revealBid(id, amount, salt);
    }

    // ───────────── storage layout (web/lib/nft-storage.ts) ─────────────

    uint256 internal constant AUCTIONS_SLOT = 0; // Auction[]
    uint256 internal constant BIDS_SLOT = 1; // mapping(uint256 => mapping(address => Bid))
    uint256 internal constant AUCTION_WORDS = 5;

    function test_storageLayoutMatchesApp() public {
        _list(1);
        uint256 id = _list(2);
        _bid(id, alice, 7 ether, 9 ether, "s");
        vm.warp(bidDeadline);
        _reveal(id, alice, 7 ether, "s");
        vm.warp(revealDeadline);
        auction.settle(id);
        vm.prank(seller);
        auction.withdraw(id);

        assertEq(uint256(vm.load(address(auction), bytes32(AUCTIONS_SLOT))), 2);

        uint256 base = uint256(keccak256(abi.encode(AUCTIONS_SLOT))) + id * AUCTION_WORDS;
        uint256[5] memory w;
        for (uint256 i; i < 5; i++) w[i] = uint256(vm.load(address(auction), bytes32(base + i)));
        ISealedNFTAuction.Auction memory a = auction.auction(id);
        assertEq(address(uint160(w[0])), a.seller);
        assertEq(uint64(w[0] >> 160), a.bidDeadline);
        assertEq(uint32(w[0] >> 224), a.bidCount);
        assertEq(address(uint160(w[1])), a.collection);
        assertEq(uint64(w[1] >> 160), a.revealDeadline);
        assertEq(uint32(w[1] >> 224), a.revealedCount);
        assertEq(w[2], a.tokenId);
        assertEq(address(uint160(w[3])), a.highestBidder);
        assertEq(uint64(w[3] >> 160), a.createdBlock);
        assertEq(uint8(w[3] >> 224) == 1, a.settled);
        assertEq(uint8(w[3] >> 232) == 1, a.cancelled);
        assertEq(uint8(w[3] >> 240) == 1, a.proceedsPaid);
        assertEq(uint128(w[4]), a.reservePrice);
        assertEq(uint128(w[4] >> 128), a.highestBid);
        assertTrue(a.settled && a.proceedsPaid && a.highestBidder == alice);

        bytes32 inner = keccak256(abi.encode(id, BIDS_SLOT));
        uint256 bBase = uint256(keccak256(abi.encode(alice, inner)));
        uint256 b1 = uint256(vm.load(address(auction), bytes32(bBase + 1)));
        ISealedNFTAuction.Bid memory b = auction.bid(id, alice);
        assertEq(vm.load(address(auction), bytes32(bBase)), b.commitment);
        assertEq(uint112(b1), b.deposit);
        assertEq(uint112(b1 >> 112), b.amount);
        assertEq(uint8(b1 >> 224) == 1, b.revealed);
        assertEq(uint8(b1 >> 232) == 1, b.withdrawn);
    }

    // ───────────── listing ─────────────

    function test_list_escrowsNftAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit ISealedNFTAuction.AuctionCreated(0, seller, address(nft), 2, RESERVE, bidDeadline, revealDeadline);
        uint256 id = _list(2);
        assertEq(nft.ownerOf(2), address(auction));
        ISealedNFTAuction.Auction memory a = auction.auction(id);
        assertEq(a.seller, seller);
        assertEq(a.collection, address(nft));
        assertEq(a.tokenId, 2);
        assertEq(a.reservePrice, RESERVE);
        assertEq(a.createdBlock, block.number);
        assertEq(uint8(auction.state(id)), uint8(ISealedNFTAuction.AuctionState.Open));
    }

    function test_list_rejectsBadData() public {
        vm.startPrank(seller);
        vm.expectRevert(); // malformed data: the hook reverts, so the transfer reverts
        nft.safeTransferFrom(seller, address(auction), 1, hex"1234");
        vm.expectRevert();
        nft.safeTransferFrom(seller, address(auction), 1, _data(RESERVE, uint64(block.timestamp), revealDeadline));
        vm.expectRevert();
        nft.safeTransferFrom(seller, address(auction), 1, _data(RESERVE, bidDeadline, bidDeadline + 1 days - 1));
        vm.expectRevert();
        nft.safeTransferFrom(seller, address(auction), 1, _data(uint256(type(uint112).max) + 1, bidDeadline, revealDeadline));
        vm.stopPrank();
        assertEq(nft.ownerOf(1), seller);
        assertEq(auction.auctionCount(), 0);
    }

    function test_hook_directCallErrors() public {
        vm.expectRevert(ISealedNFTAuction.InvalidListingData.selector);
        auction.onERC721Received(address(0), seller, 1, "");
        vm.expectRevert(ISealedNFTAuction.InvalidDeadlines.selector);
        auction.onERC721Received(address(0), seller, 1, _data(0, uint64(block.timestamp), revealDeadline));
    }

    function test_unknownAuctionReverts() public {
        vm.expectRevert(ISealedNFTAuction.AuctionNotFound.selector);
        auction.settle(0);
        vm.expectRevert(ISealedNFTAuction.AuctionNotFound.selector);
        auction.withdraw(0);
        vm.expectRevert(ISealedNFTAuction.AuctionNotFound.selector);
        auction.placeBid{value: 0}(0, "c");
    }

    function test_constructor_rejectsZeroTreasury() public {
        vm.expectRevert(ISealedNFTAuction.ZeroTreasury.selector);
        new SealedNFTAuctionV2(address(0));
    }

    // ───────────── bidding ─────────────

    function test_placeBid_hidesAmount() public {
        uint256 id = _list(1);
        bytes32 c = _commit(id, alice, 7 ether, "s");
        vm.expectEmit(true, true, false, true);
        emit ISealedNFTAuction.BidPlaced(id, alice, c, 20 ether, true);
        vm.prank(alice);
        auction.placeBid{value: 20 ether}(id, c);
        ISealedNFTAuction.Bid memory b = auction.bid(id, alice);
        assertEq(b.amount, 0);
        assertEq(b.deposit, 20 ether);
        assertEq(auction.auction(id).bidCount, 1);
    }

    function test_placeBid_rejects() public {
        uint256 id = _list(1);
        vm.prank(seller);
        vm.expectRevert(ISealedNFTAuction.SellerCannotBid.selector);
        auction.placeBid{value: 1 ether}(id, "c");
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.ZeroCommitment.selector);
        auction.placeBid{value: 1 ether}(id, bytes32(0));
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.ZeroDeposit.selector);
        auction.placeBid(id, "c");
        vm.warp(bidDeadline);
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.InvalidState.selector);
        auction.placeBid{value: 1 ether}(id, "c");
    }

    function test_placeBid_againReplacesAndTopsUp() public {
        uint256 id = _list(1);
        _bid(id, alice, 7 ether, 10 ether, "s1");
        bytes32 c2 = _commit(id, alice, 12 ether, "s2");
        vm.expectEmit(true, true, false, true);
        emit ISealedNFTAuction.BidPlaced(id, alice, c2, 15 ether, false);
        vm.prank(alice);
        auction.placeBid{value: 5 ether}(id, c2);
        ISealedNFTAuction.Bid memory b = auction.bid(id, alice);
        assertEq(b.commitment, c2);
        assertEq(b.deposit, 15 ether);
        assertEq(auction.auction(id).bidCount, 1);

        vm.prank(alice);
        auction.placeBid(id, c2); // replacing without a top-up is fine
        vm.warp(bidDeadline);
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.CommitmentMismatch.selector);
        auction.revealBid(id, 7 ether, "s1");
        _reveal(id, alice, 12 ether, "s2");
    }

    // ───────────── reveal ─────────────

    function test_reveal_highestCountedWins_tieKeepsEarlier() public {
        uint256 id = _list(1);
        _bid(id, alice, 8 ether, 10 ether, "a");
        _bid(id, bob, 8 ether, 10 ether, "b");
        _bid(id, carol, 9 ether, 8 ether, "c"); // bids more than it deposited: not counted
        vm.warp(bidDeadline);
        _reveal(id, alice, 8 ether, "a");
        _reveal(id, bob, 8 ether, "b");
        vm.expectEmit(true, true, false, true);
        emit ISealedNFTAuction.BidRevealed(id, carol, 9 ether, "c", false);
        _reveal(id, carol, 9 ether, "c");
        ISealedNFTAuction.Auction memory a = auction.auction(id);
        assertEq(a.highestBidder, alice);
        assertEq(a.highestBid, 8 ether);
        assertEq(a.revealedCount, 3);
    }

    function test_reveal_belowReserveNotCounted() public {
        uint256 id = _list(1);
        _bid(id, alice, 4 ether, 10 ether, "a");
        vm.warp(bidDeadline);
        _reveal(id, alice, 4 ether, "a");
        assertEq(auction.auction(id).highestBidder, address(0));
        vm.warp(revealDeadline);
        assertEq(uint8(auction.state(id)), uint8(ISealedNFTAuction.AuctionState.NoSale));
    }

    function test_reveal_rejects() public {
        uint256 id = _list(1);
        _bid(id, alice, 7 ether, 10 ether, "a");
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.InvalidState.selector); // still Open
        auction.revealBid(id, 7 ether, "a");
        vm.warp(bidDeadline);
        vm.prank(bob);
        vm.expectRevert(ISealedNFTAuction.NoBid.selector);
        auction.revealBid(id, 7 ether, "a");
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.ZeroAmount.selector);
        auction.revealBid(id, 0, "a");
        _reveal(id, alice, 7 ether, "a");
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.AlreadyRevealed.selector);
        auction.revealBid(id, 7 ether, "a");
        vm.warp(revealDeadline);
        vm.prank(bob);
        vm.expectRevert(ISealedNFTAuction.InvalidState.selector);
        auction.revealBid(id, 7 ether, "a");
    }

    function test_reveal_cannotReuseAnotherBiddersCommitment() public {
        uint256 id = _list(1);
        bytes32 c = _commit(id, alice, 7 ether, "a");
        vm.prank(alice);
        auction.placeBid{value: 10 ether}(id, c);
        vm.prank(bob);
        auction.placeBid{value: 10 ether}(id, c);
        vm.warp(bidDeadline);
        vm.prank(bob);
        vm.expectRevert(ISealedNFTAuction.CommitmentMismatch.selector);
        auction.revealBid(id, 7 ether, "a");
    }

    function testFuzz_reveal_wrongOpeningReverts(uint112 amount, bytes32 salt, uint112 badAmount, bytes32 badSalt)
        public
    {
        vm.assume(amount > 0 && badAmount > 0);
        vm.assume(amount != badAmount || salt != badSalt);
        uint256 id = _list(1);
        _bid(id, alice, amount, 1 ether, salt);
        vm.warp(bidDeadline);
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.CommitmentMismatch.selector);
        auction.revealBid(id, badAmount, badSalt);
    }

    // ───────────── settle + payouts ─────────────

    function test_fullLifecycle_sale() public {
        uint256 id = _list(3);
        _bid(id, alice, 7 ether, 10 ether, "a");
        _bid(id, bob, 9 ether, 12 ether, "b");
        _bid(id, carol, 20 ether, 25 ether, "c"); // never reveals
        vm.warp(bidDeadline);
        _reveal(id, alice, 7 ether, "a");
        _reveal(id, bob, 9 ether, "b");

        // alice is outbid: her deposit is free during the reveal phase already
        uint256 before = alice.balance;
        vm.prank(alice);
        auction.withdraw(id);
        assertEq(alice.balance - before, 10 ether);
        // the leader and the non-revealer wait for the reveal deadline
        vm.prank(bob);
        vm.expectRevert(ISealedNFTAuction.NothingToWithdraw.selector);
        auction.withdraw(id);
        vm.prank(carol);
        vm.expectRevert(ISealedNFTAuction.NothingToWithdraw.selector);
        auction.withdraw(id);
        vm.expectRevert(ISealedNFTAuction.InvalidState.selector);
        auction.settle(id);

        vm.warp(revealDeadline);
        assertEq(uint8(auction.state(id)), uint8(ISealedNFTAuction.AuctionState.Settlement));
        // seller cannot take proceeds before settlement
        vm.prank(seller);
        vm.expectRevert(ISealedNFTAuction.NothingToWithdraw.selector);
        auction.withdraw(id);

        vm.expectEmit(true, true, false, true);
        emit ISealedNFTAuction.AuctionSettled(id, bob, 9 ether);
        vm.prank(carol); // anyone can settle
        auction.settle(id);
        assertEq(nft.ownerOf(3), bob);
        assertEq(uint8(auction.state(id)), uint8(ISealedNFTAuction.AuctionState.Settled));
        vm.expectRevert(ISealedNFTAuction.InvalidState.selector);
        auction.settle(id);

        before = seller.balance;
        vm.prank(seller);
        auction.withdraw(id);
        assertEq(seller.balance - before, 9 ether);
        vm.prank(seller);
        vm.expectRevert(ISealedNFTAuction.NothingToWithdraw.selector);
        auction.withdraw(id);

        before = bob.balance;
        vm.prank(bob);
        auction.withdraw(id);
        assertEq(bob.balance - before, 3 ether); // 12 deposit - 9 paid

        before = carol.balance;
        vm.prank(carol);
        auction.withdraw(id);
        assertEq(carol.balance - before, 22.5 ether); // 10% penalty
        assertEq(treasury.balance, 2.5 ether);

        vm.prank(carol);
        vm.expectRevert(ISealedNFTAuction.NothingToWithdraw.selector);
        auction.withdraw(id);
        assertEq(address(auction).balance, 0);
    }

    function test_noSale_returnsNftToSeller() public {
        uint256 id = _list(1);
        _bid(id, alice, 7 ether, 10 ether, "a"); // never reveals
        vm.warp(revealDeadline);
        assertEq(uint8(auction.state(id)), uint8(ISealedNFTAuction.AuctionState.NoSale));
        auction.settle(id);
        assertEq(nft.ownerOf(1), seller);
        vm.expectRevert(ISealedNFTAuction.InvalidState.selector);
        auction.settle(id);
        vm.prank(seller);
        vm.expectRevert(ISealedNFTAuction.NothingToWithdraw.selector);
        auction.withdraw(id);
    }

    function test_cancel_onlySellerOnlyOpenWithoutBids() public {
        uint256 id = _list(1);
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.NotSeller.selector);
        auction.settle(id);

        vm.expectEmit(true, false, false, false);
        emit ISealedNFTAuction.AuctionCancelled(id);
        vm.prank(seller);
        auction.settle(id);
        assertEq(nft.ownerOf(1), seller);
        assertEq(uint8(auction.state(id)), uint8(ISealedNFTAuction.AuctionState.Cancelled));
        vm.prank(seller);
        vm.expectRevert(ISealedNFTAuction.InvalidState.selector);
        auction.settle(id);

        uint256 id2 = _list(2);
        _bid(id2, alice, 7 ether, 10 ether, "a");
        vm.prank(seller);
        vm.expectRevert(ISealedNFTAuction.HasBids.selector);
        auction.settle(id2);
    }

    function test_withdraw_reentrancySafe() public {
        uint256 id = _list(1);
        ReentrantV2AuctionBidder r = new ReentrantV2AuctionBidder(auction);
        vm.deal(address(r), 0);
        r.bid{value: 10 ether}(id, _commit(id, address(r), 6 ether, "r"));
        _bid(id, alice, 8 ether, 10 ether, "a");
        vm.warp(bidDeadline);
        r.reveal(6 ether, "r");
        _reveal(id, alice, 8 ether, "a");
        r.pull(); // outbid: gets 10 back once, the nested withdraw reverts
        assertEq(address(r).balance, 10 ether);
    }

    /// Whatever happens, the contract ends with exactly zero after everyone withdraws.
    function testFuzz_accountingBalancesToZero(uint8 revealMask, uint64[3] memory amounts, uint64[3] memory extra)
        public
    {
        uint256 id = _list(1);
        address[3] memory bidders = [alice, bob, carol];
        for (uint256 i; i < 3; i++) {
            uint112 amt = uint112(bound(amounts[i], 1, 100 ether));
            uint256 dep = uint256(amt) + bound(extra[i], 0, 50 ether);
            if (i == 2) dep = bound(extra[i], 1, 100 ether); // may deposit less than it bids
            _bid(id, bidders[i], amt, dep, bytes32(i + 1));
        }
        vm.warp(bidDeadline);
        for (uint256 i; i < 3; i++) {
            if (revealMask & (1 << i) != 0) {
                uint112 amt = uint112(bound(amounts[i], 1, 100 ether));
                _reveal(id, bidders[i], amt, bytes32(i + 1));
            }
        }
        vm.warp(revealDeadline);
        auction.settle(id);
        address winner = auction.auction(id).highestBidder;
        assertEq(nft.ownerOf(1), winner == address(0) ? seller : winner);
        if (winner != address(0)) {
            vm.prank(seller);
            auction.withdraw(id);
        }
        for (uint256 i; i < 3; i++) {
            vm.prank(bidders[i]);
            auction.withdraw(id);
        }
        assertEq(address(auction).balance, 0);
    }

    // ───────────── V2 only ─────────────

    function test_commitmentMatchesSharedVectors() public view {
        string memory json = vm.readFile("test/fixtures/commitment-v2-vectors.json");
        assertEq(vm.parseJsonBytes32(json, ".auctionDomainTag"), TAG);
        assertEq(auction.COMMITMENT_DOMAIN(), TAG);
        for (uint256 i; i < 3; i++) {
            string memory p = string.concat(".auction[", vm.toString(i), "]");
            bytes32 payload = keccak256(abi.encode(vm.parseUint(vm.parseJsonString(json, string.concat(p, ".amount")))));
            assertEq(payload, vm.parseJsonBytes32(json, string.concat(p, ".payloadHash")));
            assertEq(
                CommitReveal.compute(
                    TAG,
                    vm.parseUint(vm.parseJsonString(json, string.concat(p, ".chainId"))),
                    vm.parseJsonAddress(json, string.concat(p, ".contract")),
                    vm.parseUint(vm.parseJsonString(json, string.concat(p, ".auctionId"))),
                    vm.parseJsonAddress(json, string.concat(p, ".bidder")),
                    payload,
                    vm.parseJsonBytes32(json, string.concat(p, ".salt"))
                ),
                vm.parseJsonBytes32(json, string.concat(p, ".commitment"))
            );
        }
    }

    function test_reveal_rejectsCommitmentFromAnotherContract() public {
        uint256 id = _list(1);
        AuctionV2Probe other = new AuctionV2Probe(treasury);
        bytes32 payload = keccak256(abi.encode(uint256(RESERVE)));
        bytes32 foreign = CommitReveal.compute(TAG, block.chainid, address(other), id, alice, payload, "s");
        vm.prank(alice);
        auction.placeBid{value: RESERVE}(id, foreign);
        vm.warp(bidDeadline);
        vm.prank(alice);
        vm.expectRevert(ISealedNFTAuction.CommitmentMismatch.selector);
        auction.revealBid(id, uint112(RESERVE), "s");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Test} from "forge-std/Test.sol";
import {NFTCommitmentLib} from "../../src/NFTCommitmentLib.sol";
import {ISealedNFTAuction} from "../../src/interfaces/ISealedNFTAuction.sol";
import {CommitReveal} from "../../src/v2/CommitReveal.sol";
import {AuctionV1Probe, AuctionV2Probe, IAuctionProbe} from "../v2/Harnesses.sol";

contract MintableNFT is ERC721("Invariant", "INV") {
    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

/// @dev Random calls from several actors against an auction. See MarketHandler for the conventions.
abstract contract AuctionHandler is Test {
    IAuctionProbe public immutable auction;
    MintableNFT public immutable nft;
    address public immutable treasury;

    address[] internal sellers;
    address[] internal bidders;
    address internal stranger = makeAddr("stranger");
    uint256 internal nextToken = 1;

    /// Few auctions, so the random actors keep colliding on the same ones and sequences reach late phases.
    uint256 internal constant MAX_AUCTIONS = 2;

    uint256 public ghost_in;
    uint256 public ghost_out;
    uint256 public ghost_penalties;
    uint256 public ghost_donated;
    uint256 public ghost_violations;

    mapping(uint256 => mapping(address => uint112)) internal sealedAmount;
    mapping(uint256 => mapping(address => bytes32)) internal sealedSalt;
    mapping(uint256 => mapping(address => uint256)) public ghost_withdrawals;
    mapping(uint256 => uint256) public ghost_sellerWithdrawals;
    mapping(uint256 => uint256) public ghost_settles;
    /// Highest counted amount, recomputed here from each reveal instead of read from the contract.
    mapping(uint256 => uint256) public ghost_best;
    mapping(uint256 => address) public ghost_bestBidder;

    constructor(IAuctionProbe auction_, address treasury_) {
        auction = auction_;
        treasury = treasury_;
        nft = new MintableNFT();
        sellers.push(makeAddr("seller0"));
        sellers.push(makeAddr("seller1"));
        bidders.push(makeAddr("bidder0"));
        bidders.push(makeAddr("bidder1"));
        bidders.push(makeAddr("bidder2"));
        bidders.push(makeAddr("bidder3"));
        for (uint256 i; i < bidders.length; i++) vm.deal(bidders[i], 1_000_000 ether);
        for (uint256 i; i < sellers.length; i++) vm.deal(sellers[i], 0);
    }

    function _commit(uint256 id, address bidder, uint112 amount, bytes32 salt) internal view virtual returns (bytes32);

    function bidderCount() external view returns (uint256) {
        return bidders.length;
    }

    function bidderAt(uint256 i) external view returns (address) {
        return bidders[i];
    }

    function _bidder(uint256 seed) internal view returns (address) {
        return bidders[seed % bidders.length];
    }

    function _pick(uint256 seed) internal view returns (bool, uint256) {
        uint256 n = auction.auctionCount();
        return n == 0 ? (false, 0) : (true, seed % n);
    }

    function list(uint256 sellerSeed, uint64 reserve, uint32 window) external {
        if (auction.auctionCount() >= MAX_AUCTIONS) return;
        address seller = sellers[sellerSeed % sellers.length];
        uint256 id = nextToken++;
        nft.mint(seller, id);
        uint64 bidDeadline = uint64(block.timestamp) + uint64(bound(window, 1 hours, 3 days));
        bytes memory data = abi.encode(uint256(bound(reserve, 0, 100 ether)), bidDeadline, bidDeadline + 1 days);
        vm.prank(seller);
        nft.safeTransferFrom(seller, address(auction), id, data);
    }

    function placeBid(uint256 auctionSeed, uint256 bidderSeed, uint112 amount, uint96 extra, bytes32 salt) external {
        (bool ok, uint256 id) = _pick(auctionSeed);
        if (!ok) return;
        address who = _bidder(bidderSeed);
        amount = uint112(bound(amount, 1, 200 ether));
        // Sometimes under-deposit, so reveals that cannot count are exercised as well.
        uint256 deposit = bound(extra, 1, 250 ether);
        bytes32 c = _commit(id, who, amount, salt);
        vm.prank(who);
        auction.placeBid{value: deposit}(id, c);
        sealedAmount[id][who] = amount;
        sealedSalt[id][who] = salt;
        ghost_in += deposit;
    }

    function revealBid(uint256 auctionSeed, uint256 bidderSeed) external {
        (bool ok, uint256 id) = _pick(auctionSeed);
        if (!ok) return;
        address who = _bidder(bidderSeed);
        uint112 amount = sealedAmount[id][who];
        vm.prank(who);
        auction.revealBid(id, amount, sealedSalt[id][who]);
        ISealedNFTAuction.Auction memory a = auction.auction(id);
        if (amount >= a.reservePrice && amount <= auction.bid(id, who).deposit && amount > ghost_best[id]) {
            ghost_best[id] = amount;
            ghost_bestBidder[id] = who;
        }
    }

    function settle(uint256 auctionSeed) external {
        (bool ok, uint256 id) = _pick(auctionSeed);
        if (!ok) return;
        ISealedNFTAuction.AuctionState s = auction.state(id);
        // While Open, settle means "the seller cancels".
        vm.prank(s == ISealedNFTAuction.AuctionState.Open ? auction.auction(id).seller : stranger);
        auction.settle(id);
        ghost_settles[id]++;
    }

    function withdrawBidder(uint256 auctionSeed, uint256 bidderSeed) external {
        (bool ok, uint256 id) = _pick(auctionSeed);
        if (!ok) return;
        address who = _bidder(bidderSeed);
        uint256 before = who.balance;
        uint256 treasuryBefore = treasury.balance;
        vm.prank(who);
        auction.withdraw(id);
        ghost_out += who.balance - before;
        ghost_penalties += treasury.balance - treasuryBefore;
        ghost_withdrawals[id][who]++;
    }

    function withdrawSeller(uint256 auctionSeed) external {
        (bool ok, uint256 id) = _pick(auctionSeed);
        if (!ok) return;
        address seller = auction.auction(id).seller;
        uint256 before = seller.balance;
        vm.prank(seller);
        auction.withdraw(id);
        ghost_out += seller.balance - before;
        ghost_sellerWithdrawals[id]++;
    }

    function warp(uint32 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 8 hours));
    }

    function donate(uint64 wei_) external {
        vm.deal(address(auction), address(auction).balance + wei_);
        ghost_donated += wei_;
    }

    /// One entry point for all attacks, so ordinary protocol calls dominate the random mix.
    function attack(uint256 kind, uint256 auctionSeed, uint256 bidderSeed, bytes32 badSalt) external {
        (bool ok, uint256 id) = _pick(auctionSeed);
        if (!ok) return;
        address who = _bidder(bidderSeed);
        kind %= 4;
        if (kind == 0) {
            vm.assume(badSalt != sealedSalt[id][who]);
            vm.prank(who);
            try auction.revealBid(id, sealedAmount[id][who], badSalt) {
                ghost_violations++;
            } catch {}
        } else if (kind == 1) {
            vm.prank(stranger);
            try auction.withdraw(id) {
                ghost_violations++;
            } catch {}
        } else if (kind == 2) {
            if (auction.state(id) != ISealedNFTAuction.AuctionState.Open) return;
            vm.prank(stranger);
            try auction.settle(id) {
                ghost_violations++;
            } catch {}
        } else {
            address seller = auction.auction(id).seller;
            vm.deal(seller, seller.balance + 1 ether);
            vm.prank(seller);
            try auction.placeBid{value: 1 ether}(id, "c") {
                ghost_violations++;
            } catch {}
            // Keep seller.balance a clean record of proceeds.
            vm.deal(seller, seller.balance - 1 ether);
        }
    }
}

contract AuctionV1Handler is AuctionHandler {
    constructor(IAuctionProbe a, address t) AuctionHandler(a, t) {}

    function _commit(uint256 id, address bidder, uint112 amount, bytes32 salt)
        internal
        pure
        override
        returns (bytes32)
    {
        return NFTCommitmentLib.compute(id, bidder, amount, salt);
    }
}

contract AuctionV2Handler is AuctionHandler {
    constructor(IAuctionProbe a, address t) AuctionHandler(a, t) {}

    function _commit(uint256 id, address bidder, uint112 amount, bytes32 salt)
        internal
        view
        override
        returns (bytes32)
    {
        return CommitReveal.compute(
            keccak256("plinths.nft-auction.commit.v2"),
            block.chainid,
            address(auction),
            id,
            bidder,
            keccak256(abi.encode(uint256(amount))),
            salt
        );
    }
}

abstract contract AuctionInvariantsBase is Test {
    IAuctionProbe internal auction;
    AuctionHandler internal handler;
    address internal treasury = makeAddr("treasury");

    function _target(AuctionHandler h) internal {
        handler = h;
        targetContract(address(h));
    }

    /// Exact bookkeeping: every wei is an unpaid deposit, unpaid proceeds, or an unclaimable donation.
    function invariant_balanceEqualsLedger() public view {
        assertEq(
            address(auction).balance,
            handler.ghost_in() + handler.ghost_donated() - handler.ghost_out() - handler.ghost_penalties()
        );
    }

    /// Solvency, computed from contract state alone: the balance is exactly what is owed, plus donations nobody can
    /// claim. A winner's deposit covers both their change and the seller's price until each has been paid.
    function invariant_liabilitiesAreCovered() public view {
        uint256 owed;
        uint256 n = auction.auctionCount();
        for (uint256 id; id < n; id++) {
            ISealedNFTAuction.Auction memory a = auction.auction(id);
            for (uint256 i; i < handler.bidderCount(); i++) {
                address who = handler.bidderAt(i);
                ISealedNFTAuction.Bid memory b = auction.bid(id, who);
                if (who == a.highestBidder) {
                    if (!b.withdrawn) owed += b.deposit - a.highestBid;
                    if (!a.proceedsPaid) owed += a.highestBid;
                } else if (!b.withdrawn) {
                    owed += b.deposit;
                }
            }
        }
        assertEq(address(auction).balance, owed + handler.ghost_donated());
    }

    function invariant_treasuryOnlyGetsPenalties() public view {
        assertEq(treasury.balance, handler.ghost_penalties());
    }

    function invariant_forbiddenCallsNeverSucceed() public view {
        assertEq(handler.ghost_violations(), 0);
    }

    /// NFT custody is checked apart from money: the token sits exactly where the auction's state says it should.
    function invariant_nftCustody() public view {
        uint256 n = auction.auctionCount();
        for (uint256 id; id < n; id++) {
            ISealedNFTAuction.Auction memory a = auction.auction(id);
            address owner = handler.nft().ownerOf(a.tokenId);
            assertEq(a.collection, address(handler.nft()));
            if (a.cancelled) {
                assertEq(owner, a.seller, "cancelled: token not back with seller");
            } else if (!a.settled) {
                assertEq(owner, address(auction), "unsettled: token left escrow");
            } else if (a.highestBidder != address(0)) {
                assertEq(owner, a.highestBidder, "settled: token not with winner");
            } else {
                assertEq(owner, a.seller, "no sale: token not back with seller");
            }
        }
    }

    function invariant_lifecycleAndWinner() public view {
        uint256 n = auction.auctionCount();
        for (uint256 id; id < n; id++) {
            ISealedNFTAuction.Auction memory a = auction.auction(id);
            assertLe(a.revealedCount, a.bidCount);
            assertLe(handler.ghost_settles(id), 1, "double settle");
            assertLe(handler.ghost_sellerWithdrawals(id), 1, "double proceeds");
            assertFalse(a.cancelled && a.settled, "cancelled and settled");
            if (a.cancelled) assertEq(a.bidCount, 0, "cancelled with bids");
            // Winner matches an independent replay of the reveals.
            assertEq(a.highestBid, handler.ghost_best(id), "highest bid drift");
            assertEq(a.highestBidder, handler.ghost_bestBidder(id), "winner drift");
            if (a.highestBidder != address(0)) {
                assertLe(a.highestBid, auction.bid(id, a.highestBidder).deposit, "price above deposit");
                assertGe(a.highestBid, a.reservePrice, "price below reserve");
            }
            if (a.proceedsPaid) assertTrue(a.settled, "proceeds before settlement");
            for (uint256 i; i < handler.bidderCount(); i++) {
                assertLe(handler.ghost_withdrawals(id, handler.bidderAt(i)), 1, "double withdrawal");
            }
        }
    }
}

contract AuctionV1Invariants is AuctionInvariantsBase {
    function setUp() public {
        vm.warp(1_750_000_000);
        auction = IAuctionProbe(address(new AuctionV1Probe(treasury)));
        _target(new AuctionV1Handler(auction, treasury));
    }
}

contract AuctionV2Invariants is AuctionInvariantsBase {
    function setUp() public {
        vm.warp(1_750_000_000);
        auction = IAuctionProbe(address(new AuctionV2Probe(treasury)));
        _target(new AuctionV2Handler(auction, treasury));
    }
}

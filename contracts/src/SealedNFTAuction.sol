// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISealedNFTAuction} from "./interfaces/ISealedNFTAuction.sol";
import {NFTCommitmentLib} from "./NFTCommitmentLib.sol";

interface IERC721Transfer {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @title SealedNFTAuction
/// @notice Sealed-bid NFT auctions paid in tPOTv3: prices stay sealed (commit–reveal) until bidding closes.
/// @dev Storage-lean, no views (see ISealedNFTAuction). The app reads storage directly: changing the order of
///      state variables or struct fields breaks web/lib/nft-storage.ts (its test catches it).
///      Payments are pull-style only. NFTs leave the contract with transferFrom (not safeTransferFrom), so a
///      receiver contract cannot block settlement by rejecting the token.
contract SealedNFTAuction is ISealedNFTAuction {
    /// @notice Minimum reveal window (24h) so a seller cannot trap bidders with a tiny window.
    uint64 internal constant MIN_REVEAL_WINDOW = 24 hours;
    /// @notice Share of the deposit kept from a bidder who never reveals (10%). It goes to the treasury.
    uint16 internal constant NON_REVEAL_PENALTY_BPS = 1000;

    /// @notice Receives non-reveal penalties. Fixed at deployment; nobody can change it.
    address internal immutable treasury;

    Auction[] internal _auctions;
    mapping(uint256 auctionId => mapping(address bidder => Bid)) internal _bids;

    constructor(address treasury_) {
        if (treasury_ == address(0)) revert ZeroTreasury();
        treasury = treasury_;
    }

    // ───────────────────────────── seller ─────────────────────────────

    function onERC721Received(address, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4)
    {
        if (data.length != 96) revert InvalidListingData();
        (uint256 reservePrice, uint64 bidDeadline, uint64 revealDeadline) =
            abi.decode(data, (uint256, uint64, uint64));
        if (reservePrice > type(uint112).max) revert InvalidListingData();
        if (bidDeadline <= block.timestamp || revealDeadline < bidDeadline + MIN_REVEAL_WINDOW) {
            revert InvalidDeadlines();
        }

        uint256 auctionId = _auctions.length;
        Auction storage a = _auctions.push();
        a.seller = from;
        a.bidDeadline = bidDeadline;
        a.collection = msg.sender;
        a.revealDeadline = revealDeadline;
        a.tokenId = tokenId;
        a.createdBlock = uint64(block.number);
        a.reservePrice = uint128(reservePrice);

        emit AuctionCreated(auctionId, from, msg.sender, tokenId, reservePrice, bidDeadline, revealDeadline);
        return this.onERC721Received.selector;
    }

    // ───────────────────────────── bidder ─────────────────────────────

    function placeBid(uint256 auctionId, bytes32 commitment) external payable {
        Auction storage a = _inState(auctionId, AuctionState.Open);
        if (msg.sender == a.seller) revert SellerCannotBid();
        if (commitment == 0) revert ZeroCommitment();
        Bid storage b = _bids[auctionId][msg.sender];
        bool first = b.commitment == 0;
        if (first) {
            if (msg.value == 0) revert ZeroDeposit();
            a.bidCount += 1;
        }
        uint256 deposit = b.deposit + msg.value;
        if (deposit > type(uint112).max) revert ZeroDeposit();
        b.deposit = uint112(deposit);
        b.commitment = commitment;
        emit BidPlaced(auctionId, msg.sender, commitment, deposit, first);
    }

    function revealBid(uint256 auctionId, uint112 amount, bytes32 salt) external {
        Auction storage a = _inState(auctionId, AuctionState.Reveal);
        Bid storage b = _bids[auctionId][msg.sender];
        if (b.commitment == 0) revert NoBid();
        if (b.revealed) revert AlreadyRevealed();
        if (amount == 0) revert ZeroAmount();
        if (NFTCommitmentLib.compute(auctionId, msg.sender, amount, salt) != b.commitment) {
            revert CommitmentMismatch();
        }
        b.revealed = true;
        b.amount = amount;
        a.revealedCount += 1;
        bool counted = amount >= a.reservePrice && amount <= b.deposit && amount > a.highestBid;
        if (counted) {
            a.highestBid = amount;
            a.highestBidder = msg.sender;
        }
        emit BidRevealed(auctionId, msg.sender, amount, salt, counted);
    }

    // ───────────────────────────── anyone ─────────────────────────────

    /// @notice After the reveal deadline: delivers the NFT to the winner, or returns it to the seller.
    ///         While Open with no bids, the seller may call it to cancel and take the NFT back.
    function settle(uint256 auctionId) external {
        Auction storage a = _auction(auctionId);
        AuctionState s = _state(a);
        address to = a.highestBidder;
        if (s == AuctionState.Open) {
            if (msg.sender != a.seller) revert NotSeller();
            if (a.bidCount != 0) revert HasBids();
            a.cancelled = true;
            to = a.seller;
            emit AuctionCancelled(auctionId);
        } else {
            if (s != AuctionState.Settlement && (s != AuctionState.NoSale || a.settled)) revert InvalidState();
            a.settled = true;
            if (to == address(0)) to = a.seller;
            emit AuctionSettled(auctionId, a.highestBidder, a.highestBid);
        }
        IERC721Transfer(a.collection).transferFrom(address(this), to, a.tokenId);
    }

    function withdraw(uint256 auctionId) external {
        Auction storage a = _auction(auctionId);
        bool closed = block.timestamp >= a.revealDeadline;
        uint256 payout;
        uint256 penalty;

        if (msg.sender == a.seller) {
            if (!a.settled || a.highestBidder == address(0) || a.proceedsPaid) revert NothingToWithdraw();
            a.proceedsPaid = true;
            payout = a.highestBid;
        } else {
            Bid storage b = _bids[auctionId][msg.sender];
            if (b.deposit == 0 || b.withdrawn) revert NothingToWithdraw();
            if (b.revealed) {
                if (msg.sender != a.highestBidder) {
                    payout = b.deposit; // outbid or not counted: the deposit is free right away
                } else {
                    if (!closed) revert NothingToWithdraw(); // the leader stays locked until reveal closes
                    payout = b.deposit - a.highestBid;
                }
            } else {
                if (!closed) revert NothingToWithdraw();
                penalty = uint256(b.deposit) * NON_REVEAL_PENALTY_BPS / 10_000;
                payout = b.deposit - penalty;
            }
            b.withdrawn = true;
        }

        emit Withdrawn(auctionId, msg.sender, payout);
        if (penalty != 0) _send(treasury, penalty);
        if (payout != 0) _send(msg.sender, payout);
    }

    // ───────────────────────────── internal ─────────────────────────────

    function _auction(uint256 auctionId) internal view returns (Auction storage) {
        if (auctionId >= _auctions.length) revert AuctionNotFound();
        return _auctions[auctionId];
    }

    function _inState(uint256 auctionId, AuctionState expected) private view returns (Auction storage a) {
        a = _auction(auctionId);
        if (_state(a) != expected) revert InvalidState();
    }

    function _state(Auction storage a) internal view returns (AuctionState) {
        if (a.cancelled) return AuctionState.Cancelled;
        if (block.timestamp < a.bidDeadline) return AuctionState.Open;
        if (block.timestamp < a.revealDeadline) return AuctionState.Reveal;
        if (a.highestBidder == address(0)) return AuctionState.NoSale;
        return a.settled ? AuctionState.Settled : AuctionState.Settlement;
    }

    /// @dev Pull-payment only, never in a loop.
    function _send(address to, uint256 value) private {
        (bool ok,) = to.call{value: value}("");
        if (!ok) revert TransferFailed();
    }
}

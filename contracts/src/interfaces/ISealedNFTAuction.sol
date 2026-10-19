// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISealedNFTAuction
/// @notice Sealed-bid (commit–reveal) auctions for ERC-721 NFTs on PortaldotV3, paid in native tPOTv3.
/// @dev Storage-lean like IBlindBidMarket: no views. The app reads the packed storage below with eth_getStorageAt
///      and the events with eth_getLogs (web/lib/nft-storage.ts, web/lib/nft-logs.ts).
///  - Listing: the seller calls `IERC721(collection).safeTransferFrom(seller, auction, tokenId, data)` with
///    `data = abi.encode(uint256 reservePrice, uint64 bidDeadline, uint64 revealDeadline)`. `onERC721Received`
///    escrows the NFT and creates the auction in that same transaction (one signature, no separate approve).
///    `bidDeadline` must be in the future and `revealDeadline >= bidDeadline + MIN_REVEAL_WINDOW`.
///  - Bidding (Open): `placeBid` with a deposit. The first call needs `msg.value > 0`; later calls replace the
///    commitment and may top up the deposit. The deposit masks the price: a bid counts only if
///    `amount <= deposit`, so bidders deposit more than they bid. The seller cannot bid.
///  - Commitment = keccak256(abi.encode(auctionId, bidder, amount, salt)) — see NFTCommitmentLib.
///  - Reveal (Reveal): `revealBid(amount, salt)`. A revealed bid counts if `amount >= reservePrice` and
///    `amount <= deposit`. Highest counted amount wins; on a tie the earlier reveal keeps the lead.
///  - After `revealDeadline` anyone calls `settle`: NFT to the winner (first-price), or back to the seller.
///  - Pull payments via `withdraw`: the seller gets the winning amount after settlement; the winner gets
///    `deposit - amount`; other revealed bidders get their full deposit (as soon as they are not the leader);
///    bidders who never revealed get `deposit` minus NON_REVEAL_PENALTY_BPS after the reveal deadline, and the
///    penalty goes to the fixed treasury — never to the seller.
///  - `cancel`: seller only, while Open and with no bids; the NFT is returned.
///  - Units: amounts, deposits and the reserve are EVM units (18 decimals), like msg.value. No event exposes an
///    amount before it is revealed (deposits are public by nature, which is why they mask the price).
interface ISealedNFTAuction {
    /// @dev Derived from block.timestamp + flags; never stored. Order matters (web/lib/nft-auction.ts).
    enum AuctionState {
        Open, // accepting sealed bids
        Reveal, // bidding closed, bidders reveal
        Settlement, // reveal closed, a winning bid exists, waiting for settle()
        Settled, // NFT delivered to the winner
        NoSale, // reveal closed without a valid bid; settle() returns the NFT to the seller
        Cancelled // seller cancelled before any bid
    }

    /// @dev 5 slots. Field order is read by web/lib/nft-storage.ts (test_storageLayoutMatchesApp guards it).
    struct Auction {
        address seller; //           slot 0
        uint64 bidDeadline;
        uint32 bidCount;
        address collection; //       slot 1
        uint64 revealDeadline;
        uint32 revealedCount;
        uint256 tokenId; //          slot 2
        address highestBidder; //    slot 3 — address(0) until a counted reveal
        uint64 createdBlock;
        bool settled; // settle() ran (NFT delivered or returned)
        bool cancelled;
        bool proceedsPaid; // seller withdrew the winning amount
        uint128 reservePrice; //     slot 4 — 0 = no reserve
        uint128 highestBid;
    }

    /// @dev 2 slots.
    struct Bid {
        bytes32 commitment; //       slot 0
        uint112 deposit; //          slot 1 — total tPOTv3 locked by this bidder (public)
        uint112 amount; // 0 until revealed
        bool revealed;
        bool withdrawn;
    }

    // ───────────── events (no event exposes an amount before reveal) ─────────────
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed collection,
        uint256 tokenId,
        uint256 reservePrice,
        uint64 bidDeadline,
        uint64 revealDeadline
    );
    /// @param first true for the first bid of this bidder, false when it replaces an earlier commitment
    event BidPlaced(
        uint256 indexed auctionId, address indexed bidder, bytes32 commitment, uint256 deposit, bool first
    );
    event BidRevealed(
        uint256 indexed auctionId, address indexed bidder, uint256 amount, bytes32 salt, bool counted
    );
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 amount);
    event AuctionCancelled(uint256 indexed auctionId);
    event Withdrawn(uint256 indexed auctionId, address indexed account, uint256 amount);

    // ───────────── errors ─────────────
    error AuctionNotFound();
    error InvalidState();
    error InvalidDeadlines();
    error InvalidListingData();
    error NotSeller();
    error SellerCannotBid();
    error NoBid();
    error ZeroCommitment();
    error ZeroDeposit();
    error AlreadyRevealed();
    error CommitmentMismatch();
    error ZeroAmount();
    error HasBids();
    error NothingToWithdraw();
    error TransferFailed();
    error ZeroTreasury();

    // ───────────── seller ─────────────
    /// @notice ERC-721 receiver hook: creates the auction (see listing rules above).
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);


    // ───────────── bidder ─────────────
    function placeBid(uint256 auctionId, bytes32 commitment) external payable;
    function revealBid(uint256 auctionId, uint112 amount, bytes32 salt) external;

    // ───────────── anyone ─────────────
    function settle(uint256 auctionId) external;
    /// @notice Seller proceeds, bidder refunds and the non-reveal remainder, whichever applies to msg.sender.
    function withdraw(uint256 auctionId) external;
}

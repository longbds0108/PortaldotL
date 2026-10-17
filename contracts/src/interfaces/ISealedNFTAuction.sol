// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISealedNFTAuction
/// @notice Sealed-bid (commit–reveal) auctions for ERC-721 NFTs on PortaldotV3, paid in native tPOTv3.
///         The web app (web/lib/nft-*.ts) is written against this interface; the implementation comes later.
/// @dev Rules the implementation must follow:
///  - Listing: the seller calls `IERC721(collection).safeTransferFrom(seller, auction, tokenId, data)` with
///    `data = abi.encode(uint256 reservePrice, uint64 bidDeadline, uint64 revealDeadline)`. `onERC721Received`
///    escrows the NFT and creates the auction in that same transaction (one signature, no separate approve).
///    `bidDeadline` must be in the future and `revealDeadline >= bidDeadline + MIN_REVEAL_WINDOW`.
///  - Bidding (Open): `placeBid` with `msg.value = deposit > 0`. The deposit masks the price: a bid is valid only if
///    `amount <= deposit`, so bidders deposit more than they bid. The seller cannot bid. `updateBid` replaces the
///    commitment and may top up the deposit.
///  - Commitment = keccak256(abi.encode(auctionId, bidder, amount, salt)) — see NFTCommitmentLib.
///  - Reveal (Reveal): `revealBid(amount, salt)`. A revealed bid counts if `amount >= reservePrice` and
///    `amount <= deposit`. Highest counted amount wins; on a tie the earlier reveal keeps the lead.
///  - After `revealDeadline` anyone calls `settle`: NFT to the winner (first-price), or back to the seller.
///  - Pull payments via `withdraw`: seller gets the winning amount; the winner gets `deposit - amount`; other revealed
///    bidders get their full deposit; bidders who never revealed get `deposit` minus NON_REVEAL_PENALTY_BPS, and the
///    penalty goes to the fixed treasury — never to the seller.
///  - `cancel`: seller only, while Open and with no bids; the NFT is returned.
///  - Units: every amount, deposit and reserve is in 14-decimal tPOTv3 base units. No view or event exposes an
///    amount before it is revealed (deposits are public by nature, which is why they mask the price).
interface ISealedNFTAuction {
    /// @dev Derived from block.timestamp + flags in `getAuctionState`; never stored.
    enum AuctionState {
        Open, // accepting sealed bids
        Reveal, // bidding closed, bidders reveal
        Settlement, // reveal closed, a winning bid exists, waiting for settle()
        Settled, // NFT delivered to the winner
        NoSale, // reveal closed without a valid bid; settle() returns the NFT to the seller
        Cancelled // seller cancelled before any bid
    }

    struct Auction {
        address seller;
        address collection; // ERC-721 contract
        uint256 tokenId;
        uint64 bidDeadline;
        uint64 revealDeadline;
        uint64 createdBlock;
        uint32 bidCount;
        uint32 revealedCount;
        bool settled; // settle() ran (NFT delivered or returned)
        bool cancelled;
        uint256 reservePrice; // 0 = no reserve
        address highestBidder; // address(0) until a valid reveal
        uint256 highestBid; // 0 until a valid reveal
    }

    struct Bid {
        bytes32 commitment;
        uint256 deposit; // total tPOTv3 locked by this bidder (public)
        uint64 committedAt; // block.timestamp of the last placeBid/updateBid
        uint64 committedBlock;
        bool revealed;
        bool withdrawn;
        uint256 amount; // 0 until revealed
        bytes32 salt; // 0 until revealed
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
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, bytes32 commitment, uint256 deposit);
    event BidUpdated(uint256 indexed auctionId, address indexed bidder, bytes32 commitment, uint256 deposit);
    event BidRevealed(uint256 indexed auctionId, address indexed bidder, uint256 amount, bool counted);
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 amount);
    event AuctionCancelled(uint256 indexed auctionId);
    event Withdrawn(uint256 indexed auctionId, address indexed account, uint256 amount);

    // ───────────── errors ─────────────
    error AuctionNotFound();
    error InvalidState(AuctionState current);
    error InvalidDeadlines();
    error InvalidListingData();
    error NotSeller();
    error SellerCannotBid();
    error AlreadyBid();
    error NoBid();
    error ZeroCommitment();
    error ZeroDeposit();
    error AlreadyRevealed();
    error CommitmentMismatch();
    error ZeroAmount();
    error HasBids();
    error NothingToWithdraw();
    error TransferFailed();

    // ───────────── seller ─────────────
    /// @notice ERC-721 receiver hook: creates the auction (see listing rules above).
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);

    function cancel(uint256 auctionId) external;

    // ───────────── bidder ─────────────
    function placeBid(uint256 auctionId, bytes32 commitment) external payable;
    function updateBid(uint256 auctionId, bytes32 commitment) external payable;
    function revealBid(uint256 auctionId, uint256 amount, bytes32 salt) external;

    // ───────────── anyone ─────────────
    function settle(uint256 auctionId) external;
    /// @notice Seller proceeds, bidder refunds and the non-reveal remainder, whichever applies to msg.sender.
    function withdraw(uint256 auctionId) external;

    // ───────────── views ─────────────
    function auctionCount() external view returns (uint256);
    function getAuction(uint256 auctionId) external view returns (Auction memory);
    function getAuctionState(uint256 auctionId) external view returns (AuctionState);
    function getBid(uint256 auctionId, address bidder) external view returns (Bid memory);
    function getBidders(uint256 auctionId) external view returns (address[] memory);
    function getSellerAuctions(address seller) external view returns (uint256[] memory);
    function getBidderAuctions(address bidder) external view returns (uint256[] memory);
    /// @notice What `withdraw(auctionId)` would pay `account` right now.
    function withdrawable(uint256 auctionId, address account) external view returns (uint256);
    function treasury() external view returns (address);
    function MIN_REVEAL_WINDOW() external view returns (uint64);
    function NON_REVEAL_PENALTY_BPS() external view returns (uint16);
}

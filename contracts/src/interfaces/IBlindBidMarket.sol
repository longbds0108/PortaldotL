// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBlindBidMarket
/// @notice Public sealed-bid (commit–reveal) tender marketplace.
/// @dev Kept as a standalone interface so the bid layer can later move to Arc Privacy Sector
///      without changing the frontend-facing surface.
///      Units: `budgetMin/budgetMax/amount` are USDC with 6 decimals; `bidBond`/`bond` are native USDC (18 decimals, wei).
interface IBlindBidMarket {
    /// @dev Derived from block.timestamp + flags in `getTenderState`; never stored.
    enum TenderState {
        Open, // accepting commitments
        Reveal, // submission closed, bidders reveal
        Evaluation, // reveal closed, >= 1 revealed bid, buyer picks winner
        Awarded,
        Cancelled,
        Failed // reveal closed with no revealed bid
    }

    struct Tender {
        address buyer;
        uint64 submissionDeadline;
        uint64 revealDeadline;
        uint64 createdBlock;
        uint64 awardedBlock; // 0 until awarded
        address winner;
        uint32 bidCount;
        uint32 revealedCount;
        bool cancelled;
        bool awarded;
        bool forfeitClaimed;
        uint256 budgetMin; // 6 decimals
        uint256 budgetMax; // 6 decimals
        uint256 bidBond; // wei (18 decimals)
        string metadataURI;
        string reasonURI;
    }

    struct Bid {
        bytes32 commitment;
        string encryptedDocURI;
        uint64 committedAt; // block.timestamp of the last submit/update
        uint64 committedBlock; // block.number of the last submit/update (lets the UI fetch the exact log)
        uint64 revealedBlock; // 0 until revealed
        bool revealed;
        bool bondWithdrawn;
        uint256 bond; // wei (18 decimals)
        uint256 amount; // 6 decimals, 0 until revealed
        bytes32 salt; // 0 until revealed
        bytes32 docKey; // AES-256 key, 0 until revealed
    }

    // ───────────── events (no event exposes a price before reveal) ─────────────
    event TenderCreated(
        uint256 indexed tenderId,
        address indexed buyer,
        string metadataURI,
        uint256 budgetMin,
        uint256 budgetMax,
        uint64 submissionDeadline,
        uint64 revealDeadline,
        uint256 bidBond
    );
    event BidSubmitted(uint256 indexed tenderId, address indexed bidder, bytes32 commitment, string encryptedDocURI);
    event BidUpdated(uint256 indexed tenderId, address indexed bidder, bytes32 commitment, string encryptedDocURI);
    event BidRevealed(uint256 indexed tenderId, address indexed bidder, uint256 amount);
    event TenderAwarded(uint256 indexed tenderId, address indexed winner, uint256 amount, string reasonURI);
    event TenderCancelled(uint256 indexed tenderId);
    event BondWithdrawn(uint256 indexed tenderId, address indexed bidder, uint256 bondWei);
    event ForfeitedBondsClaimed(uint256 indexed tenderId, address indexed buyer, uint256 bondWei);

    // ───────────── errors ─────────────
    error TenderNotFound();
    error InvalidState(TenderState current);
    error InvalidDeadlines();
    error InvalidBudget();
    error EmptyURI();
    error NotBuyer();
    error BuyerCannotBid();
    error AlreadyBid();
    error NoBid();
    error ZeroCommitment();
    error WrongBond(uint256 expected, uint256 got);
    error AlreadyRevealed();
    error CommitmentMismatch();
    error ZeroAmount();
    error WinnerNotRevealed();
    error HasBids();
    error NothingToWithdraw();
    error TransferFailed();

    // ───────────── buyer ─────────────
    function createTender(
        string calldata metadataURI,
        uint256 budgetMin,
        uint256 budgetMax,
        uint64 submissionDeadline,
        uint64 revealDeadline,
        uint256 bidBond
    ) external returns (uint256 tenderId);

    function award(uint256 tenderId, address winner, string calldata reasonURI) external;
    function cancel(uint256 tenderId) external;
    function claimForfeitedBonds(uint256 tenderId) external;

    // ───────────── bidder ─────────────
    function submitBid(uint256 tenderId, bytes32 commitment, string calldata encryptedDocURI) external payable;
    function updateBid(uint256 tenderId, bytes32 commitment, string calldata encryptedDocURI) external;
    function revealBid(uint256 tenderId, uint256 amount, bytes32 salt, bytes32 docKey) external;
    function withdrawBond(uint256 tenderId) external;

    // ───────────── views ─────────────
    function tenderCount() external view returns (uint256);
    function getTender(uint256 tenderId) external view returns (Tender memory);
    function getTenderState(uint256 tenderId) external view returns (TenderState);
    function getBid(uint256 tenderId, address bidder) external view returns (Bid memory);
    function getBidders(uint256 tenderId) external view returns (address[] memory);
    function getBuyerTenders(address buyer) external view returns (uint256[] memory);
    function getBidderTenders(address bidder) external view returns (uint256[] memory);
    function forfeitedBonds(uint256 tenderId) external view returns (uint256);
}

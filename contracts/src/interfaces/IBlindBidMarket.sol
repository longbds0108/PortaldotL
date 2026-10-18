// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBlindBidMarket
/// @notice Public sealed-bid (commit–reveal) tender marketplace.
/// @dev Built for PortaldotV3 (pallet-revive), which charges a storage deposit per byte of deployed code and of
///      contract state. To stay affordable the contract keeps only what its rules need, packed into a few slots,
///      and has no view functions:
///        - the app reads `Tender` / `Bid` straight from storage (eth_getStorageAt, layout pinned by a test in
///          web/lib/market-storage.test.ts against the Foundry storage layout);
///        - everything that is only displayed — metadata / proposal / reason documents, budgets, the revealed salt
///          and doc key, bidder lists — is in events (eth_getLogs, indexed by tenderId / buyer / bidder).
///      Documents are referenced by the 32-byte SHA-256 digest of their IPFS CIDv1 (raw or dag-pb codec); the app
///      rebuilds the CID. The award reason document links the optional AI comparison report and its hash.
///      Units: bond, budgets and amounts are EVM native-value units, the same unit as msg.value (18 decimals on
///      PortaldotV3's EVM layer).
interface IBlindBidMarket {
    /// @dev Derived from block.timestamp + flags; the app mirrors this rule client-side.
    enum TenderState {
        Open, // accepting commitments
        Reveal, // submission closed, bidders reveal
        Evaluation, // reveal closed, >= 1 revealed bid, buyer picks winner
        Awarded,
        Cancelled,
        Failed // reveal closed with no revealed bid
    }

    /// @dev 3 storage slots.
    struct Tender {
        address buyer;
        uint64 submissionDeadline;
        uint32 bidCount;
        address winner; // address(0) until awarded
        uint64 revealDeadline;
        uint32 revealedCount;
        uint96 bidBond;
        uint64 createdBlock; // block of TenderCreated, so the app can fetch its log directly
        bool cancelled;
        bool awarded;
        bool forfeitSwept; // forfeited bonds already sent to the treasury
    }

    /// @dev 2 storage slots.
    struct Bid {
        bytes32 commitment;
        uint96 bond;
        uint128 amount; // 0 until revealed
        bool revealed;
        bool bondWithdrawn;
    }

    // ───────────── events (no event exposes a price before reveal) ─────────────
    event TenderCreated(
        uint256 indexed tenderId,
        address indexed buyer,
        bytes32 metadata,
        uint256 budgetMin,
        uint256 budgetMax,
        uint64 submissionDeadline,
        uint64 revealDeadline,
        uint256 bidBond
    );
    /// @dev Emitted for the first bid and for every replacement while Open (`first` tells them apart).
    event BidSubmitted(
        uint256 indexed tenderId, address indexed bidder, bytes32 commitment, bytes32 encryptedDoc, bool first
    );
    event BidRevealed(uint256 indexed tenderId, address indexed bidder, uint256 amount, bytes32 salt, bytes32 docKey);
    event TenderAwarded(uint256 indexed tenderId, address indexed winner, uint256 amount, bytes32 reason);
    event TenderCancelled(uint256 indexed tenderId);
    event BondWithdrawn(uint256 indexed tenderId, address indexed bidder, uint256 amount);
    event ForfeitedBondsSwept(uint256 indexed tenderId, uint256 amount);

    // ───────────── errors ─────────────
    error TenderNotFound();
    error InvalidState();
    error InvalidDeadlines();
    error InvalidBudget();
    error EmptyDocument();
    error NotBuyer();
    error BuyerCannotBid();
    error ZeroCommitment();
    error WrongBond();
    error NoBid();
    error AlreadyRevealed();
    error CommitmentMismatch();
    error ZeroAmount();
    error WinnerNotRevealed();
    error HasBids();
    error NothingToWithdraw();
    error TransferFailed();
    error ZeroTreasury();

    // ───────────── buyer ─────────────
    function createTender(
        bytes32 metadata,
        uint128 budgetMin,
        uint128 budgetMax,
        uint64 submissionDeadline,
        uint64 revealDeadline,
        uint96 bidBond
    ) external returns (uint256 tenderId);

    function award(uint256 tenderId, address winner, bytes32 reason) external;
    function cancel(uint256 tenderId) external;

    // ───────────── bidder ─────────────
    /// @notice First call commits and locks the bond (msg.value == bidBond); later calls while Open replace the
    ///         commitment and proposal (msg.value == 0).
    function submitBid(uint256 tenderId, bytes32 commitment, bytes32 encryptedDoc) external payable;
    function revealBid(uint256 tenderId, uint128 amount, bytes32 salt, bytes32 docKey) external;
    function withdrawBond(uint256 tenderId) external;

    // ───────────── anyone ─────────────
    /// @notice After revealDeadline, once: bidBond × (bidCount − revealedCount) goes to the treasury (never the buyer).
    function sweepForfeitedBonds(uint256 tenderId) external;

    function treasury() external view returns (address);
}

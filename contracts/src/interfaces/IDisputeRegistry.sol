// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDisputeRegistry
/// @notice Public dispute records for Plinths tenders (BlindBidMarket) and NFT auctions (SealedNFTAuction).
/// @dev A dispute is a public record with evidence; it never changes an award or a settlement on the markets.
///  - Anyone opens a dispute about a tender or an auction with an evidence document (32-byte IPFS digest).
///  - Anyone may add a response with more evidence while the dispute is not closed; the app labels each author's
///    role (opener, buyer, seller, bidder, arbiter) from on-chain data.
///  - A fixed arbiter, set at deployment, moves a dispute to review and closes it as Resolved or Rejected with a
///    published decision document. The process is published in the app's docs.
///  - Storage-lean like the markets: one slot per dispute; texts and evidence live in events and on IPFS.
interface IDisputeRegistry {
    enum TargetKind {
        Tender,
        NftAuction
    }

    enum Status {
        Open,
        UnderReview,
        Resolved, // upheld: the concern was found valid
        Rejected
    }

    /// @dev One slot: opener(160) | kind(8) | status(8) | reason(8) | targetId(64). Read by web/lib/disputes.ts.
    struct Dispute {
        address opener;
        TargetKind kind;
        Status status;
        uint8 reason;
        uint64 targetId;
    }

    event DisputeOpened(
        uint256 indexed disputeId,
        address indexed opener,
        uint256 indexed target, // (kind << 64) | targetId, so one topic finds every dispute about a target
        uint8 reason,
        bytes32 evidence
    );
    event DisputeResponse(uint256 indexed disputeId, address indexed author, bytes32 evidence);
    event DisputeStatusChanged(uint256 indexed disputeId, Status status, bytes32 decision);

    error DisputeNotFound();
    error DisputeClosed();
    error NotArbiter();
    error EmptyEvidence();
    error InvalidReason();
    error InvalidStatus();
    error ZeroArbiter();

    function openDispute(TargetKind kind, uint64 targetId, uint8 reason, bytes32 evidence)
        external
        returns (uint256 disputeId);
    function respond(uint256 disputeId, bytes32 evidence) external;

    /// @notice Arbiter only: Open → UnderReview (decision may be 0), or Open/UnderReview → Resolved/Rejected
    ///         (decision document required).
    function setStatus(uint256 disputeId, Status status, bytes32 decision) external;
}

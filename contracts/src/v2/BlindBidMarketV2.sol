// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IBlindBidMarketV2} from "../interfaces/IBlindBidMarketV2.sol";
import {CommitReveal} from "./CommitReveal.sol";

/// @title BlindBidMarketV2
/// @notice BlindBidMarket with three changes (docs/SECURITY_CHANGES.md):
///          1. award() only accepts a bid inside the tender's published budget;
///          2. commitments are bound to this chain, this contract and a version tag;
///          3. the contract keeps a digest of the reveal set and records it with the award.
/// @dev Storage-lean, no views except the constants below. The first three Tender slots match V1; a Tender now takes
///      five slots, so web/lib/market-storage.ts reads with a different stride (test_storageLayoutMatchesApp).
contract BlindBidMarketV2 is IBlindBidMarketV2, ReentrancyGuard {
    /// @notice Minimum reveal window (24h) so a buyer cannot trap bidders with a tiny window.
    uint64 public constant MIN_REVEAL_WINDOW = 24 hours;
    bytes32 public constant COMMITMENT_DOMAIN = keccak256("plinths.tender.commit.v2");
    /// @dev 1 = buyer's choice among revealed bids within the budget (docs/PROOF_OF_FAIRNESS.md).
    uint8 internal constant SELECTION_RULE = 1;

    /// @notice Receives forfeited bonds. Fixed at deployment; nobody can change it.
    address public immutable treasury;

    TenderV2[] internal _tenders;
    mapping(uint256 tenderId => mapping(address bidder => Bid)) internal _bids;

    constructor(address treasury_) {
        if (treasury_ == address(0)) revert ZeroTreasury();
        treasury = treasury_;
    }

    // ───────────────────────────── buyer ─────────────────────────────

    function createTender(
        bytes32 metadata,
        uint128 budgetMin,
        uint128 budgetMax,
        uint64 submissionDeadline,
        uint64 revealDeadline,
        uint96 bidBond
    ) external returns (uint256 tenderId) {
        if (metadata == 0) revert EmptyDocument();
        // budgetMax == 0 would make every bid unawardable, because a revealed amount is never 0.
        if (budgetMin > budgetMax || budgetMax == 0) revert InvalidBudget();
        if (submissionDeadline <= block.timestamp || revealDeadline < submissionDeadline + MIN_REVEAL_WINDOW) {
            revert InvalidDeadlines();
        }

        tenderId = _tenders.length;
        TenderV2 storage t = _tenders.push();
        t.buyer = msg.sender;
        t.submissionDeadline = submissionDeadline;
        t.revealDeadline = revealDeadline;
        t.bidBond = bidBond;
        t.createdBlock = uint64(block.number);
        t.budgetMin = budgetMin;
        t.budgetMax = budgetMax;

        emit TenderCreated(
            tenderId, msg.sender, metadata, budgetMin, budgetMax, submissionDeadline, revealDeadline, bidBond
        );
    }

    function award(uint256 tenderId, address winner, bytes32 reason) external {
        TenderV2 storage t = _buyerTender(tenderId, TenderState.Evaluation);
        if (reason == 0) revert EmptyDocument();
        Bid storage b = _bids[tenderId][winner];
        if (!b.revealed) revert WinnerNotRevealed();
        uint128 amount = b.amount;
        if (amount < t.budgetMin || amount > t.budgetMax) revert BidOutOfBudget();
        t.awarded = true;
        t.winner = winner;
        emit TenderAwarded(tenderId, winner, amount, reason);
        emit SelectionRecorded(tenderId, winner, t.revealSetDigest, t.revealedCount, SELECTION_RULE);
    }

    function cancel(uint256 tenderId) external {
        TenderV2 storage t = _buyerTender(tenderId, TenderState.Open);
        if (t.bidCount != 0) revert HasBids();
        t.cancelled = true;
        emit TenderCancelled(tenderId);
    }

    // ───────────────────────────── anyone ─────────────────────────────

    function sweepForfeitedBonds(uint256 tenderId) external nonReentrant {
        TenderV2 storage t = _tender(tenderId);
        uint256 total = uint256(t.bidBond) * (t.bidCount - t.revealedCount);
        if (block.timestamp < t.revealDeadline || t.forfeitSwept || total == 0) revert NothingToWithdraw();
        t.forfeitSwept = true;
        emit ForfeitedBondsSwept(tenderId, total);
        _send(treasury, total);
    }

    // ───────────────────────────── bidder ─────────────────────────────

    function submitBid(uint256 tenderId, bytes32 commitment, bytes32 encryptedDoc) external payable {
        TenderV2 storage t = _inState(tenderId, TenderState.Open);
        if (msg.sender == t.buyer) revert BuyerCannotBid();
        if (commitment == 0) revert ZeroCommitment();
        if (encryptedDoc == 0) revert EmptyDocument();
        Bid storage b = _bids[tenderId][msg.sender];
        bool first = b.commitment == 0;
        if (msg.value != (first ? t.bidBond : 0)) revert WrongBond();
        if (first) {
            b.bond = uint96(msg.value);
            t.bidCount += 1;
        }
        b.commitment = commitment;
        emit BidSubmitted(tenderId, msg.sender, commitment, encryptedDoc, first);
    }

    /// @dev A bid outside the budget can still be revealed, so its bidder gets the bond back; it just cannot win.
    function revealBid(uint256 tenderId, uint128 amount, bytes32 salt, bytes32 docKey) external {
        TenderV2 storage t = _inState(tenderId, TenderState.Reveal);
        Bid storage b = _bids[tenderId][msg.sender];
        bytes32 commitment = b.commitment;
        if (commitment == 0) revert NoBid();
        if (b.revealed) revert AlreadyRevealed();
        if (amount == 0) revert ZeroAmount();
        bytes32 payload = keccak256(abi.encode(uint256(amount), keccak256(abi.encodePacked(docKey))));
        if (CommitReveal.computeHere(COMMITMENT_DOMAIN, tenderId, msg.sender, payload, salt) != commitment) {
            revert CommitmentMismatch();
        }
        b.revealed = true;
        b.amount = amount;
        t.revealedCount += 1;
        t.revealSetDigest = CommitReveal.foldReveal(t.revealSetDigest, msg.sender, amount, commitment);
        emit BidRevealed(tenderId, msg.sender, amount, salt, docKey);
    }

    function withdrawBond(uint256 tenderId) external nonReentrant {
        Bid storage b = _bids[tenderId][msg.sender];
        if (!b.revealed || b.bondWithdrawn || b.bond == 0) revert NothingToWithdraw();
        b.bondWithdrawn = true;
        uint256 bond = b.bond;
        emit BondWithdrawn(tenderId, msg.sender, bond);
        _send(msg.sender, bond);
    }

    // ───────────────────────────── internal ─────────────────────────────

    function _tender(uint256 tenderId) internal view returns (TenderV2 storage) {
        if (tenderId >= _tenders.length) revert TenderNotFound();
        return _tenders[tenderId];
    }

    function _inState(uint256 tenderId, TenderState expected) private view returns (TenderV2 storage t) {
        t = _tender(tenderId);
        if (_state(t) != expected) revert InvalidState();
    }

    function _buyerTender(uint256 tenderId, TenderState expected) private view returns (TenderV2 storage t) {
        t = _inState(tenderId, expected);
        if (msg.sender != t.buyer) revert NotBuyer();
    }

    function _state(TenderV2 storage t) internal view returns (TenderState) {
        if (t.cancelled) return TenderState.Cancelled;
        if (t.awarded) return TenderState.Awarded;
        if (block.timestamp < t.submissionDeadline) return TenderState.Open;
        if (block.timestamp < t.revealDeadline) return TenderState.Reveal;
        return t.revealedCount == 0 ? TenderState.Failed : TenderState.Evaluation;
    }

    /// @dev Pull-payment only, never in a loop.
    function _send(address to, uint256 value) private {
        (bool ok,) = to.call{value: value}("");
        if (!ok) revert TransferFailed();
    }
}

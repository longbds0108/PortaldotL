// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IBlindBidMarket} from "./interfaces/IBlindBidMarket.sol";
import {CommitmentLib} from "./CommitmentLib.sol";

/// @title BlindBidMarket
/// @notice Public confidential bidding: anyone can bid, prices stay sealed (commit–reveal) until
///         the submission deadline. All phase transitions are enforced here from block.timestamp.
/// @dev Storage-lean, no views (see IBlindBidMarket). The app reads storage directly: changing the order of
///      state variables or struct fields breaks web/lib/market-storage.ts (its test catches it).
///      Bonds are paid out pull-style only. Bond rule: a revealed bidder withdraws their bond; bonds of bids not
///      revealed by `revealDeadline` are forfeited to a fixed treasury (`sweepForfeitedBonds`, callable by anyone).
///      They never go to the buyer, so a buyer gains nothing when bidders miss the reveal window.
contract BlindBidMarket is IBlindBidMarket, ReentrancyGuard {
    /// @notice Minimum reveal window (24h) so a buyer cannot trap bidders with a tiny window.
    uint64 public constant MIN_REVEAL_WINDOW = 24 hours;

    /// @notice Receives forfeited bonds. Fixed at deployment; nobody can change it.
    address public immutable treasury;

    Tender[] internal _tenders;
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
        if (budgetMin > budgetMax) revert InvalidBudget();
        if (submissionDeadline <= block.timestamp || revealDeadline < submissionDeadline + MIN_REVEAL_WINDOW) {
            revert InvalidDeadlines();
        }

        tenderId = _tenders.length;
        Tender storage t = _tenders.push();
        t.buyer = msg.sender;
        t.submissionDeadline = submissionDeadline;
        t.revealDeadline = revealDeadline;
        t.bidBond = bidBond;
        t.createdBlock = uint64(block.number);

        emit TenderCreated(
            tenderId, msg.sender, metadata, budgetMin, budgetMax, submissionDeadline, revealDeadline, bidBond
        );
    }

    function award(uint256 tenderId, address winner, bytes32 reason) external {
        Tender storage t = _buyerTender(tenderId, TenderState.Evaluation);
        if (reason == 0) revert EmptyDocument();
        Bid storage b = _bids[tenderId][winner];
        if (!b.revealed) revert WinnerNotRevealed();
        t.awarded = true;
        t.winner = winner;
        emit TenderAwarded(tenderId, winner, b.amount, reason);
    }

    function cancel(uint256 tenderId) external {
        Tender storage t = _buyerTender(tenderId, TenderState.Open);
        if (t.bidCount != 0) revert HasBids();
        t.cancelled = true;
        emit TenderCancelled(tenderId);
    }

    // ───────────────────────────── anyone ─────────────────────────────

    function sweepForfeitedBonds(uint256 tenderId) external nonReentrant {
        Tender storage t = _tender(tenderId);
        uint256 total = uint256(t.bidBond) * (t.bidCount - t.revealedCount);
        if (block.timestamp < t.revealDeadline || t.forfeitSwept || total == 0) revert NothingToWithdraw();
        t.forfeitSwept = true;
        emit ForfeitedBondsSwept(tenderId, total);
        _send(treasury, total);
    }

    // ───────────────────────────── bidder ─────────────────────────────

    function submitBid(uint256 tenderId, bytes32 commitment, bytes32 encryptedDoc) external payable {
        Tender storage t = _inState(tenderId, TenderState.Open);
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

    function revealBid(uint256 tenderId, uint128 amount, bytes32 salt, bytes32 docKey) external {
        Tender storage t = _inState(tenderId, TenderState.Reveal);
        Bid storage b = _bids[tenderId][msg.sender];
        if (b.commitment == 0) revert NoBid();
        if (b.revealed) revert AlreadyRevealed();
        if (amount == 0) revert ZeroAmount();
        if (CommitmentLib.compute(tenderId, msg.sender, amount, salt, docKey) != b.commitment) {
            revert CommitmentMismatch();
        }
        b.revealed = true;
        b.amount = amount;
        t.revealedCount += 1;
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

    function _tender(uint256 tenderId) internal view returns (Tender storage) {
        if (tenderId >= _tenders.length) revert TenderNotFound();
        return _tenders[tenderId];
    }

    function _inState(uint256 tenderId, TenderState expected) private view returns (Tender storage t) {
        t = _tender(tenderId);
        if (_state(t) != expected) revert InvalidState();
    }

    function _buyerTender(uint256 tenderId, TenderState expected) private view returns (Tender storage t) {
        t = _inState(tenderId, expected);
        if (msg.sender != t.buyer) revert NotBuyer();
    }

    function _state(Tender storage t) internal view returns (TenderState) {
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

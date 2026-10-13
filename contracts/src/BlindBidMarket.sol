// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IBlindBidMarket} from "./interfaces/IBlindBidMarket.sol";
import {CommitmentLib} from "./CommitmentLib.sol";

/// @title BlindBidMarket
/// @notice Public confidential bidding: anyone can bid, prices stay sealed (commit–reveal) until
///         the submission deadline. All phase transitions are enforced here from block.timestamp.
/// @dev Arc specifics: bonds are native USDC (18 decimals) and are paid out pull-style only;
///      prices (`amount`) are USDC 6 decimals. Arc timestamps are non-decreasing with 1s granularity,
///      which is all the phase logic relies on.
///      Bond rule: a revealed bidder withdraws their bond; bonds of bids not revealed by
///      `revealDeadline` are forfeited to a fixed treasury (`sweepForfeitedBonds`, callable by anyone).
///      They never go to the buyer, so a buyer gains nothing when bidders miss the reveal window.
contract BlindBidMarket is IBlindBidMarket, ReentrancyGuard {
    /// @notice Minimum reveal window (24h) so a buyer cannot trap bidders with a tiny window.
    uint64 public constant MIN_REVEAL_WINDOW = 24 hours;

    /// @notice Receives forfeited bonds. Fixed at deployment; nobody can change it.
    address public immutable treasury;

    Tender[] private _tenders;
    mapping(uint256 tenderId => mapping(address bidder => Bid)) private _bids;
    mapping(uint256 tenderId => address[]) private _bidders;
    mapping(address buyer => uint256[]) private _buyerTenders;
    mapping(address bidder => uint256[]) private _bidderTenders;

    constructor(address treasury_) {
        if (treasury_ == address(0)) revert ZeroTreasury();
        treasury = treasury_;
    }

    modifier exists(uint256 tenderId) {
        if (tenderId >= _tenders.length) revert TenderNotFound();
        _;
    }

    modifier inState(uint256 tenderId, TenderState expected) {
        TenderState s = _state(_tenders[tenderId]);
        if (s != expected) revert InvalidState(s);
        _;
    }

    modifier onlyBuyer(uint256 tenderId) {
        if (msg.sender != _tenders[tenderId].buyer) revert NotBuyer();
        _;
    }

    // ───────────────────────────── buyer ─────────────────────────────

    function createTender(
        string calldata metadataURI,
        uint256 budgetMin,
        uint256 budgetMax,
        uint64 submissionDeadline,
        uint64 revealDeadline,
        uint256 bidBond
    ) external returns (uint256 tenderId) {
        if (bytes(metadataURI).length == 0) revert EmptyURI();
        if (budgetMin > budgetMax) revert InvalidBudget();
        if (submissionDeadline <= block.timestamp || revealDeadline < submissionDeadline + MIN_REVEAL_WINDOW) {
            revert InvalidDeadlines();
        }

        tenderId = _tenders.length;
        Tender storage t = _tenders.push();
        t.buyer = msg.sender;
        t.submissionDeadline = submissionDeadline;
        t.revealDeadline = revealDeadline;
        t.createdBlock = uint64(block.number);
        t.budgetMin = budgetMin;
        t.budgetMax = budgetMax;
        t.bidBond = bidBond;
        t.metadataURI = metadataURI;
        _buyerTenders[msg.sender].push(tenderId);

        emit TenderCreated(
            tenderId, msg.sender, metadataURI, budgetMin, budgetMax, submissionDeadline, revealDeadline, bidBond
        );
    }

    function award(uint256 tenderId, address winner, string calldata reasonURI)
        external
        exists(tenderId)
        onlyBuyer(tenderId)
        inState(tenderId, TenderState.Evaluation)
    {
        if (bytes(reasonURI).length == 0) revert EmptyURI();
        Bid storage b = _bids[tenderId][winner];
        if (!b.revealed) revert WinnerNotRevealed();

        Tender storage t = _tenders[tenderId];
        t.awarded = true;
        t.awardedBlock = uint64(block.number);
        t.winner = winner;
        t.reasonURI = reasonURI;
        emit TenderAwarded(tenderId, winner, b.amount, reasonURI);
    }

    function cancel(uint256 tenderId)
        external
        exists(tenderId)
        onlyBuyer(tenderId)
        inState(tenderId, TenderState.Open)
    {
        Tender storage t = _tenders[tenderId];
        if (t.bidCount != 0) revert HasBids();
        t.cancelled = true;
        emit TenderCancelled(tenderId);
    }

    // ───────────────────────────── anyone ─────────────────────────────

    function sweepForfeitedBonds(uint256 tenderId) external nonReentrant exists(tenderId) {
        uint256 total = forfeitedBonds(tenderId);
        if (total == 0) revert NothingToWithdraw();
        _tenders[tenderId].forfeitSwept = true;
        emit ForfeitedBondsSwept(tenderId, treasury, total);
        _send(treasury, total);
    }

    // ───────────────────────────── bidder ─────────────────────────────

    function submitBid(uint256 tenderId, bytes32 commitment, string calldata encryptedDocURI)
        external
        payable
        exists(tenderId)
        inState(tenderId, TenderState.Open)
    {
        Tender storage t = _tenders[tenderId];
        if (msg.sender == t.buyer) revert BuyerCannotBid();
        if (commitment == bytes32(0)) revert ZeroCommitment();
        if (bytes(encryptedDocURI).length == 0) revert EmptyURI();
        if (msg.value != t.bidBond) revert WrongBond(t.bidBond, msg.value);

        Bid storage b = _bids[tenderId][msg.sender];
        if (b.commitment != bytes32(0)) revert AlreadyBid();

        b.commitment = commitment;
        b.encryptedDocURI = encryptedDocURI;
        b.committedAt = uint64(block.timestamp);
        b.committedBlock = uint64(block.number);
        b.bond = msg.value;
        t.bidCount += 1;
        _bidders[tenderId].push(msg.sender);
        _bidderTenders[msg.sender].push(tenderId);

        emit BidSubmitted(tenderId, msg.sender, commitment, encryptedDocURI);
    }

    function updateBid(uint256 tenderId, bytes32 commitment, string calldata encryptedDocURI)
        external
        exists(tenderId)
        inState(tenderId, TenderState.Open)
    {
        if (commitment == bytes32(0)) revert ZeroCommitment();
        if (bytes(encryptedDocURI).length == 0) revert EmptyURI();
        Bid storage b = _bids[tenderId][msg.sender];
        if (b.commitment == bytes32(0)) revert NoBid();

        b.commitment = commitment;
        b.encryptedDocURI = encryptedDocURI;
        b.committedAt = uint64(block.timestamp);
        b.committedBlock = uint64(block.number);
        emit BidUpdated(tenderId, msg.sender, commitment, encryptedDocURI);
    }

    function revealBid(uint256 tenderId, uint256 amount, bytes32 salt, bytes32 docKey)
        external
        exists(tenderId)
        inState(tenderId, TenderState.Reveal)
    {
        Bid storage b = _bids[tenderId][msg.sender];
        if (b.commitment == bytes32(0)) revert NoBid();
        if (b.revealed) revert AlreadyRevealed();
        if (amount == 0) revert ZeroAmount();
        if (CommitmentLib.compute(tenderId, msg.sender, amount, salt, docKey) != b.commitment) {
            revert CommitmentMismatch();
        }

        b.revealed = true;
        b.revealedBlock = uint64(block.number);
        b.amount = amount;
        b.salt = salt;
        b.docKey = docKey;
        _tenders[tenderId].revealedCount += 1;
        emit BidRevealed(tenderId, msg.sender, amount);
    }

    function withdrawBond(uint256 tenderId) external nonReentrant exists(tenderId) {
        Bid storage b = _bids[tenderId][msg.sender];
        if (!b.revealed || b.bondWithdrawn || b.bond == 0) revert NothingToWithdraw();
        b.bondWithdrawn = true;
        uint256 bond = b.bond;
        emit BondWithdrawn(tenderId, msg.sender, bond);
        _send(msg.sender, bond);
    }

    // ───────────────────────────── views ─────────────────────────────

    function tenderCount() external view returns (uint256) {
        return _tenders.length;
    }

    function getTender(uint256 tenderId) external view exists(tenderId) returns (Tender memory) {
        return _tenders[tenderId];
    }

    function getTenderState(uint256 tenderId) external view exists(tenderId) returns (TenderState) {
        return _state(_tenders[tenderId]);
    }

    function getBid(uint256 tenderId, address bidder) external view exists(tenderId) returns (Bid memory) {
        return _bids[tenderId][bidder];
    }

    function getBidders(uint256 tenderId) external view exists(tenderId) returns (address[] memory) {
        return _bidders[tenderId];
    }

    function getBuyerTenders(address buyer) external view returns (uint256[] memory) {
        return _buyerTenders[buyer];
    }

    function getBidderTenders(address bidder) external view returns (uint256[] memory) {
        return _bidderTenders[bidder];
    }

    /// @notice Bonds of unrevealed bids waiting to be swept to the treasury; 0 before revealDeadline or once swept.
    function forfeitedBonds(uint256 tenderId) public view exists(tenderId) returns (uint256) {
        Tender storage t = _tenders[tenderId];
        if (block.timestamp < t.revealDeadline || t.forfeitSwept) return 0;
        return t.bidBond * (t.bidCount - t.revealedCount);
    }

    // ───────────────────────────── internal ─────────────────────────────

    function _state(Tender storage t) private view returns (TenderState) {
        if (t.cancelled) return TenderState.Cancelled;
        if (t.awarded) return TenderState.Awarded;
        if (block.timestamp < t.submissionDeadline) return TenderState.Open;
        if (block.timestamp < t.revealDeadline) return TenderState.Reveal;
        return t.revealedCount == 0 ? TenderState.Failed : TenderState.Evaluation;
    }

    /// @dev Pull-payment only, never in a loop. Arc reverts value transfers to address(0)/blocklisted
    ///      accounts; recipients are msg.sender or the non-zero treasury, and a blocklisted one simply cannot receive.
    function _send(address to, uint256 value) private {
        (bool ok,) = to.call{value: value}("");
        if (!ok) revert TransferFailed();
    }
}

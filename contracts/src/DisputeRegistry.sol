// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDisputeRegistry} from "./interfaces/IDisputeRegistry.sol";

/// @title DisputeRegistry
/// @notice Public dispute records for Plinths tenders and NFT auctions, with a fixed arbiter.
/// @dev Storage-lean, no views except the arbiter (see IDisputeRegistry). The app reads `_disputes` directly:
///      changing the order of state variables or struct fields breaks web/lib/disputes.ts (its test catches it).
///      Holds no funds and makes no external calls.
contract DisputeRegistry is IDisputeRegistry {
    /// @notice Number of reason codes the app offers: 0 late bid/reveal, 1 reveal mismatch, 4 NFT/payout not
    ///         delivered (settled by on-chain data), 2 unfair evaluation, 3 suspected fraud (arbitration panel),
    ///         5 quality of goods/services (the parties' own agreed mechanism).
    uint8 internal constant REASONS = 6;

    /// @notice The appointed arbitration panel's account (ideally a multisig): records reviews and decisions.
    ///         Fixed at deployment; nobody can change it.
    address public immutable arbiter;

    Dispute[] internal _disputes;

    constructor(address arbiter_) {
        if (arbiter_ == address(0)) revert ZeroArbiter();
        arbiter = arbiter_;
    }

    function openDispute(TargetKind kind, uint64 targetId, uint8 reason, bytes32 evidence)
        external
        returns (uint256 disputeId)
    {
        if (evidence == 0) revert EmptyEvidence();
        if (reason >= REASONS) revert InvalidReason();
        disputeId = _disputes.length;
        _disputes.push(Dispute({opener: msg.sender, kind: kind, status: Status.Open, reason: reason, targetId: targetId}));
        emit DisputeOpened(disputeId, msg.sender, (uint256(kind) << 64) | targetId, reason, evidence);
    }

    function respond(uint256 disputeId, bytes32 evidence) external {
        if (evidence == 0) revert EmptyEvidence();
        if (_open(disputeId).status >= Status.Resolved) revert DisputeClosed();
        emit DisputeResponse(disputeId, msg.sender, evidence);
    }

    function setStatus(uint256 disputeId, Status status, bytes32 decision) external {
        if (msg.sender != arbiter) revert NotArbiter();
        Dispute storage d = _open(disputeId);
        Status current = d.status;
        if (current >= Status.Resolved) revert DisputeClosed();
        if (status == Status.UnderReview) {
            if (current != Status.Open) revert InvalidStatus();
        } else if (status == Status.Open || decision == 0) {
            revert InvalidStatus(); // closing needs a published decision
        }
        d.status = status;
        emit DisputeStatusChanged(disputeId, status, decision);
    }

    function _open(uint256 disputeId) internal view returns (Dispute storage) {
        if (disputeId >= _disputes.length) revert DisputeNotFound();
        return _disputes[disputeId];
    }
}

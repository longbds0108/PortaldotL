// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBlindBidMarket} from "./IBlindBidMarket.sol";

/// @title IBlindBidMarketV2
/// @notice Same functions and events as IBlindBidMarket, plus on-chain budget enforcement, domain-separated
///         commitments and a recorded selection digest. See docs/SECURITY_CHANGES.md.
interface IBlindBidMarketV2 is IBlindBidMarket {
    /// @dev 5 storage slots: the three IBlindBidMarket.Tender slots unchanged, then the two below.
    struct TenderV2 {
        address buyer;
        uint64 submissionDeadline;
        uint32 bidCount;
        address winner;
        uint64 revealDeadline;
        uint32 revealedCount;
        uint96 bidBond;
        uint64 createdBlock;
        bool cancelled;
        bool awarded;
        bool forfeitSwept;
        uint128 budgetMin; // inclusive bounds checked by award()
        uint128 budgetMax;
        bytes32 revealSetDigest; // CommitReveal.foldReveal over (bidder, amount, commitment) in reveal order
    }

    /// @notice Emitted right after TenderAwarded. `rule` 1 = buyer's choice among revealed bids within the budget.
    event SelectionRecorded(
        uint256 indexed tenderId, address indexed winner, bytes32 revealSetDigest, uint32 revealedCount, uint8 rule
    );

    error BidOutOfBudget();

    /// @notice keccak256("plinths.tender.commit.v2"); its presence also tells readers this is a V2 market.
    function COMMITMENT_DOMAIN() external view returns (bytes32);
}

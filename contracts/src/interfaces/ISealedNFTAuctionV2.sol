// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISealedNFTAuction} from "./ISealedNFTAuction.sol";

/// @title ISealedNFTAuctionV2
/// @notice Same functions, events and storage as ISealedNFTAuction, plus domain-separated commitments and a check that
///         the token really is in escrow when an auction is created. See docs/SECURITY_CHANGES.md.
interface ISealedNFTAuctionV2 is ISealedNFTAuction {
    error NftNotEscrowed();

    /// @notice keccak256("plinths.nft-auction.commit.v2"); its presence also tells readers this is a V2 auction.
    function COMMITMENT_DOMAIN() external view returns (bytes32);
}

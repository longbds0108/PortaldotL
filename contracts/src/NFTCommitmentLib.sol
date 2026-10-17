// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Commitment format for ISealedNFTAuction. MUST match web/lib/nft-commitment.ts byte-for-byte
///         (cross-checked by test/fixtures/nft-commitment-vectors.json).
library NFTCommitmentLib {
    /// @param amount tPOTv3 base units, 14 decimals
    function compute(uint256 auctionId, address bidder, uint256 amount, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(auctionId, bidder, amount, salt));
    }
}

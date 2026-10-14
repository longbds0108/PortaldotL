// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Canonical commitment format. MUST match web/lib/commitment.ts byte-for-byte
///         (cross-checked by test/fixtures/commitment-vectors.json).
library CommitmentLib {
    /// @param amount tPOTv3 base units, 14 decimals
    /// @param docKey raw 32-byte AES-256 key; only its hash enters the commitment
    function compute(uint256 tenderId, address bidder, uint256 amount, bytes32 salt, bytes32 docKey)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(tenderId, bidder, amount, salt, keccak256(abi.encodePacked(docKey))));
    }
}

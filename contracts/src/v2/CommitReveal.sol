// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CommitReveal
/// @notice Domain-separated commit-reveal hashing. Holds no state and knows nothing about what is being sealed.
/// @dev Fixed-width `abi.encode` only, so fields cannot slide into each other the way `abi.encodePacked` allows.
///      commitment = keccak256(abi.encode(domainTag, chainId, verifyingContract, roundId, committer, payloadHash, salt))
///      Canonical TypeScript version and shared vectors: packages/commit-reveal/. Byte-identical copy for the Plinths
///      contracts: contracts/src/v2/CommitReveal.sol (Hardhat cannot import from outside its project; CI runs `cmp`).
library CommitReveal {
    /// @param domainTag keccak256 of a versioned application string, e.g. "plinths.tender.commit.v2"
    /// @param roundId the auction, tender, poll or other round inside `verifyingContract`
    /// @param committer the account that must later reveal; stops anyone else copying a commitment
    /// @param payloadHash hash of the application's sealed values
    /// @param salt 32 random bytes from a CSPRNG, never reused
    function compute(
        bytes32 domainTag,
        uint256 chainId,
        address verifyingContract,
        uint256 roundId,
        address committer,
        bytes32 payloadHash,
        bytes32 salt
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(domainTag, chainId, verifyingContract, roundId, committer, payloadHash, salt));
    }

    /// @notice `compute` bound to the current chain and the calling contract.
    function computeHere(bytes32 domainTag, uint256 roundId, address committer, bytes32 payloadHash, bytes32 salt)
        internal
        view
        returns (bytes32)
    {
        return compute(domainTag, block.chainid, address(this), roundId, committer, payloadHash, salt);
    }

    /// @notice Folds one reveal into a digest of the reveal set, in the order the reveals happened. Starts from 0.
    /// @param value the application's main revealed number (a price, a score); use 0 if there is none
    function foldReveal(bytes32 previous, address committer, uint256 value, bytes32 commitment)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(previous, committer, value, commitment));
    }
}

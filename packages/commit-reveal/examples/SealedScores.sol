// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommitReveal} from "../src/CommitReveal.sol";

/// @title SealedScores
/// @notice Example only, not audited: judges seal their scores for an entry so that nobody can copy or react to another
///         judge's score, then all reveal. It holds no funds and shows the three things an integrator must decide:
///         who may commit, when each phase ends, and what happens to a commitment that is never revealed. Here it
///         simply does not count. If that gives a judge an advantage, your application must attach a cost to it.
contract SealedScores {
    bytes32 internal constant DOMAIN = keccak256("example.sealed-scores.commit.v1");

    struct Round {
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint32 revealed;
        uint256 total;
        bytes32 revealDigest;
    }

    Round[] public rounds;
    mapping(uint256 roundId => mapping(address judge => bytes32)) public commitments;

    error BadDeadlines();
    error WrongPhase();
    error NothingCommitted();
    error BadOpening();

    event Committed(uint256 indexed roundId, address indexed judge, bytes32 commitment);
    event Revealed(uint256 indexed roundId, address indexed judge, uint256 score, bytes32 salt);

    function open(uint64 commitDeadline, uint64 revealDeadline) external returns (uint256 roundId) {
        if (commitDeadline <= block.timestamp || revealDeadline <= commitDeadline) revert BadDeadlines();
        roundId = rounds.length;
        rounds.push(Round(commitDeadline, revealDeadline, 0, 0, 0));
    }

    function commit(uint256 roundId, bytes32 commitment) external {
        if (block.timestamp >= rounds[roundId].commitDeadline) revert WrongPhase();
        commitments[roundId][msg.sender] = commitment;
        emit Committed(roundId, msg.sender, commitment);
    }

    function reveal(uint256 roundId, uint256 score, bytes32 salt) external {
        Round storage r = rounds[roundId];
        if (block.timestamp < r.commitDeadline || block.timestamp >= r.revealDeadline) revert WrongPhase();
        bytes32 sealed_ = commitments[roundId][msg.sender];
        if (sealed_ == 0) revert NothingCommitted();
        bytes32 payload = keccak256(abi.encode(score));
        if (CommitReveal.computeHere(DOMAIN, roundId, msg.sender, payload, salt) != sealed_) revert BadOpening();
        delete commitments[roundId][msg.sender]; // one reveal per commitment
        r.revealed += 1;
        r.total += score;
        r.revealDigest = CommitReveal.foldReveal(r.revealDigest, msg.sender, score, sealed_);
        emit Revealed(roundId, msg.sender, score, salt);
    }
}

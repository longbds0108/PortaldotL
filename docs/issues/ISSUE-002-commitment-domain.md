# ISSUE-002: Commitments are not bound to a chain or contract

| | |
|---|---|
| Severity | Low to Medium: a real gap in the format, with limited impact today |
| Status | **Open on deployed V1.** Fixed in V2 (not deployed) |
| Files | `contracts/src/CommitmentLib.sol:9-15`, `contracts/src/NFTCommitmentLib.sol:8-10`, `web/lib/commitment.ts`, `web/lib/nft-commitment.ts` |

## Problem

```solidity
keccak256(abi.encode(tenderId, bidder, amount, salt, keccak256(abi.encodePacked(docKey))))  // tender
keccak256(abi.encode(auctionId, bidder, amount, salt))                                       // auction
```

Neither includes the chain, the contract or a format version. Tender numbers restart at 0 in each deployment, so the same inputs give the same commitment on any chain or redeployment.

## What it does and does not allow

`bidder` is in the hash, and the reveal uses `msg.sender`. So **a stranger cannot replay someone's commitment and reveal it.** What remains:

- A bidder who reuses a commitment across deployments gives away the price: once they reveal on one, their sealed bid on the other can be read by anyone comparing the two.
- A contract wallet can exist at the same address on two chains under different owners. In that case the other owner could reuse the commitment.
- Without a version tag, no reader can tell which format a commitment uses.

The web app generates a new salt for each bid, so its users would not reuse a commitment by accident. Encoding is not a concern: every field is fixed-width.

## Reproduce

```bash
cd contracts
forge test --match-test 'test_V1_commitment' -vv
```

`test_V1_commitment_replaysOnAnotherContract` opens one commitment on two deployed markets. `test_V1_commitment_replaysOnAnotherChain` shows the hash is the same after changing the chain id.

## Fix

Via `CommitReveal.sol`:

```text
tender:  payload = keccak256(abi.encode(amount, keccak256(docKey)))
         keccak256(abi.encode(keccak256("plinths.tender.commit.v2"), chainId, contract, tenderId, bidder, payload, salt))
auction: payload = keccak256(abi.encode(amount))
         keccak256(abi.encode(keccak256("plinths.nft-auction.commit.v2"), chainId, contract, auctionId, bidder, payload, salt))
```

Vectors are generated with `cast` alone (`contracts/scripts/gen-v2-vectors.sh`) and checked by Solidity and TypeScript.

## Tests

`test_V2_commitment_rejected*`, `test_reveal_rejectsCrossTenderReplay`, `test_reveal_cannotReuseAnotherBiddersCommitment`, `testFuzz_reveal_wrongOpeningReverts`, `testFuzz_commitmentBindsEveryField`, `test_commitmentMatchesSharedVectors`, `test_contractAcceptsSharedVectorOpening`, and `web/lib/commitment.test.ts`.

## Compatibility

A V1 commitment cannot be revealed on V2, and the reverse, so this cannot be changed in place. See the migration plan in [SECURITY_CHANGES](../SECURITY_CHANGES.md). No live commitment is affected: tenders 0 and 1 are over, and no other round has a bid.

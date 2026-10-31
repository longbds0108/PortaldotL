# commit-reveal

A small commit-reveal reference: one Solidity library, one TypeScript file, shared test vectors, and an example. It lets someone publish a hash of a choice now and prove what the choice was later, so nobody can copy or react to it in between.

It has no state, no funds and no opinion about who wins. Those belong to your application.

Status: reference code, used by the Plinths V2 contracts. It has not been externally audited, and the V2 contracts that use it are not deployed yet.

## What a commitment binds

```text
commitment = keccak256(abi.encode(domainTag, chainId, verifyingContract, roundId, committer, payloadHash, salt))
```

| Field | Stops |
|---|---|
| `domainTag` | Reuse between applications, and between versions of one application's format |
| `chainId`, `verifyingContract` | Replay on another chain or another deployment |
| `roundId` | Replay in another auction, tender or poll |
| `committer` | Someone copying your commitment and revealing it as their own |
| `payloadHash` | Changing the sealed values |
| `salt` | Guessing a small value such as a price by hashing candidates |

Every field is a fixed-width `abi.encode` word, so fields cannot slide into each other as they can with `abi.encodePacked`.

## Use it

Solidity:

```solidity
import {CommitReveal} from "./CommitReveal.sol";

bytes32 constant DOMAIN = keccak256("yourapp.vote.commit.v1");

function reveal(uint256 roundId, uint256 choice, bytes32 salt) external {
    bytes32 payload = keccak256(abi.encode(choice));
    if (CommitReveal.computeHere(DOMAIN, roundId, msg.sender, payload, salt) != commitments[roundId][msg.sender]) {
        revert BadOpening();
    }
    // your rules from here
}
```

TypeScript, on the committer's own device:

```ts
import { computeCommitment, domainTag, randomSalt } from "@plinths/commit-reveal";

const salt = randomSalt();
const commitment = computeCommitment({
  domainTag: domainTag("yourapp.vote.commit.v1"),
  chainId,
  verifyingContract,
  roundId,
  committer,
  payloadHash: keccak256(encodeAbiParameters([{ type: "uint256" }], [choice])),
  salt,
});
// Have the user back up `choice` and `salt` before sending. Losing them means they cannot reveal.
```

[`examples/SealedScores.sol`](examples/SealedScores.sol) is a complete small contract: judges seal scores for a hackathon entry.

## What your application must decide

The library cannot do these for you, and getting them wrong undoes the benefit:

1. **Non-reveal.** After seeing others' reveals, a participant can choose not to reveal. If that can help them, charge for it with a bond or a penalty, as Plinths does. A cost lowers the incentive without removing it.
2. **Several accounts.** One person can commit from many addresses and reveal only the one that suits them. A bond makes this cost something, and only identity checks outside this library prevent it.
3. **Deadlines.** Enforce them with `block.timestamp` in the contract. Make the reveal window long enough for people to come back.
4. **What stays visible.** The committer's address, the time and the transaction are public from the first moment. Commit-reveal hides values, not participants.
5. **Salts.** Use a CSPRNG and never reuse one. After a reveal, the salt and values are public for ever.

## Fit for other uses

These are possible applications, with what each would need to add. None of them are existing integrations.

| Use | What it would add |
|---|---|
| Sealed-bid auctions | Deposits that hide the price, a highest-bid rule, delivery (see Plinths `SealedNFTAuctionV2`) |
| Procurement tenders | Bonds, encrypted proposals, a budget rule (see Plinths `BlindBidMarketV2`) |
| Grant rounds and hackathon scoring | A judge allowlist, and a rule for missing scores (see `examples/`) |
| Invoice or receivables auctions | Off-chain proof that the invoice is real, and a settlement path |
| Real-world-asset sales | Legal transfer of the asset, and buyer eligibility checks |
| Supply-chain sourcing | Supplier qualification, and delivery tracking |

## Test

```bash
forge test            # Solidity: vectors, fuzz, the example. Needs forge-std (see foundry.toml)
npm install && npm test   # TypeScript: the same vectors
npm run vectors       # regenerate test/vectors.json with cast alone
```

The vectors are generated with `cast`, so neither language checks itself. `contracts/src/v2/CommitReveal.sol` is a byte-identical copy for the Plinths contracts, kept in step by a `cmp` in CI.

# Proof of Fairness report format, version 1.0.0

A JSON format for saying what an independent tool could and could not establish about one sealed-bid round. Plinths is its first user, and it is meant to fit any commit-reveal selection: auctions, grants, hackathon scoring, procurement. Nobody else uses it today.

- Schema: [`tools/fairness-verifier/schemas/proof-of-fairness-1.0.schema.json`](../tools/fairness-verifier/schemas/proof-of-fairness-1.0.schema.json) (JSON Schema draft-07)
- Example with an award: [`v2-awarded.report.json`](../tools/fairness-verifier/test/fixtures/v2-awarded.report.json), from a private local chain

## Result

| Result | Meaning | Exit code |
|---|---|---|
| `VERIFIED` | Every required check passed, and the round is final | 0 |
| `FAILED` | A check found a contradiction | 1 |
| `INCOMPLETE` | Nothing contradicts, but evidence is missing or the round is not over | 2 |
| `UNSUPPORTED` | The tool does not know this contract or event format | 3 |

The order matters: `UNSUPPORTED` wins over `FAILED`, which wins over `INCOMPLETE`. A report must never turn missing data into `VERIFIED` or into `FAILED`.

## Fields

| Field | Content |
|---|---|
| `schemaVersion`, `generator` | Format version, and the tool that wrote the report |
| `subject` | Kind of round, round id, chain id, contract, contract version, the round's document digest |
| `outcome` | Status, whether final, winner, amount, `rule`, `randomness` |
| `outcome.rule` | Identifier and version. `deterministic: true` means a reader can recompute the winner. `false` means a person chose, and the report can only say the choice was allowed |
| `outcome.randomness` | Whether chance was used, its source and why it can be trusted. Plinths uses none |
| `budget` | Published bounds, or null |
| `revealSet` | The digest algorithm, the digest, the on-chain digest if the contract keeps one, every reveal, and who did not reveal |
| `references` | Label, transaction hash and block for each event |
| `documents` | Off-chain documents by on-chain digest, with candidate IPFS CIDs |
| `evidence` | RPC calls used, log count, block range, head and finalized block: the audit's cost and coverage |
| `sealing` | What was hidden and until when, separately for amount, proposal and identity |
| `checks` | Each check: id, status, whether required, and a human-readable detail |
| `limitations` | At least one is required. What this report does not establish |

## Reveal-set digest

```text
d0 = bytes32(0)
d(i) = keccak256(abi.encode(d(i-1), bidder, amount, commitment))
```

Reveals are folded in chain order, by block number and then log index. The order is part of the record because it decides auction ties, and a fold is what a contract can compute cheaply. `BlindBidMarketV2` keeps this value on-chain and records it at award. For V1 and for auctions, the verifier computes it from logs only and `onChainDigest` is null.

## Adopting it elsewhere

Keep the result rules, the `checks` and `limitations` arrays, and the separate `sealing` statements. Use your own `subject.kind` and `outcome.rule.id`. If a person decides the outcome, set `deterministic: false` and say so.

Changes that could alter how a report is read require a new `schemaVersion`.

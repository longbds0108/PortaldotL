# ISSUE-004: A hostile collection can block settlement

| | |
|---|---|
| Severity | Medium for bidders who trust an unknown collection |
| Status | **Unresolved on V1 and V2.** Needs a product decision |
| File | `contracts/src/v2/SealedNFTAuctionV2.sol`, `settle` (`contracts/src/SealedNFTAuction.sol:121` in V1) |

## Problem

The contract accepts any ERC-721, and "any" includes a contract written to misbehave. It can pass the custody check, then revert on `transferFrom`. `settle` then never finishes, and the winner's price stays locked. It can also fake a transfer and deliver nothing, or claim any `from` as the seller.

The test `test_V2_acceptedRisk_hostileCollectionTrapsTheWinnersMoney` states this behavior so that it stays visible. It passes because the problem exists.

## Options

| Option | Effect | Cost |
|---|---|---|
| A. Allowlist of collections | Stops it fully | Needs a list owner; contradicts "any ERC-721" |
| B. Refund route: if `settle` has not succeeded some time after the reveal deadline, the winner can reclaim the price | Bidder's money is safe | More code and state; a seller could use it to back out of a sale by making the transfer fail |
| C. Warn in the app and keep the rule (current) | Costs nothing | The risk stays with bidders |

**Current position:** option C. On the testnet only `PlinthsTestNFT` is suggested, and a bidder can see the collection address. Before any real value is involved, this should move to A or B.

The verifier's auction report lists this as a limitation, and checks a token transfer in the settlement receipt where the receipt is available.

# Security changes and migration

What changed in V2, what it costs, and how to move to it. **V2 has not been deployed.** The live app still uses V1 by default, and its behavior changes in only one way: the evaluation page refuses out-of-budget winners.

## Why V2 is a new contract

Deployed contracts cannot be edited. Changing the V1 files would also break the repository's claim that its source matches the live bytecode, which `scripts/verify-deployment.mjs` checks. So `contracts/src/BlindBidMarket.sol` and `SealedNFTAuction.sol` stay frozen, and V2 is in `contracts/src/v2/`.

## What changed

| | V1 (deployed) | V2 |
|---|---|---|
| Award outside budget | Accepted ([ISSUE-001](issues/ISSUE-001-award-budget.md)) | Reverts `BidOutOfBudget` |
| `budgetMax == 0` | Accepted | Reverts `InvalidBudget`, since no bid could win |
| Budget | In an event only | Also in storage |
| Commitment | No chain, contract or version ([ISSUE-002](issues/ISSUE-002-commitment-domain.md)) | Bound to all three |
| Reveal-set digest | None | Built during reveals, recorded at award |
| Selection record | `TenderAwarded` | `TenderAwarded`, then `SelectionRecorded` |
| Listing without a token | Accepted ([ISSUE-003](issues/ISSUE-003-phantom-listing.md)) | Reverts, for accounts with no code and honest collections |
| Listing with no seller | Accepted | Reverts `InvalidListingData` |
| Hostile collection | Blocks settlement | **Still blocks settlement** ([ISSUE-004](issues/ISSUE-004-hostile-collection.md)) |
| Function signatures and existing events | | Unchanged |

## Cost

| | V1 | V2 | Basis |
|---|---|---|---|
| Market runtime | 3,086 B | 3,279 B | `forge build --sizes` |
| Auction runtime | 3,090 B | 3,426 B | `forge build --sizes` |
| Deploy market | about 262 tPOTv3 (README) | about 277 tPOTv3 | `cast estimate` x gas price 25,770, 2026-10-31. Not a real deployment |
| Deploy auction | about 258 tPOTv3 (README) | about 285 tPOTv3 | same |
| Per tender | 3 slots | 5 slots | About 2.6 tPOTv3 more for the buyer and 2.6 for the first revealer, from the published 0.08 tPOTv3 per byte. **Estimated, not measured** |
| Per auction | 5 slots | 5 slots | Storage unchanged |

The digest slot is the one optional cost. Dropping it would save about 2.6 tPOTv3 per tender but lose the on-chain anchor for the reveal set, which is what stops an RPC from serving an altered set without a storage mismatch.

## Compatibility

- **A V1 commitment cannot be revealed on V2, or the reverse.** Rounds finish on the contract they started on.
- Bidder vault entries are keyed by chain and contract, so V1 backups stay valid for V1 and cannot be confused with V2.
- The app reads V1 or V2 from one ABI, a superset that `pnpm sync-abi` checks.
- The app reads one market at a time. After the switch, old tenders no longer show in the marketplace, though they stay on-chain and the verifier still reads them.

## Migration plan

**Nothing here has been run. Each step spends funds or changes production, and needs the owner's approval.**

Before switching, no live commitment is at risk: tenders 0 and 1 are over, and tenders 2, 3 and 4 have no bids. Check again on the day, because this can change.

1. **Tidy V1 (optional).** Anyone can call `sweepForfeitedBonds` on tenders 0 and 1 to send 22 tPOTv3 of forfeited bonds to the treasury. The seller of auction 0 can call `settle` to take token 1 back.
2. **Decide ISSUE-004.** Fine to postpone on a testnet. Do not postpone with real value.
3. **Deploy.** `cd contracts && CONFIRM_V2_DEPLOY=yes npm run deploy:v2:portaldotv3`. The script refuses to run without that variable, and prints the settings for step 5.
4. **Check the code.** Add both to `DEPLOYMENTS` in `scripts/verify-deployment.mjs` and run it, then pin their hashes in `tools/fairness-verifier/src/deployments.json`.
5. **Point the app at V2.** In Vercel set `NEXT_PUBLIC_BLINDBID_ADDRESS`, `_DEPLOY_BLOCK`, and `NEXT_PUBLIC_BLINDBID_VERSION=2`, and the same three for `NEXT_PUBLIC_NFT_AUCTION_`. Redeploy. These values are built in at build time, so changing them alone does nothing.
6. **Run one lifecycle** on the testnet. The reveal window is at least 24 hours, so allow at least a day.
7. **Verify it,** and build the Demo Day file from the result, as in [DEMO_DAY_GUIDE](DEMO_DAY_GUIDE.md).

To roll back, restore the three old values and redeploy. V2 rounds stay on-chain but leave the app, so bidders with open V2 bids would need to reveal by another route. Avoid rolling back during an open round.

## Verified so far

| Check | Result |
|---|---|
| Foundry, all profiles | 124 passed, 0 failed |
| V1 source against the chain | All 4 still match |
| Hardhat and Foundry bytecode for V2 | Identical creation code |
| App read layer on a local chain, `market.chain` on V1 and V2 | 3 of 3 each |
| `nft.chain` on V1 and V2, `dispute.chain` on V1 | 4 of 4 each, 1 of 1 |
| Web unit tests, typecheck, lint | 79 passed and 8 skipped, clean, 0 errors |
| V2 on PortaldotV3 Testnet itself | **Not tested.** Local EVM only so far |

# Baseline audit

The state of the code before any change in this work, plus what the audit found. This is a self-assessment with automated tools, not an external audit.

| | |
|---|---|
| Date | 2026-10-31 |
| Commit audited | `066313d`, on `main` |
| Tools | forge 1.8.4 (`50af4ef`), solc 0.8.24, Node 24.18, slither 0.11.6 |
| Worktree | Clean except two untracked items, left alone: `PLINTHS_MASTER_PROMPT.md` and `Bản sao trang chủ  2/` |

## Baseline results

| Check | Result |
|---|---|
| `forge build --sizes` | Builds |
| `forge test` | 57 passed, 0 failed |
| `node scripts/verify-deployment.mjs` | All 4 deployed contracts match this source |
| `forge coverage --ir-minimum` | 96.00% lines, 88.42% branches, including test helpers |
| `pnpm test` (web) | 63 passed, 8 skipped because they need a local chain |
| `pnpm typecheck` (web) | Passes |
| `pnpm lint` (web) | Could not start: `eslint-plugin-react-hooks` was missing. `pnpm install --frozen-lockfile` fixed it, so this was a stale `node_modules`, not a code problem. Then 0 errors, 3 warnings |

## Deployment and chain state

PortaldotV3 Testnet, chain `420420777`, read at head block 265025 (2026-10-31 09:23 UTC).

| Contract | Address | Compiler settings |
|---|---|---|
| BlindBidMarket | `0x6e79287f62B47307B5b7349072c51AdAF8833d54` | solc 0.8.24, via-IR, 1 run, shanghai, no metadata |
| SealedNFTAuction | `0xc05A1f041a42FFa96FC24a3aeBc576b1157aA7F6` | same |
| PlinthsTestNFT | `0xb64BE4189Dc4F0f105369D02CA91C485199d6fcd` | same |
| DisputeRegistry | `0x1F8A235387763A67E4f293E1bDFC65E149437120` | same |

**No full lifecycle exists on the testnet yet.** The market has 8 events and no reveal or award. This shapes what the verifier and the demo can honestly show.

| Round | State at the time of reading |
|---|---|
| Tender 0 | Reveal window over, 2 bids, 0 revealed: failed. 14 tPOTv3 of forfeited bonds not swept |
| Tender 1 | Reveal window over, 1 bid, 0 revealed: failed. 8 tPOTv3 of forfeited bonds not swept |
| Tender 2 | Reveal window over, no bids |
| Tender 3 | Reveal window over, no bids |
| Tender 4 | In its reveal window until 2026-10-31 14:30 UTC, no bids |
| Auction 0 | Deadline passed, no bids, `settle` not called: token 1 is still in escrow |
| DisputeRegistry | No events |

## Lifecycles traced

**Tender.** `createTender` → `submitBid` (repeatable while Open) → `revealBid` → `award` → `withdrawBond` and `sweepForfeitedBonds`. The state comes from `block.timestamp` and flags. There is no settlement beyond bonds: paying for the work is out of scope, and escrow is listed as a later phase in `CLAUDE.md`.

**NFT auction.** `safeTransferFrom` into the contract → `onERC721Received` → `placeBid` → `revealBid` (highest counted amount leads) → `settle` → `withdraw`.

**Disputes.** `openDispute`, `respond`, `setStatus`. Holds no funds, and only the fixed arbiter can change a status.

## Findings

| ID | Finding | Status in V1 | Status in V2 |
|---|---|---|---|
| [ISSUE-001](issues/ISSUE-001-award-budget.md) | `award()` ignores the published budget | **Confirmed**, reproduced. UI now blocks it; a direct contract call still works | Fixed |
| [ISSUE-002](issues/ISSUE-002-commitment-domain.md) | Commitments are not bound to a chain or contract | **Confirmed**, reproduced | Fixed |
| [ISSUE-003](issues/ISSUE-003-phantom-listing.md) | Anyone can list a token that never arrived, trapping the winner's price | **New**, reproduced | Fixed for accounts with no code and honest collections |
| [ISSUE-004](issues/ISSUE-004-hostile-collection.md) | A hostile collection can block settlement | **New**, reproduced | **Not fixed**; needs a product decision |
| [ISSUE-005](issues/ISSUE-005-no-award-deadline.md) | A buyer can leave a tender in Evaluation for ever | Accepted | Accepted |
| [ISSUE-006](issues/ISSUE-006-stale-unit-comments.md) | Comments and a fixture description still say 14 decimals | Noted | Corrected in V2 files |

Both issues the mentor reported were real in the deployed source.

## Suspected and checked, not a bug

| Suspicion | What was checked |
|---|---|
| Double withdrawal, double sweep, double settlement | Guards exist. Stateful invariants confirm, and fail when the guards are removed ([INVARIANTS](security/INVARIANTS.md)) |
| Re-entrancy | Tender payouts use `nonReentrant`. Auction `withdraw` sets its flags before paying. Tests re-enter both |
| Someone copying a commitment | `bidder` is in the hash, so the copier cannot reveal it. Tested |
| Cross-tender replay | `tenderId` is in the hash. Tested |
| A commitment collision through encoding | `abi.encode` with fixed-width fields only. The only `encodePacked` is over one `bytes32` |
| Weak salts | The app uses `crypto.getRandomValues` for 32 bytes |
| Vault collision after a redeploy | The vault key includes the chain and contract |

## Missing evidence at baseline

- No stateful or invariant tests.
- No published coverage or static analysis.
- No way to check a result without the Plinths web app.
- Budget bounds lived only in an event, so the contract could not enforce them.
- No deck link in the repository. The Canva deck noted as returning HTTP 403 in the review could not be rechecked from here.

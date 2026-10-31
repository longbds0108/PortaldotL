# Forge coverage

Recorded output, not a claim of correctness: a covered line is one that ran, not one proven right.

| | |
|---|---|
| Commit | `50b5809` (branch `feat/demo-day-hardening`) |
| Date | 2026-10-31 |
| Tool | forge 1.8.4 (`50af4ef`), solc 0.8.24, macOS arm64 |
| Log | [`forge-coverage-summary.txt`](../../contracts/test-results/forge-coverage-summary.txt) |

```bash
cd contracts
forge coverage --ir-minimum --report summary --no-match-coverage "(^test/|script/)"
```

| File | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| `src/v2/BlindBidMarketV2.sol` | 100.00% (94/94) | 100.00% (127/127) | 100.00% (31/31) | 100.00% (13/13) |
| `src/v2/SealedNFTAuctionV2.sol` | 100.00% (106/106) | 100.00% (149/149) | 100.00% (42/42) | 100.00% (10/10) |
| `src/v2/CommitReveal.sol` | 100.00% (6/6) | 100.00% (6/6) | none | 100.00% (3/3) |
| `src/BlindBidMarket.sol` | 100.00% (86/86) | 99.12% (112/113) | 96.67% (29/30) | 100.00% (13/13) |
| `src/SealedNFTAuction.sol` | 99.04% (103/104) | 97.89% (139/142) | 90.24% (37/41) | 100.00% (10/10) |
| `src/DisputeRegistry.sol` | 100.00% (27/27) | 100.00% (34/34) | 100.00% (12/12) | 100.00% (5/5) |
| `src/CommitmentLib.sol` | 100.00% (2/2) | 100.00% (2/2) | none | 100.00% (1/1) |
| `src/NFTCommitmentLib.sol` | 100.00% (2/2) | 100.00% (2/2) | none | 100.00% (1/1) |
| `src/PlinthsTestNFT.sol` | 65.52% (19/29) | 56.10% (23/41) | 25.00% (2/8) | 50.00% (3/6) |
| **Total** | **97.59% (445/456)** | **96.43% (594/616)** | **93.29% (153/164)** | **95.16% (59/62)** |

## Reading these numbers

- **Compiled differently from deployment.** `forge coverage` cannot instrument via-IR with the optimizer on, so `--ir-minimum` compiles a variant. Line mapping can be approximate, and this is not the exact deployed bytecode.
- **What is excluded:** tests, harnesses and `lib/`. Baseline's 96.00% lines and 88.42% branches included test helpers, so the totals are not directly comparable.
- **Lowest:** `PlinthsTestNFT`, a test-only token holding no value, with no dedicated test suite.
- **V1 gaps are left as they are.** The uncovered V1 branches are its `TransferFailed` paths and its deposit-limit path. The V1 suite was not extended, because V1 is frozen and the same logic is covered in V2.
- **Not measured:** the frontend, the verifier and the commit-reveal package have tests but no coverage numbers here.

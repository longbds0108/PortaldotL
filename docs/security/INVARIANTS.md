# Stateful invariants

Random multi-actor call sequences against the contracts, on V1 and V2. Unit tests check chosen paths; these check that some things stay true on every path the fuzzer finds.

Recorded at commit `50b5809`, 2026-10-31, forge 1.8.4, macOS arm64.

```bash
cd contracts
forge test --match-path 'test/invariant/*'                  # 256 runs x depth 128 = 32,768 calls per suite
FOUNDRY_PROFILE=ci forge test --match-path 'test/invariant/*'   # 1,000 runs x depth 128 = 128,000 calls per suite
python3 scripts/mutation-check.py /tmp/any-empty-dir         # do the suites catch real bugs?
```

The `ci` profile fixes the seed at `0x706c696e746873` (`foundry.toml`), so a failure replays exactly. Full output: [`forge-test-ci.log`](../../contracts/test-results/forge-test-ci.log).

| Suite | Calls | Reverted |
|---|---|---|
| `MarketV1Invariants` | 128,000 | 64,813 |
| `MarketV2Invariants` | 128,000 | 64,856 |
| `AuctionV1Invariants` | 128,000 | 59,527 |
| `AuctionV2Invariants` | 128,000 | 59,388 |

About half of random calls are invalid for the current phase, which is expected. Successful calls reach every stage, including award, sweep, settlement and proceeds.

## What is checked

Actors: 2 buyers or sellers, 4 bidders, a stranger. Each handler call is a real transaction from one of them. Native funds are also sent to the contract without calling it, so raw balance can legitimately exceed what is owed.

**Money, tenders and auctions**

- `invariant_balanceEqualsLedger`: balance equals money in, plus donations, minus money out.
- `invariant_liabilitiesAreCovered`: balance equals what the contract's own state says it owes, plus donations. Exact, not just "at least".
- Treasury receives only sweeps or penalties, and exactly those amounts.

**Tenders**

- `invariant_lifecycle`: no double withdrawal or sweep; only revealed bidders withdraw; an award names a revealed bidder and never changes; an award comes after the reveal deadline; a cancelled tender has no bids; no stored amount before reveal; counts agree.
- `invariant_winnerIsWithinBudget` (V2 only): the fix for ISSUE-001 as a property.

**Auctions**

- `invariant_nftCustody`: separate from money. The token is in escrow until settlement, then with the winner, or back with the seller after no sale or a cancel.
- `invariant_lifecycleAndWinner`: no double settlement or proceeds; the winner and price match an independent replay of the reveals done by the handler; price is within deposit and above reserve; proceeds only after settlement.

**Forbidden calls.** `attack` tries a wrong opening, a stranger's award, withdrawal or cancel, and a buyer or seller bidding on their own round. `invariant_forbiddenCallsNeverSucceed` fails if any succeeds.

## Do the suites catch real bugs?

Yes, on evidence: `scripts/mutation-check.py` breaks one contract line at a time in a throwaway copy and expects a failure. Log: [`mutation-check.log`](../../contracts/test-results/mutation-check.log).

| Broken on purpose | Caught by |
|---|---|
| Bond can be withdrawn twice (V1, V2) | `liabilitiesAreCovered`, `lifecycle` |
| Bonds can be swept twice | `liabilitiesAreCovered`, `lifecycle` |
| Budget check removed | `winnerIsWithinBudget` |
| Unrevealed bond can be withdrawn | `liabilitiesAreCovered`, `lifecycle` |
| Seller paid twice | `liabilitiesAreCovered` |
| Bidder paid twice | `liabilitiesAreCovered`, `lifecycleAndWinner` |
| NFT sent to the seller, not the winner | `nftCustody` |
| Non-reveal penalty skipped | `liabilitiesAreCovered` |
| Winner keeps the price | `liabilitiesAreCovered` |

**10 of 10 caught.** The first version of these suites caught only 4 of 10 while passing. Too many rounds were created, so random calls rarely reached late phases of any one. Rounds are now capped at 2 per run, and attacks share one entry point so ordinary calls dominate. Treat a passing invariant suite as weak evidence until this kind of check backs it.

## Limits

- Ten hand-picked mutants show the suites have teeth. They do not measure completeness.
- A fixed seed reproduces one exploration. Change it to explore others.
- The EVM here is Foundry's, not PortaldotV3's pallet-revive. Storage deposits are not modeled.
- The handlers use honest ERC-721 tokens. Hostile collections are covered only by ISSUE-004's test.

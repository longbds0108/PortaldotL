# ISSUE-001: `award()` ignores the published budget

| | |
|---|---|
| Severity | Medium: breaks a published rule, but needs the buyer's own action and is visible afterwards |
| Status | **Open on deployed V1.** Fixed in V2 (not deployed). UI guard added for V1 |
| File | `contracts/src/BlindBidMarket.sol:60-68`, `createTender` at `:33-58` |

## Problem

`createTender` publishes `budgetMin` and `budgetMax` in an event and does not store them. `award` checks the caller, the phase and that the winner revealed, and never looks at the amount. A buyer can award any revealed bid.

Bidders price against a published budget, so a buyer who awards far outside it, perhaps to a friend, breaks the terms everyone else bid on. The evaluation page only showed a badge.

## Reproduce

```bash
cd contracts
forge test --match-test 'test_V1_award' -vv
```

Both tests pass because the award succeeds: one at five times the maximum, one below the minimum. `test_V1_award_acceptsBidAboveBudget` is in `test/regressions/SecurityRegressions.t.sol`.

## Fix

`contracts/src/v2/BlindBidMarketV2.sol`:

- `createTender` stores both bounds, and rejects `budgetMax == 0`, which no bid could ever meet.
- `award` reverts with `BidOutOfBudget` unless `budgetMin <= amount <= budgetMax`. Both bounds are inclusive.
- `revealBid` still accepts an out-of-budget bid. That bidder kept the rules, so they get their bond back. They just cannot win.
- The rule does not make the cheapest bid win: the buyer can choose any bid in range.

Cost: one more storage slot per tender, about 2.6 tPOTv3 by the published per-byte rate (estimated, not measured on the testnet).

## Tests

`test_V2_award_rejects*`, `test_award_budgetBoundsAreInclusive`, `test_award_rejectsJustOutsideBudget`, `testFuzz_award_enforcesBudget`, `test_award_buyerMayChooseAPricierBidInBudget`, `test_award_rejectsWrongCaller_phase_winner_reason_andRepeat`, `test_bond_withdrawOnceEvenWhenOutOfBudget`, and the stateful `invariant_winnerIsWithinBudget`.

## Mitigation until V2 is live

- The evaluation page (`web/app/(app)/tenders/[id]/evaluate/page.tsx`) disables out-of-budget choices. A direct contract call still bypasses this.
- The verifier reports such an award as `FAILED` on the `budget` check, on V1 too.

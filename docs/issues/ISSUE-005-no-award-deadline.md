# ISSUE-005: A buyer can leave a tender in Evaluation for ever

| | |
|---|---|
| Severity | Low |
| Status | Accepted on V1 and V2 |
| File | `contracts/src/BlindBidMarket.sol:147-153`, and the same logic in V2 |

If at least one bid is revealed, the tender stays in Evaluation until the buyer awards. There is no deadline for this and no way to close it. On V2 the same happens if no revealed bid is in budget.

No money is stuck: revealed bidders can withdraw their bonds at any time, and forfeited bonds can be swept after the reveal deadline. The harm is only that bidders' prices and proposals are public while no decision ever arrives.

The verifier reports such a tender as `INCOMPLETE` with status `EVALUATION`, and the reputation system can record it. An award deadline would need a slot, a new state and a UI change, so it was left out.

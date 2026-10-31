# Slither report

Automated static analysis, triaged by the project. Not an external audit.

| | |
|---|---|
| Commit | `c54ac39`; the contracts in `src/` have not changed since |
| Date | 2026-10-31 |
| Tool | slither 0.11.6, using forge 1.8.4 and solc 0.8.24 |
| Findings | [`slither-findings.log`](../../contracts/test-results/slither-findings.log) |

```bash
cd contracts
pip install slither-analyzer==0.11.6
slither . --json slither.json   # settings in slither.config.json; exits non-zero whenever it has findings
python3 scripts/slither-check.py slither.json
```

`slither.config.json` skips `lib/`, `test/` and `node_modules/`, and informational findings. Result: 81 detectors over 17 contracts, 20 findings, and **no genuine vulnerability among them**. The findings cover V1 and V2, which is why most appear in pairs.

| Check | Impact | Count | Where | Verdict |
|---|---|---|---|---|
| `arbitrary-send-eth` | High | 4 | `_send` in all four contracts | **False positive.** `_send` pays only the immutable treasury, or `msg.sender`'s own funds after state is updated. The destination is not attacker-chosen in a way that takes others' money |
| `erc20-interface` | Medium | 1 | `IERC721Transfer` in V1 | **False positive.** It is an ERC-721 `transferFrom`, which returns nothing, as the standard says |
| `uninitialized-local` | Medium | 2 | `penalty` in auction `withdraw` | **Intended.** Stays 0 unless the non-reveal branch sets it. Tested |
| `timestamp` | Low | 12 | Deadline comparisons | **By design.** The rules are time-based, and the project requires `block.timestamp` (`CLAUDE.md` §0.3). See the timestamp section of [PROOF_OF_FAIRNESS](../PROOF_OF_FAIRNESS.md) |
| `missing-zero-check` | Low | 1 | `PlinthsTestNFT.safeTransferFrom` | **Accepted.** Test-only token; `transferFrom` already rejects the zero address |

## In CI

`scripts/slither-check.py` fails the build on any Medium or High finding not listed in `contracts/slither-triage.json`, so a new finding must be read before it can pass. Low findings are reported, not gated. Reasons for each entry are in the table above.

## Limits

- Slither reads source patterns. It does not know the business rules, and **found neither ISSUE-001, ISSUE-002, ISSUE-003 nor ISSUE-004.** Those came from reading the code against its purpose.
- It does not model PortaldotV3's pallet-revive runtime.
- A clean result would not mean the code is safe, and this one is not clean by itself: it is clean after human triage.

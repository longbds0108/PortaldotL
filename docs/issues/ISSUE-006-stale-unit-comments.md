# ISSUE-006: Comments and a fixture still say 14 decimals

| | |
|---|---|
| Severity | Informational: no effect on behavior |
| Status | Left in V1 files, correct in V2 files |
| Files | `contracts/src/CommitmentLib.sol:7`, `contracts/src/NFTCommitmentLib.sol:7`, `contracts/test/fixtures/commitment-vectors.json:2` |

The EVM layer uses 18 decimals, as `CLAUDE.md` and the interface comments say. These three places still say 14. The V1 files were not touched in this work, to keep the frozen source plainly unchanged; a comment-only fix would still pass `verify-deployment.mjs`, so it can be made at any time.

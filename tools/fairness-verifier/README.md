# Fairness verifier

Rechecks a Plinths tender or NFT auction from public chain data. It imports nothing from the Plinths app and calls no Plinths server.

```bash
npm ci
npm run verify -- --rpc https://test-evm-rpc-v3.portaldot.dev --contract 0x6e79287f62B47307B5b7349072c51AdAF8833d54 --tender 0
```

The report goes to stdout as JSON, in the [report format](../../docs/PROOF_OF_FAIRNESS_REPORT_FORMAT.md). A summary goes to stderr. Exit codes: `0` VERIFIED, `1` FAILED, `2` INCOMPLETE (including an unreachable RPC), `3` UNSUPPORTED, `64` bad usage.

## Options

| Option | Use |
|---|---|
| `--tender <ID>` or `--auction <ID>` | The round |
| `--from-block <N>` | First block to scan. Defaults to the pinned deploy block, otherwise 0 |
| `--confirmations <N>` | Depth required if the RPC has no finalized tag. Default 12 |
| `--chain-id <N>` | Fail unless the evidence is from this chain |
| `--artifact <FILE>` | A Forge artifact you compiled. The runtime code is compared to it, instead of to the pinned hash |
| `--contract-version <1\|2>` | The version to assume with `--artifact` |
| `--reason-file <FILE>` | The award reason document, checked against its on-chain digest |
| `--save-evidence <FILE>` | Save everything read from the chain |
| `--evidence <FILE>` | Replay saved evidence, with no network |
| `--out <FILE>` | Also write the report here |

## Trust less

By default it trusts `src/deployments.json`, a list of code hashes in this repository. To check the code yourself:

```bash
cd contracts && forge build
cd ../tools/fairness-verifier
npm run verify -- --rpc <URL> --contract <ADDRESS> --tender <ID> --artifact ../../contracts/out/BlindBidMarket.sol/BlindBidMarket.json --contract-version 1
```

## What it can and cannot prove

**Tenders.** That commitments open correctly, phases ran in order, counts agree with storage, the winner revealed, the amount is inside the published budget, the buyer sent the award, and bonds followed the rules. On V2, also that the on-chain reveal-set digest matches. **It cannot say the buyer chose well**: the choice is a judgement, not a formula.

**Auctions.** All of the above that apply, and it recomputes the winner and every payout from logs. It checks the token transfer in the settlement receipt if the RPC serves it. **It cannot say the collection is honest or the artwork genuine.**

**Neither.** It cannot prove accounts are unrelated, that off-chain requirements were met, or that the RPC told the truth. It reads one RPC, and a lying RPC could feed it consistent false data.

Details and threat model: [PROOF_OF_FAIRNESS](../../docs/PROOF_OF_FAIRNESS.md).

## Develop

```bash
npm test             # corrupted, missing and unknown evidence, real testnet captures, the schema, the CLI
npm run typecheck
npm run lifecycle    # rebuild test/fixtures: needs anvil and `forge build`. Private local chain only
```

`test/fixtures/testnet-*.evidence.json` are read-only captures from PortaldotV3 Testnet. The other fixtures are real transactions on a throwaway local chain, id 31337, and do not claim to be anything else.

## Build the demo file

```bash
npx tsx scripts/build-demo.ts --report <report.json> --provenance TESTNET_HISTORICAL --out ../../web/public/demo/lifecycle.json
```

`--provenance` is required, and it refuses a label that does not fit the report's chain. `scripts/demo-story.json` is a fictional scenario whose names match the local fixture's accounts: for a testnet run, write your own and pass `--story`.

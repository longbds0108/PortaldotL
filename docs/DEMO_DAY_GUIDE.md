# Demo Day guide

For whoever presents Plinths. Total time: about 3 minutes (60-second walkthrough, 2-minute security section). Say the labels aloud: the walkthrough is **recorded**, and today its transactions are on a **private local chain**, not the testnet.

## Before the day

| Do | How | Status |
|---|---|---|
| Install tools | `curl -L https://foundry.paradigm.xyz \| bash`, `foundryup`, Node 20.9+ | |
| Prepare | `cd tools/fairness-verifier && npm ci`, and `cd web && pnpm install` | |
| Rehearse with the network off | Steps below | |
| **Best upgrade: a real testnet lifecycle** | See below. Start at least 2 days early | **Not done** |
| Check the deck link opens in a private window | The repository holds no deck link, so this could not be checked here. The review noted HTTP 403 on Canva. Export a PDF and link that | **Not done** |
| Update the DoraHacks submission | Only you can do this | **Not done** |

### A real testnet lifecycle

No tender on the testnet has reached an award, so all testnet evidence today is of failed rounds. To change that, using real tPOTv3 and your own wallets:

1. Decide whether to run it on V1 as deployed or on V2 after [migration](SECURITY_CHANGES.md). V1 needs no deployment. V2 shows the fixes.
2. In the app, create a tender with a short submission window, then bid from 3 wallets. The reveal window must be at least 24 hours.
3. Reveal from at least 2 wallets, and leave one unrevealed.
4. After the reveal deadline: award, withdraw bonds, and sweep.
5. Build the demo file from it:

```bash
cd tools/fairness-verifier
npm run verify -- --rpc https://test-evm-rpc-v3.portaldot.dev --contract <ADDRESS> --tender <ID> --out /tmp/report.json
npx tsx scripts/build-demo.ts --report /tmp/report.json --provenance TESTNET_HISTORICAL --story my-story.json --out ../../web/public/demo/lifecycle.json
```

The page then labels itself "Recorded on PortaldotV3 Testnet". A `/demo` test needs its fixture comparison updated when you swap the file.

## Part 1: the walkthrough (about 60 seconds)

**Open** `https://www.plinths.xyz/demo` once this branch is deployed, or run `cd web && pnpm dev` and open `http://localhost:3000/demo`. Press **Play**: 12 seconds per stage, with no page changes. You can also click each stage.

| Stage | On screen | Say |
|---|---|---|
| Open | The label and the buyer card | "This is a recorded run on a private test chain, and the buyer is fictional. Lotus Software wants a website for about five thousand dollars. They publish the budget and three criteria." |
| Create | Budget and deadlines on-chain | "Nobody can change these afterwards." |
| Bid | Every price says Sealed | "Four firms bid. Their addresses are public, and their prices are not: only a salted hash is on-chain, and proposals are encrypted." |
| Reveal | Prices appear; Delta stays sealed | "After the deadline they open their bids. The contract rejects anything that doesn't match the hash. Delta never reveals, so its price stays secret and its bond is forfeited." |
| Select | Northwind wins | "Riverbank is cheapest but has no maintenance, so the buyer picks Northwind and publishes why. Summit is over budget, and the contract refuses it." |
| Settle | Verifier card | "Bonds go back, and an independent tool rechecks everything from chain data alone, with no Plinths server. It also says what it cannot prove: it shows the process was followed, not that the decision was wise." |

## Part 2: two attacks (about 2 minutes)

```bash
bash tools/demo/attack-regressions.sh
```

No network or wallet is used. Every test runs on a local EVM, and nothing vulnerable is ever deployed.

**Scenario 1, out-of-budget award.** "On the deployed contract, the award function checks who is calling and whether the bidder revealed. It never looks at the budget. So this test, which awards five times the maximum, passes: the weakness is real. Same steps on V2: `BidOutOfBudget`. And even on V1 it can't happen quietly: the verifier flags that award as FAILED."

**Scenario 2, commitment replay.** "A commitment had no chain or contract in it, so one opening works on a second deployment. A stranger can't exploit it, because the bidder's address is in the hash. But a bidder who reuses a commitment gives away their price on the other deployment. On V2 the hash includes the chain, the contract and a version, so the same replay reverts."

**Be ready to add:** "V2 isn't deployed yet. These two came from our mentor, and we also found one ourselves, a listing with no token behind it. One issue remains open: a hostile NFT collection can block settlement. That's a product decision, and it's written down."

## If asked

| Question | Honest answer |
|---|---|
| Is it audited? | No. Automated tests, stateful invariants, coverage and Slither, all published. No external audit |
| Is it trustless? | We say auditable. A buyer still chooses, and logs can't prove a choice was good or that accounts are unrelated |
| Do you have customers? | No. The buyer in the demo is fictional |
| Is that the testnet? | Only if the label on the page says so. Today it says private local chain |
| Why not always pick the cheapest? | A tender weighs price, proposal and fit. Auctions do use a fixed rule, and anyone can recompute that winner |
| Does the money for the work go through the contract? | No. Bonds only, and escrow isn't built |

## If something goes wrong

| Problem | Do this |
|---|---|
| The site or `/demo` won't load | `cd web && pnpm dev`. The page needs no chain: it reads a local file |
| No internet at all | Part 2 works offline after one earlier `forge build`. `pnpm dev` needs dependencies installed in advance |
| `forge` not found | `source ~/.zshenv`, or use `~/.foundry/bin/forge` |
| The RPC is down | Replay saved evidence: `cd tools/fairness-verifier && npm run verify -- --evidence test/fixtures/testnet-tender-0.evidence.json` |
| Asked to verify a real round live | `npm run verify -- --rpc https://test-evm-rpc-v3.portaldot.dev --contract 0x6e79287f62B47307B5b7349072c51AdAF8833d54 --tender 0`. It returns `VERIFIED` with outcome `NO_VALID_BIDS`. Say that this is a real tender nobody revealed, not a full award |

# Proof of Fairness: what Plinths can show, and what it cannot

Plinths aims to be **auditable**: a stranger can recheck the process from public data, at a known cost. It does not make the outcome fair by itself, and a good process can still end in a bad or collusive decision.

## What is sealed, and until when

These are three separate questions.

| Item | Before the deadline | After a reveal | If never revealed |
|---|---|---|---|
| **Price** | Hidden: only a salted hash is on-chain | Public for ever | Hidden for ever |
| **Proposal** | Hidden: AES-256-GCM ciphertext on IPFS, the key stays with the bidder | Readable by anyone, for ever, because the key is published | Unreadable while the key stays secret |
| **Bidder identity** | **Not hidden.** The address is public from the first commitment | Public | Public |

Also visible before the deadline: that a bid exists, how many bids there are, when each was made or replaced, the size of each ciphertext, and any bond. In an NFT auction the deposit is public and caps any bid that can count, so a bidder should deposit more than they bid.

"Sealed" means hidden by cryptography, assuming the salt and key were generated and kept properly. It does not stop a bidder from telling someone their price.

## How a tender is chosen

The buyer chooses. **There is no formula, so the winner cannot be recomputed.** Tenders weigh price, proposal and fit, and forcing the lowest price would be wrong for them.

What can be proven: the winner revealed a valid bid; it was inside the published budget (enforced on V2, checked afterwards on V1); the buyer sent the award after the reveal deadline; and the reason document is tamper-evident through its on-chain digest. Whether the choice was *good* is a judgement. The buyer's published reason is there so others can judge it.

## How an auction is chosen

By a fixed rule: highest revealed amount that is at least the reserve and at most the bidder's deposit. On a tie the earlier reveal keeps the lead. The winner pays their own price. **The verifier recomputes this winner from logs alone.**

## Randomness

None is used anywhere, on purpose. Selection needs no chance, and adding it would only add attack surface. Block hashes can be influenced by block authors, and seeds built from reveals can be biased by a last revealer who withholds. The tie-break is by reveal order, not chance.

## Threats and limits

| Topic | Position |
|---|---|
| **Timestamps** | Deadlines use `block.timestamp`, which block authors can shift slightly. Reveal windows of at least 24 hours make a few seconds unimportant, except for a transaction sent right at the edge |
| **Salts** | 32 bytes from a CSPRNG in the browser. A weak salt would let anyone guess a price by hashing candidates. The contract cannot check the quality of a salt |
| **Public transaction data** | Sender, time, gas and pending transactions are public. A reveal is visible in the mempool, but it can only be sent by its bidder, and by then the bidding is closed |
| **Non-reveal** | After seeing others' reveals, a bidder may withhold theirs. The cost is the bond, or 10% of the deposit in an auction. A bond of 0 makes it free, and the buyer decides the bond |
| **Several accounts** | One person can commit from several addresses and reveal only the useful one. For example, a seller's second account can bid and reveal only if the price is low. Bonds put a price on this, and they cannot rule it out. Nothing on-chain links accounts |
| **Buyer or seller collusion** | A buyer can bid through another address, or favor a friend inside the budget. Logs cannot detect it. Reputation and public reasons help a little |
| **Free auction exit** | A bid above the bidder's deposit reveals as "not counted" and returns the full deposit with no penalty, so a bidder can place such a bid at no cost. It cannot win, so this does not change who wins |
| **Admin powers** | The market and auction have no owner, pause or upgrade. The treasury is fixed and receives only forfeited money. The arbiter on `DisputeRegistry` is a fixed account, and can only change a dispute's record: it cannot move funds or change a result |
| **Reorgs** | The verifier requires events at or below the finalized block, or a minimum depth if the RPC has no finalized tag |
| **IPFS availability** | Only a digest is on-chain. A document that nobody pins can disappear. Its digest then still proves what it was, if someone has a copy, but it cannot be read. The Plinths upload pins through Pinata |
| **Disputes** | `DisputeRegistry` records a process and does not enforce legal outcomes. Rules that chain data proves are checked by code; judgement calls go to a panel; quality of goods goes to the parties' own mechanism |
| **Off-chain judgement** | Eligibility, proposal quality and real-world delivery are off-chain. No log proves them |
| **Paying for the work** | Out of scope: `settle` in a tender means bonds only. Escrow is not built |

## How to verify

See [`tools/fairness-verifier`](../tools/fairness-verifier/README.md):

```bash
cd tools/fairness-verifier && npm ci
npm run verify -- --rpc https://test-evm-rpc-v3.portaldot.dev --contract 0x6e79287f62B47307B5b7349072c51AdAF8833d54 --tender 0
```

**You need:** an RPC endpoint, the contract address and the round number. To avoid trusting this repository's pinned hash, also compile the contracts and pass `--artifact`. To check a reason document, also supply its file.

**Measured cost.** Tender 0 on PortaldotV3 Testnet took 22 RPC calls and about 2 seconds, on 2026-10-31. A full local lifecycle with 4 bidders took 50 calls. Calls grow with bidders and events. No wallet, gas or Plinths server is involved.

**Scope.** `VERIFIED` means the process followed the contract's rules as seen through this RPC. It does not mean the decision was right, that the participants were unrelated, or that the RPC told the truth. Compare another endpoint, or use your own node, where one exists.

## Current evidence

| Case | Result |
|---|---|
| Tender 0, real testnet: 2 bids, none revealed | `VERIFIED`, outcome `NO_VALID_BIDS` |
| Tender 4, real testnet: in its reveal window when read | `INCOMPLETE`, outcome `REVEAL` |
| Auction 0, real testnet: deadline passed, not settled | `INCOMPLETE`, outcome `NO_SALE_AWAITING_SETTLE` |
| Full award and full sale, **private local chain** | `VERIFIED` |
| Out-of-budget award on V1, **private local chain** | `FAILED`, on the `budget` check |
| **Full award on the real testnet** | **Does not exist yet** |

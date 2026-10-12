# BlindBid

Public confidential bidding marketplace on Arc Testnet. Prices are sealed with commit–reveal; proposals are
encrypted in the browser (AES-256-GCM). See [CLAUDE.md](CLAUDE.md) for the full spec.

## Contracts (`contracts/`)

```bash
cd contracts
cp .env.example .env            # PRIVATE_KEY of a funded Arc Testnet wallet (faucet.circle.com)
arc-forge build && arc-forge test -vvv     # plain `forge` also works for build/test
source .env
arc-forge script script/Deploy.s.sol --rpc-url $ARC_TESTNET_RPC_URL --broadcast
arc-forge verify-contract <address> src/BlindBidMarket.sol:BlindBidMarket \
  --chain-id 5042002 --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/
# optional demo data (testnet only)
BLINDBID_ADDRESS=<address> arc-forge script script/Seed.s.sol --rpc-url $ARC_TESTNET_RPC_URL --broadcast
```

After any contract change: `cd web && pnpm sync-abi`.

### Deployments

| Network | BlindBidMarket | Deploy block | Source |
|---|---|---|---|
| Arc Testnet (5042002) | [`0xb240ac942940d5695c6d280916a9c3bb6d31ff64`](https://explorer.testnet.arc.io/address/0xb240ac942940d5695c6d280916a9c3bb6d31ff64) | 66823410 | verified (Blockscout) |

Seeded with the 3 demo tenders from `script/Seed.s.sol` (ids 0–2).

## Web (`web/`)

```bash
cd web
cp .env.example .env.local      # NEXT_PUBLIC_BLINDBID_ADDRESS, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, PINATA_JWT
pnpm install
pnpm dev
pnpm lint && pnpm typecheck && pnpm test
```

Without `PINATA_JWT`, uploads in development are stored in `web/.dev-ipfs/` (production refuses).
Without a WalletConnect project id, only browser-injected wallets are offered.
E2E: see [web/e2e/README.md](web/e2e/README.md).

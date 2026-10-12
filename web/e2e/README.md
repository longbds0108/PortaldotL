# E2E tests

The specs read real contract state, so they need a chain with a known scenario:
seeded tenders 0–2 (Open), tender 3 awarded to the $6,900 bid with one bidder that never revealed,
tender 4 Open with a sealed $4,321 bid.

1. `anvil --chain-id 5042002`
2. viem's `arcTestnet` batches reads through Multicall3, which a fresh anvil lacks. Copy it from Arc:
   `cast rpc anvil_setCode 0xcA11bde05977b3631167028862bE2a173976CA11 $(cast code 0xcA11bde05977b3631167028862bE2a173976CA11 --rpc-url https://rpc.testnet.arc.io) --rpc-url http://127.0.0.1:8545`
3. Deploy (`script/Deploy.s.sol`), seed (`script/Seed.s.sol`), then drive tender 3/4 with `cast` as described above.
4. Build and serve against the local chain (dev mode compiles too slowly for E2E):
   `NEXT_PUBLIC_BLINDBID_ADDRESS=<market> NEXT_PUBLIC_ARC_RPC_URL=http://127.0.0.1:8545 pnpm build && pnpm start`
5. `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e` (add `E2E_CHANNEL=chrome` to use installed Chrome).

Wallet-signing flows (create / bid / reveal / award from the UI) are verified manually on Arc Testnet — CLAUDE.md §9.

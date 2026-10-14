# E2E tests

The specs read real contract state, so they need a chain with a known scenario:
seeded tenders 0–2 (Open), tender 3 awarded to the 6,900 tPOTv3 bid with one bidder that never revealed,
tender 4 Open with a sealed 4,321 tPOTv3 bid.

1. `anvil --chain-id 420420777`
2. Use a local Anvil private key from its startup output, set it as `PRIVATE_KEY`, then deploy and seed with the Hardhat scripts:
   `cd contracts && PRIVATE_KEY=<anvil-key> npx hardhat run scripts/deploy.cjs --network localhost`
   Set the resulting `BLINDBID_ADDRESS`, then run `npx hardhat run scripts/seed.cjs --network localhost`.
3. Drive tender 3/4 with `cast` as described above.
4. Build and serve against the local chain (dev mode compiles too slowly for E2E):
   `NEXT_PUBLIC_BLINDBID_ADDRESS=<market> NEXT_PUBLIC_PORTALDOT_RPC_URL=http://127.0.0.1:8545 pnpm build && pnpm start`
5. `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e` (add `E2E_CHANNEL=chrome` to use installed Chrome).

Wallet-signing flows (create / bid / reveal / award from the UI) still need manual verification on PortaldotV3 Testnet — CLAUDE.md §9.

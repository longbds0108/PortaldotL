# BlindBid

Public confidential bidding marketplace for **PortaldotV3 Testnet**. Prices use commit–reveal; proposals are encrypted in the browser with AES-256-GCM and stored on IPFS.

## PortaldotV3 Testnet

| Setting | Value |
|---|---|
| Substrate RPC | `wss://testnetv3-node.feso-apps.xyz` |
| EVM RPC | `https://testnetv3-eth-rpc.feso-apps.xyz` |
| Chain ID | `420420777` |
| Native token | `tPOTv3` (14 decimals; pays gas) |
| Node Console | [node-console.feso-apps.xyz](https://node-console.feso-apps.xyz/) (native Substrate tools) |

Tender budgets, bid amounts, and bonds are all stored in 14-decimal tPOTv3 base units. The contract has not yet been deployed on this testnet; configure its address after deployment.

## Contracts (`contracts/`)

```bash
cd contracts
cp .env.example .env       # set PRIVATE_KEY and mapped account funding
forge build && forge test -vvv  # local compilation and contract tests
npm install
set -a; source .env; set +a
npm run compile
npm run deploy:portaldotv3
```

After deployment, set the printed address as `BLINDBID_ADDRESS` in `contracts/.env`, reload it with `set -a; source .env; set +a`, then run `npm run seed:portaldotv3` for optional demo tenders. The guide documents Remix and Hardhat. Foundry is kept for local build/tests; it is not the documented PortaldotV3 deployment path.

After any contract change, regenerate the frontend ABI with `cd web && pnpm sync-abi`.

## Web (`web/`)

```bash
cd web
cp .env.example .env.local
pnpm install
pnpm dev
```

Set `NEXT_PUBLIC_BLINDBID_ADDRESS` after deploying the contract and provide a WalletConnect project id if needed. `PINATA_JWT` enables production IPFS uploads; without it, development uploads use `web/.dev-ipfs/`.

The app connects through the PortaldotV3 EVM RPC. The Substrate WebSocket is for native Portaldot tools; the web app uses the EVM HTTP RPC for contract reads and transactions. The Node Console is linked as a general network tool, not as an EVM block explorer.

**Funding EVM wallets:** use the Node Console's Developer → Runtime calls → `reviveApi.accountId` to map the Portaldot wallet's H160 address to its SS58 address, then send test tPOTv3 to that SS58 address. Do not transfer native funds directly to an H160 address. The Portaldot guide does not specify an EVM block explorer URL, so the app does not create transaction/address deep links. Ensure the private key belongs to the PortaldotV3 wallet's H160; a key imported from another EVM network may derive a different address.

E2E setup: see [web/e2e/README.md](web/e2e/README.md).

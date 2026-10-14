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

### Deploy the web app to Vercel

Import this repository into Vercel and set **Root Directory** to `web`. Keep the detected Next.js framework, default install command, and `pnpm build` build command. The app requires Node.js 20.9 or newer; Vercel's default Node.js 24 runtime meets this requirement.

Add these variables in Vercel Project Settings → Environment Variables for Production and Preview as needed:

| Variable | Required for | Notes |
|---|---|---|
| `NEXT_PUBLIC_BLINDBID_ADDRESS` | Marketplace contract reads and transactions | Set the deployed BlindBidMarket address on PortaldotV3 Testnet. The contract has not yet been deployed. |
| `PINATA_JWT` | Creating tenders and uploading encrypted bids/reports | Server-only secret; required for uploads on Vercel. |
| `DEEPSEEK_API_KEY` | Agent chat and proposal comparisons | Server-only secret; do not prefix it with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect wallets | Optional; without it, browser-injected wallets remain available. |
| `NEXT_PUBLIC_PORTALDOT_RPC_URL` | Custom Portaldot EVM RPC | Optional; defaults to the PortaldotV3 Testnet RPC. |
| `NEXT_PUBLIC_IPFS_GATEWAY` | Custom IPFS read gateway | Optional; defaults to Pinata's public gateway. |

`NEXT_PUBLIC_*` values are embedded during build, so redeploy after changing them. Do not add `.env.local`, `PINATA_JWT`, or `DEEPSEEK_API_KEY` to Git. The frontend can deploy before the contract address is available, but marketplace transactions and proposal analysis require the deployed address; file uploads also require `PINATA_JWT`.

**Agent review:** set the server-only `DEEPSEEK_API_KEY` to enable AI comparisons. The buyer can analyze proposals only after the reveal deadline; the server verifies the on-chain phase and buyer signature. The browser decrypts and extracts PDF, DOCX, TXT, Markdown, CSV, or JSON text, then sends that already-revealed text to DeepSeek. The AI summarizes evidence and flags suspicious instructions, but never selects a winner. When the buyer awards a tender, the comparison is published to IPFS and its Keccak-256 hash is stored on-chain with the award. Anyone can fetch the report and verify that hash.

The app connects through the PortaldotV3 EVM RPC. The Substrate WebSocket is for native Portaldot tools; the web app uses the EVM HTTP RPC for contract reads and transactions. The Node Console is linked as a general network tool, not as an EVM block explorer.

**Funding EVM wallets:** use the Node Console's Developer → Runtime calls → `reviveApi.accountId` to map the Portaldot wallet's H160 address to its SS58 address, then send test tPOTv3 to that SS58 address. Do not transfer native funds directly to an H160 address. The Portaldot guide does not specify an EVM block explorer URL, so the app does not create transaction/address deep links. Ensure the private key belongs to the PortaldotV3 wallet's H160; a key imported from another EVM network may derive a different address.

E2E setup: see [web/e2e/README.md](web/e2e/README.md).

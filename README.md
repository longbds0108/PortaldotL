# BlindBid

Public confidential bidding marketplace for **PortaldotV3 Testnet**. Prices use commit–reveal; proposals are encrypted in the browser with AES-256-GCM and stored on IPFS.

## PortaldotV3 Testnet

| Setting | Value |
|---|---|
| Substrate RPC | `wss://test-node-v3.portaldot.dev` |
| EVM RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| Chain ID | `420420777` |
| Native token | `tPOTv3` (14 decimals; pays gas) |
| Node Console | [node-console.portaldot.dev](https://node-console.portaldot.dev/) (native Substrate tools) |

Budgets, bid amounts, and bonds use the EVM's 18-decimal unit for tPOTv3 (the native token has 14 decimals on the Substrate side; the EVM layer scales it to 18). 

**Deployed on PortaldotV3 Testnet:** `BlindBidMarket` at `0x6e79287f62B47307B5b7349072c51AdAF8833d54` (block `91531`, treasury `0xF9642B695D4DDf58599c953a791F94c2e96b6a57`).

## Security and fairness evidence

Self-assessed with automated tools; no external audit has been done.

| Read | For |
|---|---|
| [docs/PROOF_OF_FAIRNESS.md](docs/PROOF_OF_FAIRNESS.md) | What is sealed, what can be proven, and the threat model |
| [tools/fairness-verifier](tools/fairness-verifier/README.md) | Recheck a tender or auction from chain data, with no Plinths server |
| [docs/PROOF_OF_FAIRNESS_REPORT_FORMAT.md](docs/PROOF_OF_FAIRNESS_REPORT_FORMAT.md) | The versioned report format |
| [docs/BASELINE_AUDIT.md](docs/BASELINE_AUDIT.md), [docs/issues/](docs/issues/) | Findings, with file, line and reproduction |
| [docs/SECURITY_CHANGES.md](docs/SECURITY_CHANGES.md) | V2 changes, cost, and the migration plan |
| [docs/security/](docs/security/) | [Invariants](docs/security/INVARIANTS.md), [coverage](docs/security/COVERAGE.md), [Slither](docs/security/SLITHER_REPORT.md) |
| [docs/DEMO_DAY_GUIDE.md](docs/DEMO_DAY_GUIDE.md) | Demo script and fallbacks |
| [packages/commit-reveal](packages/commit-reveal/README.md) | The reusable commit-reveal module |

**The live contracts are V1.** They carry the open issues listed in the audit. `BlindBidMarketV2` and `SealedNFTAuctionV2` in `contracts/src/v2/` fix them where possible, and are **not deployed**.

## Contract tests (Foundry)

[![Contracts](https://github.com/longbds0108/PortaldotL/actions/workflows/contracts.yml/badge.svg)](https://github.com/longbds0108/PortaldotL/actions/workflows/contracts.yml)

**CI:** every push runs [`.github/workflows/contracts.yml`](.github/workflows/contracts.yml) on clean Ubuntu runners with forge 1.8.4: `forge build --sizes`, `forge test -vvv` with the `ci` profile (10,000 fuzz runs each, 128,000 calls per invariant suite), coverage, a Slither triage gate, and the verifier, module and web tests. Each run's full log is in the Actions tab, also downloadable as the `forge-test-log` artifact.

The Foundry project lives in `contracts/`, not the repo root: config in [`contracts/foundry.toml`](contracts/foundry.toml), import paths in [`contracts/remappings.txt`](contracts/remappings.txt), and `forge-std` and OpenZeppelin committed under `contracts/lib/`. A plain clone is enough; no `forge install`, `npm install`, `.env` or network RPC is needed to run the tests.

**1. Install Foundry** (macOS/Linux; on Windows use WSL):

```bash
curl -L https://foundry.paradigm.xyz | bash
source ~/.zshenv   # or ~/.bashrc; or open a new terminal so ~/.foundry/bin is on PATH
foundryup
forge --version    # tested with forge 1.8.4
```

The first build downloads solc 0.8.24 automatically (internet needed once).

**2. Run the tests:**

```bash
cd contracts
forge test                  # all suites; expected: "124 tests passed, 0 failed, 0 skipped (124 total tests)"
# or, from the repo root:  forge test --root contracts
```

| Suite | File | Tests |
|---|---|---|
| `BlindBidMarket` (tender, commit–reveal, bond, award) | `test/BlindBidMarket.t.sol` | 26 (4 fuzz) |
| `SealedNFTAuction` | `test/SealedNFTAuction.t.sol` | 19 (2 fuzz) |
| `DisputeRegistry` | `test/DisputeRegistry.t.sol` | 10 (1 fuzz) |
| `NFTCommitmentLib` (TS ↔ Solidity hash vectors) | `test/NFTCommitmentLib.t.sol` | 2 (1 fuzz) |
| `BlindBidMarketV2` | `test/v2/BlindBidMarketV2.t.sol` | 27 (3 fuzz) |
| `SealedNFTAuctionV2` | `test/v2/SealedNFTAuctionV2.t.sol` | 23 (2 fuzz) |
| V1 weakness and V2 fix, side by side | `test/regressions/SecurityRegressions.t.sol` | 13 |
| Stateful invariants on V1 and V2 | `test/invariant/` | 4 suites, 23 invariants |
| **Total** | | **124** |

**Recorded run.** The full `ci` profile output is committed at [`contracts/test-results/forge-test-ci.log`](contracts/test-results/forge-test-ci.log): commit `50b5809`, forge 1.8.4, macOS arm64, 2026-10-31. Fuzz tests ran 10,000 times each, invariant suites 128,000 calls each, and forge exited with code 0:

```text
Ran 11 test suites in 35.12s (153.47s CPU time): 124 tests passed, 0 failed, 0 skipped (124 total tests)
# forge exit code: 0
```

The earlier V1-only run is kept at [`forge-test-vvv.log`](contracts/test-results/forge-test-vvv.log) (57 tests, commit `02fa385`).

**3. Useful variants:**

```bash
forge test -vvv                                  # traces for failing tests
forge test --match-contract BlindBidMarketTest   # one suite
forge test --match-test testFuzz                 # fuzz tests only (512 runs each by default)
FOUNDRY_PROFILE=ci forge test                    # 10,000 fuzz runs each (about 2 s)
forge test --match-path 'test/invariant/*'       # stateful invariants only
python3 scripts/mutation-check.py /tmp/any-dir   # do the invariants catch deliberately broken code?
forge coverage --ir-minimum --report summary     # line/branch coverage (via_ir needs --ir-minimum)
forge build --sizes                              # bytecode size (PortaldotV3 charges deposit per byte)
forge test --list                                # list every test function
```

`test_storageLayoutMatchesApp` checks that the storage slots the web app reads (`web/lib/market-storage.ts`) match the contract. The commitment tests read `test/fixtures/*.json`, which the web tests also use, so the TS and Solidity hashes are checked against the same vectors.

## Deployed bytecode matches this source

The four V1 contracts on PortaldotV3 Testnet were compiled from this repo, byte for byte. To check it yourself (needs internet for the public RPC, no wallet or `.env`):

```bash
cd contracts
forge build
node scripts/verify-deployment.mjs   # Node 18+; exits 1 on any mismatch
```

For each contract, [`scripts/verify-deployment.mjs`](contracts/scripts/verify-deployment.mjs) fetches the deployment transaction and the live code from `https://test-evm-rpc-v3.portaldot.dev` and checks that:

1. the deployment transaction's input equals the locally compiled creation bytecode plus the ABI-encoded constructor arguments;
2. the runtime code on chain (`eth_getCode`) equals the local runtime bytecode. Immutables are written into the code by the constructor, so their on-chain value (the treasury, or the arbiter for DisputeRegistry) is filled into the local code and printed.

No metadata hash is compiled in, so the match is exact. The recorded run is [`contracts/test-results/verify-deployment.log`](contracts/test-results/verify-deployment.log): all four MATCH, exit code 0.

| Contract | Address | Deployment tx | Block |
|---|---|---|---|
| BlindBidMarket | `0x6e79287f62B47307B5b7349072c51AdAF8833d54` | `0xd2417fb17449e36e563886733176d7a38277c790ecfa778cdd6b49ebedf3e5ff` | 91531 |
| SealedNFTAuction | `0xc05A1f041a42FFa96FC24a3aeBc576b1157aA7F6` | `0x281d6c5415001d351223d3bcbf156b283c2df2855b1afdc1e917d02d58aa43c9` | 102866 |
| PlinthsTestNFT | `0xb64BE4189Dc4F0f105369D02CA91C485199d6fcd` | `0xa0410e638c77c1b23665596ca697424a155e9f97ba461ee6bc5f06679dee8249` | 102867 |
| DisputeRegistry | `0x1F8A235387763A67E4f293E1bDFC65E149437120` | `0xc457cb73d70bcd2a0295139edcddf2de45ae20278f1f1852b8ebd1dc0017b042` | 105360 |

## Contracts (`contracts/`)

```bash
cd contracts
cp .env.example .env       # set PRIVATE_KEY and mapped account funding
forge build && forge test  # local compilation and contract tests (see "Contract tests (Foundry)")
npm install
set -a; source .env; set +a
npm run compile
npm run deploy:portaldotv3
```

After deployment, set the printed address as `BLINDBID_ADDRESS` in `contracts/.env`, reload it with `set -a; source .env; set +a`, then run `npm run seed:portaldotv3` for optional demo tenders. The guide documents Remix and Hardhat. Foundry is kept for local build/tests; it is not the documented PortaldotV3 deployment path.

After any contract change, regenerate the frontend ABI with `cd web && pnpm sync-abi`. Its ABIs come from V2, a superset of V1 that the script checks, so the app reads either version. `NEXT_PUBLIC_BLINDBID_VERSION` and `NEXT_PUBLIC_NFT_AUCTION_VERSION` choose the commitment format and storage layout, and default to V1.

### NFT auctions

`SealedNFTAuction` runs sealed-bid (commit–reveal) auctions for any ERC-721 on PortaldotV3, paid in tPOTv3. The seller lists with one `safeTransferFrom` into the contract; bidders lock a public deposit larger than their sealed price; after bidding closes they reveal; the highest counted price wins and `settle` delivers the NFT. Payments are pull-style (`withdraw`): outbid bidders are free at once, the winner gets the deposit above the price, and a bidder who never reveals loses 10% of the deposit to the treasury. The seller can cancel (via `settle`) while bidding is open and nobody has bid. Like the tender market it has no views; the app reads storage and events (`web/lib/nft-storage.ts`, `web/lib/nft-logs.ts`).

PortaldotV3 has few NFT tools yet, so `PlinthsTestNFT` is a minimal test-only ERC-721 whose constructor gives three items (artwork and metadata already on IPFS, `scripts/test-nft/uris.json`) to the deployer. Plinths itself never mints. `npm run deploy:nft:portaldotv3` deploys both (about 258 + 178 tPOTv3) and prints the three `NEXT_PUBLIC_*` values for `web/.env.local`; the NFT pages switch from "coming soon" to live once `NEXT_PUBLIC_NFT_AUCTION_ADDRESS` is set. `npm run nft:upload` re-uploads the art (needs `PINATA_JWT`).

### Proof of Fairness

- **Dispute Center** — `DisputeRegistry` keeps one storage slot per dispute (opener, target, reason, status); statements, cited transactions and attachments live in an evidence document on IPFS. Who settles a dispute depends on its type: the in-browser Verification Engine (`web/lib/dispute-engine.ts`) for rules on-chain data proves (late bids/reveals, reveal mismatches, NFT/payouts after settlement), the appointed arbitration panel (a fixed account, ideally a multisig) for judgement calls, and the parties' own agreed mechanism for quality of goods or services. The Dispute Assistant (`/api/agent/dispute`) briefs the panel but never decides. `npm run deploy:disputes:portaldotv3` deploys it (about 114 tPOTv3); set `NEXT_PUBLIC_DISPUTES_ADDRESS` / `_DEPLOY_BLOCK`. Plinths provides evidence and a transparent process, not legal authority.
- **Analytics** and **Reputation** need no contract: they read every tender, auction and event (`web/lib/market-data.ts`) and compute in the browser (`web/lib/analytics.ts`, `web/lib/reputation.ts`). Reputation scores behaviour on Plinths with published rules and a per-change history; only decided disputes on panel or engine grounds affect it.

### Storage deposits on PortaldotV3

PortaldotV3 (pallet-revive) charges a storage deposit of roughly 0.08 tPOTv3 per byte of deployed code and contract state. `BlindBidMarket` is therefore storage-lean: it has no view functions, documents are 32-byte IPFS digests, and display-only data lives in events; the app reads storage (`eth_getStorageAt`) and logs (`eth_getLogs`). Deploying it costs about 262 tPOTv3. Compiler settings favour size (`via_ir`, `optimizer_runs = 1`, no metadata, EVM `shanghai`). On the EVM layer, balances and `msg.value` use 18 decimals.

Local end-to-end check of the app's read layer: `anvil --chain-id 420420777`, `forge build`, then `cd web && CHAIN_TEST_RPC=http://127.0.0.1:8545 pnpm vitest run lib/market.chain.test.ts lib/nft.chain.test.ts lib/dispute.chain.test.ts` (each warps time: restart anvil between runs).

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
| `NEXT_PUBLIC_BLINDBID_ADDRESS` | Marketplace contract reads and transactions | `0x6e79287f62B47307B5b7349072c51AdAF8833d54` (BlindBidMarket on PortaldotV3 Testnet). |
| `NEXT_PUBLIC_BLINDBID_DEPLOY_BLOCK` | Event queries start here | `91531` |
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

import { getAddress, isAddress, type Address } from "viem";

const rawAddress = process.env.NEXT_PUBLIC_BLINDBID_ADDRESS ?? "";

/** Deployed BlindBidMarket, or undefined when web/.env.local is not configured yet. */
export const BLINDBID_ADDRESS: Address | undefined = isAddress(rawAddress) ? getAddress(rawAddress) : undefined;

export const BLINDBID_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_BLINDBID_DEPLOY_BLOCK || 0);

/** 1 = the deployed BlindBidMarket, 2 = BlindBidMarketV2. Decides the commitment format and storage layout. */
export const BLINDBID_VERSION: 1 | 2 = process.env.NEXT_PUBLIC_BLINDBID_VERSION === "2" ? 2 : 1;

const rawNftAuction = process.env.NEXT_PUBLIC_NFT_AUCTION_ADDRESS ?? "";

/** Deployed ISealedNFTAuction implementation, or undefined: the NFT pages then run as a visual preview. */
export const NFT_AUCTION_ADDRESS: Address | undefined = isAddress(rawNftAuction) ? getAddress(rawNftAuction) : undefined;

export const NFT_AUCTION_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_NFT_AUCTION_DEPLOY_BLOCK || 0);

/** 1 = the deployed SealedNFTAuction, 2 = SealedNFTAuctionV2. Decides the commitment format. */
export const NFT_AUCTION_VERSION: 1 | 2 = process.env.NEXT_PUBLIC_NFT_AUCTION_VERSION === "2" ? 2 : 1;

const rawTestNft = process.env.NEXT_PUBLIC_TEST_NFT_ADDRESS ?? "";

/** The PlinthsTestNFT collection (3 items), suggested on the listing form. Optional. */
export const TEST_NFT_ADDRESS: Address | undefined = isAddress(rawTestNft) ? getAddress(rawTestNft) : undefined;

const rawDisputes = process.env.NEXT_PUBLIC_DISPUTES_ADDRESS ?? "";

/** Deployed DisputeRegistry, or undefined: the Dispute Center then shows its design without data. */
export const DISPUTES_ADDRESS: Address | undefined = isAddress(rawDisputes) ? getAddress(rawDisputes) : undefined;

export const DISPUTES_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DISPUTES_DEPLOY_BLOCK || 0);

/** PortaldotV3 Testnet; the local test chain uses the same id (README). V2 commitments are bound to it. */
export const PORTALDOT_CHAIN_ID = 420420777;

export const PORTALDOT_RPC_URL = process.env.NEXT_PUBLIC_PORTALDOT_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev";

export const NODE_CONSOLE_URL = "https://node-console.portaldot.dev";

export const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

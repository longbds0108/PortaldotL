import { getAddress, isAddress, type Address } from "viem";

const rawAddress = process.env.NEXT_PUBLIC_BLINDBID_ADDRESS ?? "";

/** Deployed BlindBidMarket, or undefined when web/.env.local is not configured yet. */
export const BLINDBID_ADDRESS: Address | undefined = isAddress(rawAddress) ? getAddress(rawAddress) : undefined;

export const BLINDBID_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_BLINDBID_DEPLOY_BLOCK || 0);

export const PORTALDOT_RPC_URL = process.env.NEXT_PUBLIC_PORTALDOT_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev";

export const NODE_CONSOLE_URL = "https://node-console.portaldot.dev";

export const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

import { getAddress, isAddress, type Address } from "viem";

const rawAddress = process.env.NEXT_PUBLIC_BLINDBID_ADDRESS ?? "";

/** Deployed BlindBidMarket, or undefined when web/.env.local is not configured yet. */
export const BLINDBID_ADDRESS: Address | undefined = isAddress(rawAddress) ? getAddress(rawAddress) : undefined;

export const BLINDBID_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_BLINDBID_DEPLOY_BLOCK || 0);

export const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.io";

export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.testnet.arc.io").replace(
  /\/$/,
  "",
);

export const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

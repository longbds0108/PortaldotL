import { connectorsForWallets, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, fallback, http } from "wagmi";
import { arcTestnet } from "viem/chains";
import { ARC_RPC_URL, WALLETCONNECT_PROJECT_ID } from "./env";
import { IS_LOCAL_CHAIN } from "./network";

export const chain = arcTestnet;

// Without a WalletConnect project id, fall back to browser-injected wallets only (local dev).
const connectors = connectorsForWallets(
  WALLETCONNECT_PROJECT_ID
    ? getDefaultWallets().wallets
    : [{ groupName: "Browser wallet", wallets: [injectedWallet] }],
  { appName: "Hedgora", projectId: WALLETCONNECT_PROJECT_ID || "blindbid-local" },
);

/**
 * Public Arc RPCs rate-limit (HTTP 429 "Request exceeds defined limit"). To stay under the limits:
 *  - batch concurrent JSON-RPC calls into one HTTP request (all Arc testnet RPCs accept batches),
 *  - retry rate-limited calls with a growing delay,
 *  - fall back to Arc's other public RPCs (viem's arcTestnet list) when the configured one keeps failing.
 * A local chain (anvil) gets no public fallback — that would silently read a different chain's state.
 */
const rpcUrls = IS_LOCAL_CHAIN
  ? [ARC_RPC_URL]
  : [...new Set([ARC_RPC_URL, ...arcTestnet.rpcUrls.default.http])];

const transport = fallback(
  rpcUrls.map((url) => http(url, { batch: { wait: 20 }, retryCount: 4, retryDelay: 400 })),
);

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: { [arcTestnet.id]: transport },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

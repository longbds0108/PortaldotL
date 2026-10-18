import { connectorsForWallets, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { PORTALDOT_RPC_URL, WALLETCONNECT_PROJECT_ID } from "./env";

export const chain = defineChain({
  id: 420420777,
  name: "PortaldotV3 Testnet",
  nativeCurrency: { name: "tPOTv3", symbol: "tPOTv3", decimals: 18 },
  rpcUrls: { default: { http: [PORTALDOT_RPC_URL] } },
  testnet: true,
});

// Without a WalletConnect project id, fall back to browser-injected wallets only (local dev).
const connectors = connectorsForWallets(
  WALLETCONNECT_PROJECT_ID
    ? getDefaultWallets().wallets
    : [{ groupName: "Browser wallet", wallets: [injectedWallet] }],
  { appName: "Plinths", projectId: WALLETCONNECT_PROJECT_ID || "blindbid-local" },
);

const transport = http(PORTALDOT_RPC_URL, { batch: { wait: 20 }, retryCount: 4, retryDelay: 400 });

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: transport },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

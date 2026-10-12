import { connectorsForWallets, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { arcTestnet } from "viem/chains";
import { ARC_RPC_URL, WALLETCONNECT_PROJECT_ID } from "./env";

export const chain = arcTestnet;

// Without a WalletConnect project id, fall back to browser-injected wallets only (local dev).
const connectors = connectorsForWallets(
  WALLETCONNECT_PROJECT_ID
    ? getDefaultWallets().wallets
    : [{ groupName: "Browser wallet", wallets: [injectedWallet] }],
  { appName: "Hedgora", projectId: WALLETCONNECT_PROJECT_ID || "blindbid-local" },
);

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: { [arcTestnet.id]: http(ARC_RPC_URL) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

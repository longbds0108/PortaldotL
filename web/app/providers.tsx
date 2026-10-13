"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { WagmiProvider } from "wagmi";
import { useAppliedTheme } from "@/lib/preferences";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const theme = useAppliedTheme();
  const rk = { accentColor: "#0b53bf", accentColorForeground: "#ffffff", borderRadius: "large" } as const;
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          locale="en-US"
          theme={theme === "light" ? lightTheme(rk) : darkTheme(rk)}
        >
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

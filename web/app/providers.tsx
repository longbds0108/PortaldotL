"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { WagmiProvider } from "wagmi";
import type { Lang } from "@/lib/i18n";
import { useAppliedTheme } from "@/lib/preferences";
import { wagmiConfig } from "@/lib/wagmi";
import { ScrollIdle } from "@/components/scroll-idle";
import { Toaster } from "@/components/toaster";
import { LangProvider } from "@/components/lang-provider";

export function Providers({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const theme = useAppliedTheme();
  const rk = { accentColor: "#0b53bf", accentColorForeground: "#ffffff", borderRadius: "large" } as const;
  return (
    <LangProvider initial={lang}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            locale={lang === "vi" ? "vi-VN" : "en-US"}
            theme={theme === "light" ? lightTheme(rk) : darkTheme(rk)}
          >
            <MotionConfig reducedMotion="user">{children}</MotionConfig>
            <Toaster />
            <ScrollIdle />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </LangProvider>
  );
}

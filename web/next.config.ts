import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Shown in the account panel footer. The commit comes from Vercel's build environment when deployed there.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
  // The homepage is a static page (public/home) with its own CSS and scripts, kept outside the React app.
  // The EN | VI switch (cookie shared with the app, see lib/i18n.ts) picks the Vietnamese edition.
  rewrites: async () => [
    { source: "/", has: [{ type: "cookie", key: "plinths_lang", value: "vi" }], destination: "/home/vi.html" },
    { source: "/", destination: "/home/index.html" },
  ],
  webpack: (config) => {
    // WalletConnect / MetaMask SDK optional deps that are not used in the browser bundle
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    // Optional peer deps of @coinbase/cdp-sdk (pulled in by wagmi's Base Account connector); x402 payments are unused.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core": false,
      "@x402/evm": false,
      "@x402/svm": false,
      "@x402/extensions": false,
    };
    return config;
  },
};

export default nextConfig;

import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
  title: "Plinths — Sealed-Bid Marketplace on PortaldotV3",
  description: "A public tender marketplace where suppliers compete with sealed bids and every award can be verified.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111015" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={interTight.variable} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

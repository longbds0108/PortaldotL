import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
  title: "BlindBid — Confidential Bidding on Arc",
  description: "Public tenders with sealed bids: prices stay hidden until the submission deadline.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111015" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={interTight.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

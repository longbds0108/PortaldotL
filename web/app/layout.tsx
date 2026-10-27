import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { preconnect } from "react-dom";
import { PORTALDOT_RPC_URL } from "@/lib/env";
import { getLang } from "@/lib/i18n-server";
import { Providers } from "./providers";
import "./globals.css";

const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });

const SITE_TITLE = "Plinths — Sealed-Bid Marketplace on PortaldotV3";
const SITE_DESCRIPTION = "A public tender marketplace where suppliers compete with sealed bids and every award can be verified.";

// Share previews (Facebook, X, Telegram, Zalo, Discord…) use app/opengraph-image.png and app/twitter-image.png.
// metadataBase makes their URLs absolute; Vercel previews fall back to the production domain.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.plinths.xyz"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: { type: "website", siteName: "Plinths", title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111015" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page reads the chain on load; open the RPC connection (DNS + TLS) while the JS is still downloading.
  preconnect(new URL(PORTALDOT_RPC_URL).origin, { crossOrigin: "anonymous" });
  const lang = await getLang();
  return (
    <html lang={lang} className={interTight.variable} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}

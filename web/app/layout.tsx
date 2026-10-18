import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={interTight.variable} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

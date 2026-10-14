import type { Metadata } from "next";
import { DocsShell } from "@/components/docs/docs-shell";

export const metadata: Metadata = {
  title: "Docs — Hedgora",
  description: "How Hedgora's sealed-bid tenders work: publishing, bidding, revealing, awarding and verifying on PortaldotV3.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}

import type { Metadata } from "next";
import { DocsShell } from "@/components/docs/docs-shell";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Docs — Plinths", "Tài liệu — Plinths"),
    description: t(
      "How Plinths's sealed-bid tenders work: publishing, bidding, revealing, awarding and verifying on PortaldotV3.",
      "Cách đấu thầu niêm phong của Plinths hoạt động: đăng, dự thầu, công bố, trao thầu và kiểm chứng trên PortaldotV3.",
    ),
  };
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}

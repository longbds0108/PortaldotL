import { redirect } from "next/navigation";
import { DisputeDetail } from "@/components/disputes/detail";
import { DISPUTES_ADDRESS } from "@/lib/env";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Dispute — Plinths", "Khiếu nại — Plinths") };
}

export default function Page() {
  if (!DISPUTES_ADDRESS) redirect("/disputes");
  return <DisputeDetail />;
}

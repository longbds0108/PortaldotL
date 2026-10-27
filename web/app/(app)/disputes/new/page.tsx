import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NewDispute } from "@/components/disputes/new-dispute";
import { DISPUTES_ADDRESS } from "@/lib/env";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Open a dispute — Plinths", "Mở khiếu nại — Plinths") };
}

export default function Page() {
  if (!DISPUTES_ADDRESS) redirect("/disputes");
  return (
    <Suspense>
      <NewDispute />
    </Suspense>
  );
}

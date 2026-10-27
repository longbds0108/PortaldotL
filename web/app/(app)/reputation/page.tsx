import { Suspense } from "react";
import { ReputationPage } from "@/components/reputation/reputation-page";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Reputation — Plinths", "Uy tín — Plinths") };
}

export default function Page() {
  return (
    <Suspense>
      <ReputationPage />
    </Suspense>
  );
}

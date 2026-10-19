import { Suspense } from "react";
import { ReputationPage } from "@/components/reputation/reputation-page";

export const metadata = { title: "Reputation — Plinths" };

export default function Page() {
  return (
    <Suspense>
      <ReputationPage />
    </Suspense>
  );
}

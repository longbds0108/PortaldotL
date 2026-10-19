import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NewDispute } from "@/components/disputes/new-dispute";
import { DISPUTES_ADDRESS } from "@/lib/env";

export const metadata = { title: "Open a dispute — Plinths" };

export default function Page() {
  if (!DISPUTES_ADDRESS) redirect("/disputes");
  return (
    <Suspense>
      <NewDispute />
    </Suspense>
  );
}

import { redirect } from "next/navigation";
import { DisputeDetail } from "@/components/disputes/detail";
import { DISPUTES_ADDRESS } from "@/lib/env";

export const metadata = { title: "Dispute — Plinths" };

export default function Page() {
  if (!DISPUTES_ADDRESS) redirect("/disputes");
  return <DisputeDetail />;
}

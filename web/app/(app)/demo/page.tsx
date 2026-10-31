import { DemoLifecycle } from "@/components/demo-lifecycle";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Lifecycle walkthrough — Plinths", "Xem nhanh vòng đời — Plinths") };
}

export default function Page() {
  return <DemoLifecycle />;
}

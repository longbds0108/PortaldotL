import { AnalyticsPage } from "@/components/analytics/analytics-page";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Analytics — Plinths", "Phân tích — Plinths") };
}

export default function Page() {
  return <AnalyticsPage />;
}

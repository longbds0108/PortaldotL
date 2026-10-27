"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ConfigGate, WalletGate } from "@/components/gates";
import { useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { TenderCard } from "@/components/tender-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TenderState } from "@/lib/contracts";
import { useMyTenderIds, useTenders } from "@/lib/hooks";

export default function MyTendersPage() {
  const t = useT();
  return (
    <>
      <PageHeader
        eyebrow={t("Buyer workspace", "Không gian bên mời thầu")}
        title={t("My Tenders", "Gói thầu của tôi")}
        description={t("Tenders created by the connected wallet.", "Các gói thầu do ví đang kết nối tạo.")}
        actions={
          <Button asChild>
            <Link href="/tenders/new">
              <Plus /> {t("Create tender", "Tạo gói thầu")}
            </Link>
          </Button>
        }
      />
      <ConfigGate>
        <WalletGate>
          <MyTenders />
        </WalletGate>
      </ConfigGate>
    </>
  );
}

function MyTenders() {
  const ids = useMyTenderIds();
  const { rows, isLoading } = useTenders(ids.data ?? []);
  const t = useT();
  if (ids.isLoading || (isLoading && (ids.data?.length ?? 0) > 0)) return <Skeleton className="h-40" />;
  if (!ids.data?.length) {
    return (
      <EmptyState
        title={t("No tenders yet", "Chưa có gói thầu nào")}
        action={
          <Button asChild>
            <Link href="/tenders/new">{t("Create a tender", "Tạo gói thầu")}</Link>
          </Button>
        }
      >
        {t("Tenders you publish from this wallet will appear here.", "Các gói thầu bạn đăng từ ví này sẽ hiện ở đây.")}
      </EmptyState>
    );
  }
  const toEvaluate = rows.filter((r) => r.state === TenderState.Evaluation);
  return (
    <div className="space-y-6">
      {toEvaluate.length > 0 && (
        <Card className="border-primary/40 bg-accent/40">
          <CardContent className="flex flex-col gap-2 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">
              {t(
                `${toEvaluate.length} tender${toEvaluate.length > 1 ? "s are" : " is"} ready for evaluation.`,
                `${toEvaluate.length} gói thầu đã sẵn sàng để đánh giá.`,
              )}
            </p>
            <Button asChild size="sm">
              <Link href={`/tenders/${toEvaluate[0].id}/evaluate`}>{t("Evaluate now", "Đánh giá ngay")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <TenderCard key={r.id.toString()} row={r} />
        ))}
      </div>
    </div>
  );
}

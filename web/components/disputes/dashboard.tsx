"use client";

import { Ban, CheckCircle2, ChevronRight, Hourglass, Inbox, Plus, Scale } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Panel, Placeholder, StepList } from "@/components/insights/ui";
import { useLang, useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DisputeStatus, TRACK_TEXT, isClosed, reasonLabel, targetLabel } from "@/lib/disputes";
import { useArbiter, useDisputes, useEvidence, type DisputeView } from "@/lib/dispute-hooks";
import { formatDateTime, shortAddress } from "@/lib/format";
import { NETWORK_NAME } from "@/lib/network";
import type { T, Text } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TrackBadge } from "./engine";
import { DisputeStatusBadge } from "./parts";

export const process = (t: T) => [
  {
    title: t("File", "Nộp"),
    text: t(
      "Pick the tender or auction and the type of problem, explain it, cite transactions and attach files.",
      "Chọn gói thầu hoặc phiên đấu giá và loại vấn đề, giải thích, dẫn giao dịch và đính kèm file.",
    ),
  },
  {
    title: t("Evidence check", "Kiểm tra bằng chứng"),
    text: t(
      "Cited transactions are matched against the target's own on-chain events, and the Verification Engine re-checks the contract rules.",
      "Các giao dịch được dẫn sẽ được đối chiếu với sự kiện on-chain của đối tượng, và Verification Engine kiểm tra lại các quy tắc của contract.",
    ),
  },
  {
    title: t("Discussion", "Thảo luận"),
    text: t(
      "The organizer, bidders and anyone else can respond with more evidence. The Dispute Assistant can brief the panel.",
      "Bên tổ chức, nhà thầu và bất kỳ ai cũng có thể phản hồi kèm thêm bằng chứng. Trợ lý khiếu nại có thể tóm tắt cho hội đồng.",
    ),
  },
  {
    title: t("Outcome on record", "Kết quả được ghi nhận"),
    text: t(
      "Depending on the type, the engine result, the panel's reasoned decision, or the parties' settlement is recorded. It cannot be edited later.",
      "Tùy loại vấn đề, kết quả của engine, quyết định có lý do của hội đồng, hoặc thỏa thuận của các bên được ghi lại. Không thể sửa về sau.",
    ),
  },
];

type Tab = "all" | "active" | "resolved" | "rejected" | "mine";
const TABS: { key: Tab; label: Text }[] = [
  { key: "all", label: ["All", "Tất cả"] },
  { key: "active", label: ["In progress", "Đang xử lý"] },
  { key: "resolved", label: ["Resolved", "Đã giải quyết"] },
  { key: "rejected", label: ["Rejected", "Bị bác"] },
  { key: "mine", label: ["My disputes", "Khiếu nại của tôi"] },
];

export function DisputeDashboard() {
  const { address } = useAccount();
  const { rows, isLoading, error } = useDisputes();
  const arbiter = useArbiter();
  const [tab, setTab] = useState<Tab>("all");
  const t = useT();
  const isArbiter = !!address && !!arbiter && address.toLowerCase() === arbiter.toLowerCase();

  const counts = {
    total: rows.length,
    active: rows.filter((r) => !isClosed(r.core.status)).length,
    resolved: rows.filter((r) => r.core.status === DisputeStatus.Resolved).length,
    rejected: rows.filter((r) => r.core.status === DisputeStatus.Rejected).length,
  };
  const mine = (r: DisputeView) => !!address && r.posts.some((p) => p.type !== "status" && p.author.toLowerCase() === address.toLowerCase());
  const shown = rows.filter((r) =>
    tab === "all"
      ? true
      : tab === "active"
        ? !isClosed(r.core.status)
        : tab === "resolved"
          ? r.core.status === DisputeStatus.Resolved
          : tab === "rejected"
            ? r.core.status === DisputeStatus.Rejected
            : mine(r),
  );

  return (
    <>
      <PageHeader
        eyebrow={`${t("Proof of Fairness", "Bằng chứng công bằng")} · ${NETWORK_NAME}`}
        title={t("Dispute Center", "Trung tâm khiếu nại")}
        description={t(
          "Raise a concern about a tender or an auction, back it with evidence checked against the chain, and follow it to an outcome everyone can read. Plinths provides the evidence and a transparent process; it is not a legal authority.",
          "Nêu vấn đề về một gói thầu hoặc phiên đấu giá, kèm bằng chứng được đối chiếu với chain, và theo dõi đến kết quả mà ai cũng đọc được. Plinths cung cấp bằng chứng và quy trình minh bạch; Plinths không phải cơ quan pháp lý.",
        )}
        actions={
          <Button asChild>
            <Link href="/disputes/new">
              <Plus /> {t("New dispute", "Khiếu nại mới")}
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Count icon={Scale} label={t("Total disputes", "Tổng số khiếu nại")} value={isLoading ? undefined : counts.total} />
          <Count icon={Hourglass} label={t("In progress", "Đang xử lý")} value={isLoading ? undefined : counts.active} />
          <Count icon={CheckCircle2} label={t("Resolved", "Đã giải quyết")} value={isLoading ? undefined : counts.resolved} />
          <Count icon={Ban} label={t("Rejected", "Bị bác")} value={isLoading ? undefined : counts.rejected} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Panel
            eyebrow={t("Cases", "Hồ sơ")}
            title={t("Disputes", "Khiếu nại")}
            description={t(
              "Every dispute is public. Open one to see its timeline, evidence and decision.",
              "Mọi khiếu nại đều công khai. Mở một khiếu nại để xem dòng thời gian, bằng chứng và quyết định.",
            )}
          >
            <div role="tablist" aria-label={t("Filter disputes", "Lọc khiếu nại")} className="flex flex-wrap gap-2">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.key}
                  onClick={() => setTab(item.key)}
                  className={cn(
                    "inline-flex min-h-[34px] items-center rounded-full border border-overlay/10 px-4 text-[0.76rem] text-foreground-soft transition-colors hover:text-foreground",
                    tab === item.key && "border-transparent bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-foreground",
                  )}
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
            {error ? (
              <p className="text-sm text-destructive">
                {t("Could not load disputes:", "Không tải được khiếu nại:")} {error.message}
              </p>
            ) : isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : shown.length === 0 ? (
              <Placeholder
                icon={Inbox}
                title={
                  tab === "mine"
                    ? address
                      ? t("You have no disputes", "Bạn chưa có khiếu nại nào")
                      : t("Connect your wallet", "Hãy kết nối ví")
                    : t("No disputes here", "Chưa có khiếu nại nào ở đây")
                }
              >
                {tab === "mine"
                  ? t("Disputes you opened or responded to appear here.", "Các khiếu nại bạn đã mở hoặc phản hồi sẽ hiện ở đây.")
                  : t("Nothing matches this filter yet.", "Chưa có gì khớp bộ lọc này.")}
              </Placeholder>
            ) : (
              <ul className="space-y-2">
                {shown.map((r) => (
                  <DisputeRow key={r.id.toString()} row={r} />
                ))}
              </ul>
            )}
          </Panel>

          <div className="space-y-6">
            <Panel eyebrow={t("Published process", "Quy trình công khai")} title={t("From concern to decision", "Từ khiếu nại đến quyết định")}>
              <StepList steps={process(t)} />
              <Link href="/docs/disputes" className="inline-flex items-center gap-1 text-[0.78rem] text-link hover:underline">
                {t("Full rules", "Quy tắc đầy đủ")} <ChevronRight className="size-3.5" />
              </Link>
            </Panel>
            <Panel eyebrow={t("Who decides", "Ai quyết định")} title={t("It depends on the problem", "Tùy vào loại vấn đề")}>
              <ul className="space-y-3">
                {(["engine", "panel", "parties"] as const).map((track) => (
                  <li key={track} className="space-y-1">
                    <TrackBadge track={track} />
                    <p className="text-[0.74rem] leading-relaxed text-muted-foreground">{t(TRACK_TEXT[track])}</p>
                  </li>
                ))}
              </ul>
              <p className="border-t border-overlay/[0.06] pt-3 text-[0.72rem] text-muted-foreground">
                {t("Panel account", "Tài khoản hội đồng")}{" "}
                <span className="font-mono text-link" title={arbiter}>
                  {arbiter ? shortAddress(arbiter) : "…"}
                </span>
                {isArbiter && <span className="text-success-fg">{t(" · you are connected as the panel", " · bạn đang kết nối với tư cách hội đồng")}</span>}
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

function DisputeRow({ row }: { row: DisputeView }) {
  const opening = row.posts.find((p) => p.type === "opened");
  const doc = useEvidence(opening?.evidenceUri || undefined);
  const responses = row.posts.filter((p) => p.type === "response").length;
  const t = useT();
  const lang = useLang();
  return (
    <li>
      <Link
        href={`/disputes/${row.id}`}
        className="well flex flex-col gap-2 rounded-[14px] p-4 transition-colors hover:bg-overlay/[0.04] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-[0.72rem] text-muted-foreground">
            <span className="font-mono">#{row.id.toString()}</span>· {targetLabel(row.core.kind, row.core.targetId, t)} ·{" "}
            {reasonLabel(row.core.reason, t)}
          </p>
          <p className="truncate font-medium text-foreground">{doc.data?.title ?? (doc.isLoading ? "…" : reasonLabel(row.core.reason, t))}</p>
          <p className="text-[0.72rem] text-muted-foreground">
            {t("Opened by", "Mở bởi")} {shortAddress(row.core.opener)}
            {row.openedAt > 0n ? ` · ${formatDateTime(row.openedAt, lang)}` : ` · block #${row.openedBlock}`}
            {responses > 0 && t(` · ${responses} response${responses === 1 ? "" : "s"}`, ` · ${responses} phản hồi`)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DisputeStatusBadge status={row.core.status} />
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </Link>
    </li>
  );
}

function Count({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value?: number }) {
  return (
    <div className="well flex flex-col gap-3 rounded-[15px] p-4">
      <span className="flex items-center gap-2 text-[0.72rem] text-muted-foreground">
        <Icon className="size-3.5 text-link" aria-hidden="true" />
        {label}
      </span>
      <span className="text-[1.6rem] font-medium leading-none text-foreground tabular-nums">{value ?? "…"}</span>
    </div>
  );
}

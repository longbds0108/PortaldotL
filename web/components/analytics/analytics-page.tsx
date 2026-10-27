"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowLeftRight, Download, FileText, Gem, Users, Wallet } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { usePublicClient } from "wagmi";
import { Gauge, MeterRow, PHASES, PhaseLegend, StackBar } from "@/components/dashboard/charts";
import { useLang, useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RANGES, TX_LABEL_VI, analyticsJson, computeAnalytics, eventsCsv, type Analytics, type Range } from "@/lib/analytics";
import { formatNativeAmount } from "@/lib/format";
import { dateLocale } from "@/lib/i18n";
import { useChainNow } from "@/lib/hooks";
import { loadMarketSnapshot } from "@/lib/market-data";
import { NETWORK_NAME } from "@/lib/network";
import { downloadTextFile } from "@/lib/salt-vault";
import { cn } from "@/lib/utils";

// Validated (dataviz validate_palette): in-band and >= 3:1 on dark; 2.96:1 on light, relieved by visible values + table.
const ACCENT = "#5b8def";
const PHASE_COLOR = Object.fromEntries(PHASES.map((p) => [p.key, p.color])) as Record<(typeof PHASES)[number]["key"], string>;

export function useMarketSnapshot() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["market-snapshot"],
    queryFn: () => loadMarketSnapshot(client!),
    enabled: !!client,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Fees can be far below 0.01 tPOTv3; say so instead of printing 0.00. */
const feeText = (v: bigint | undefined) => (v === undefined ? "—" : v > 0n && v < 10n ** 16n ? "< 0.01 tPOTv3" : formatNativeAmount(v));

const pctText = (r: number | undefined) => (r === undefined ? "—" : `${Math.round(r * 100)}%`);

export function AnalyticsPage() {
  const snap = useMarketSnapshot();
  const now = useChainNow();
  const [range, setRange] = useState<Range>(30);
  const t = useT();
  const a = useMemo(() => (snap.data && now !== undefined ? computeAnalytics(snap.data, range, now) : undefined), [snap.data, range, now]);

  function exportAs(kind: "csv" | "json") {
    if (!a || !snap.data) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const label = range === 0 ? "all" : `${range}d`;
    if (kind === "csv") downloadTextFile(`plinths-activity-${label}-${stamp}.csv`, eventsCsv(a.events));
    else downloadTextFile(`plinths-analytics-${label}-${stamp}.json`, analyticsJson(a, { range, generatedAt: new Date().toISOString(), head: snap.data.head.number, blockTime: snap.data.blockTime }));
  }

  return (
    <>
      <PageHeader
        eyebrow={`${t("Proof of Fairness", "Bằng chứng công bằng")} · ${NETWORK_NAME}`}
        title={t("Analytics", "Phân tích")}
        description={t(
          "Market-wide numbers for tenders and NFT auctions, computed in your browser from public on-chain data. Sealed prices never appear here before they are revealed.",
          "Số liệu toàn thị trường cho gói thầu và đấu giá NFT, tính ngay trong trình duyệt từ dữ liệu on-chain công khai. Giá niêm phong không bao giờ xuất hiện ở đây trước khi được công bố.",
        )}
        actions={
          <>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Time range", "Khoảng thời gian")}>
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={range === r.value}
                  onClick={() => setRange(r.value)}
                  className={cn(
                    "inline-flex min-h-[34px] items-center rounded-full border border-overlay/10 px-4 text-[0.76rem] text-foreground-soft transition-colors hover:text-foreground",
                    range === r.value && "border-transparent bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-foreground",
                  )}
                >
                  {t(r.label)}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={!a} onClick={() => exportAs("csv")}>
              <Download /> CSV
            </Button>
            <Button variant="outline" size="sm" disabled={!a} onClick={() => exportAs("json")}>
              <Download /> JSON
            </Button>
          </>
        }
      />

      {snap.error ? (
        <p className="text-sm text-destructive">
          {t("Could not read the contracts:", "Không đọc được contract:")} {snap.error.message}
        </p>
      ) : !a || !snap.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[104px]" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <Dashboard a={a} />
      )}
    </>
  );
}

function Dashboard({ a }: { a: Analytics }) {
  const tn = a.tender;
  const t = useT();
  const lang = useLang();
  return (
    <div className="space-y-5">
      <Section label={t("Overview", "Tổng quan")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={FileText} label={t("Tenders", "Gói thầu")} value={a.overview.tenders} hint={t("Published in this period", "Đăng trong khoảng này")} />
          <Kpi icon={Gem} label={t("NFT auctions", "Đấu giá NFT")} value={a.overview.auctions} hint={t("Listed in this period", "Đăng bán trong khoảng này")} />
          <Kpi icon={Users} label={t("Wallets", "Ví")} value={a.overview.wallets} hint={t("Took part in this period", "Tham gia trong khoảng này")} />
          <Kpi
            icon={ArrowLeftRight}
            label={t("Transactions", "Giao dịch")}
            value={a.overview.transactions}
            hint={t("Successful contract calls", "Lời gọi contract thành công")}
          />
        </div>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title={t("Tender analytics", "Phân tích gói thầu")}
          subtitle={t(`${tn.total} tender${tn.total === 1 ? "" : "s"} published in this period`, `${tn.total} gói thầu được đăng trong khoảng này`)}
        >
          <div className="grid gap-4">
            <StackBar
              parts={[
                { phase: "awarded", count: tn.awarded },
                { phase: "evaluation", count: tn.evaluating },
                { phase: "reveal", count: tn.reveal },
                { phase: "open", count: tn.open },
                { phase: "closed", count: tn.failed + tn.cancelled },
              ]}
            />
            <PhaseLegend />
            <div className="grid gap-3.5 border-t border-overlay/[0.06] pt-4">
              <MeterRow label={t("Received at least one bid", "Có ít nhất một hồ sơ")} count={tn.withBids} total={tn.total} color={ACCENT} />
              <MeterRow label={t("Sealed bids revealed", "Hồ sơ niêm phong đã công bố")} count={tn.revealedBids} total={tn.sealedBids} color={PHASE_COLOR.reveal} />
              <MeterRow
                label={t("Awarded (of finished, not cancelled)", "Đã trao (trong số đã kết thúc, không tính hủy)")}
                count={tn.awarded}
                total={tn.finished - tn.cancelled}
                color={PHASE_COLOR.awarded}
              />
              <MeterRow label={t("Cancelled", "Đã hủy")} count={tn.cancelled} total={tn.total} color={PHASE_COLOR.closed} />
            </div>
          </div>
        </Panel>

        <Panel
          title={t("NFT auction analytics", "Phân tích đấu giá NFT")}
          subtitle={t(`${a.nft.total} auction${a.nft.total === 1 ? "" : "s"} listed in this period`, `${a.nft.total} phiên đấu giá được đăng trong khoảng này`)}
        >
          <div className="grid grid-cols-2 gap-3">
            <Mini label={t("Bidders", "Người đặt giá")} value={a.nft.bidders} />
            <Mini label={t("Sealed bids", "Giá niêm phong")} value={a.nft.bids} />
            <Mini label={t("Avg bids", "Số giá trung bình")} value={a.nft.avgBids === undefined ? "—" : a.nft.avgBids.toFixed(1)} />
            <Mini label={t("Volume", "Doanh số")} value={formatNativeAmount(a.nft.volume)} wide />
          </div>
          <div className="mt-4 grid gap-3.5 border-t border-overlay/[0.06] pt-4">
            <MeterRow label={t("Live (bidding or revealing)", "Đang diễn ra (đặt giá hoặc công bố)")} count={a.nft.live} total={a.nft.total} color={PHASE_COLOR.open} />
            <MeterRow label={t("Sold", "Đã bán")} count={a.nft.sold} total={a.nft.total} color={PHASE_COLOR.awarded} />
            <MeterRow label={t("Waiting for settlement", "Chờ kết thúc")} count={a.nft.awaitingSettle} total={a.nft.total} color={PHASE_COLOR.reveal} />
            <MeterRow
              label={t("No sale or cancelled", "Không bán được hoặc đã hủy")}
              count={a.nft.noSale + a.nft.cancelled}
              total={a.nft.total}
              color={PHASE_COLOR.closed}
            />
          </div>
        </Panel>
      </div>

      <Panel
        title={t("Transaction analytics", "Phân tích giao dịch")}
        subtitle={t("Successful calls per day, by type, and the gas they paid", "Lời gọi thành công theo ngày, theo loại, và gas đã trả")}
      >
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <DailyColumns daily={a.daily} />
          <div className="grid content-start gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Mini label={t("Avg fee", "Phí trung bình")} value={feeText(a.tx.avgFee)} wide />
              <Mini label={t("Avg gas", "Gas trung bình")} value={a.tx.avgGas === undefined ? "—" : a.tx.avgGas.toLocaleString(dateLocale(lang))} wide />
            </div>
            <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
              {t(
                `Gas known for ${a.tx.gasKnown} of ${a.tx.total} transactions (the RPC only serves recent receipts). Failed calls leave no events, so they are not counted here.`,
                `Biết được gas của ${a.tx.gasKnown} / ${a.tx.total} giao dịch (RPC chỉ trả receipt gần đây). Lời gọi thất bại không để lại sự kiện nên không được tính ở đây.`,
              )}
            </p>
            <ul className="grid gap-1.5 text-[0.76rem]">
              {a.tx.byType.length === 0 && <li className="text-muted-foreground">{t("No transactions in this period.", "Không có giao dịch nào trong khoảng này.")}</li>}
              {a.tx.byType.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3 border-b border-overlay/[0.05] pb-1.5 last:border-0">
                  <span className="text-foreground-soft">{t(r.label, TX_LABEL_VI[r.label] ?? r.label)}</span>
                  <span className="tabular-nums text-foreground">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={t("Participant analytics", "Phân tích người tham gia")} subtitle={t("Unique wallets that took part in this period", "Số ví khác nhau đã tham gia trong khoảng này")}>
          <div className="grid grid-cols-3 gap-3">
            <Mini label={t("Unique wallets", "Ví khác nhau")} value={a.participants.unique} />
            <Mini label={t("New", "Mới")} value={a.participants.newcomers} />
            <Mini label={t("Returning", "Quay lại")} value={a.participants.returning} />
          </div>
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            {t(
              "Returning = active before this period, or in two or more tenders / auctions.",
              "Quay lại = đã hoạt động trước khoảng này, hoặc tham gia từ hai gói thầu / phiên đấu giá trở lên.",
            )}
          </p>
          <div className="mt-4 grid gap-3.5 border-t border-overlay/[0.06] pt-4">
            <MeterRow label={t("Buyers (published a tender)", "Bên mời thầu (đã đăng gói thầu)")} count={a.participants.buyers} total={a.participants.unique} color={ACCENT} />
            <MeterRow
              label={t("Bidders (tenders or NFTs)", "Người dự thầu (gói thầu hoặc NFT)")}
              count={a.participants.bidders}
              total={a.participants.unique}
              color={PHASE_COLOR.evaluation}
            />
            <MeterRow label={t("NFT sellers", "Người bán NFT")} count={a.participants.sellers} total={a.participants.unique} color={PHASE_COLOR.open} />
          </div>
        </Panel>

        <Panel
          title={t("Settlement analytics", "Phân tích kết thúc")}
          subtitle={t("Tenders and auctions that reached the end of their process", "Gói thầu và phiên đấu giá đã đi hết quy trình")}
        >
          <div className="grid items-center gap-5 sm:grid-cols-[1fr_1.1fr]">
            <Gauge
              segments={[
                { key: "done", count: a.settlement.completed, color: PHASE_COLOR.awarded },
                { key: "pending", count: a.settlement.pending, color: "#b07a1f" }, // validated pair with awarded blue (dark + light)
              ]}
              value={pctText(a.settlement.completionRate)}
              caption={t("completed", "hoàn tất")}
            />
            <ul className="grid gap-2 text-[0.76rem]">
              <Line label={t("Completed", "Hoàn tất")} value={a.settlement.completed} />
              <Line label={t("Awaiting award", "Chờ trao thầu")} value={a.settlement.awaitingAward} />
              <Line label={t("Awaiting settlement", "Chờ kết thúc")} value={a.settlement.awaitingSettle} />
              <Line label={t("Bonds refunded", "Tiền bảo đảm đã hoàn")} value={`${a.settlement.bondRefunds} · ${formatNativeAmount(a.settlement.bondRefunded)}`} />
              <Line
                label={t("Deposits & proceeds paid", "Tiền cọc & tiền bán đã trả")}
                value={`${a.settlement.depositRefunds} · ${formatNativeAmount(a.settlement.depositRefunded)}`}
              />
              <Line label={t("Forfeited bonds to treasury", "Tiền bảo đảm bị phạt về treasury")} value={formatNativeAmount(a.settlement.forfeitSwept)} />
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Single series: successful transactions per day. Hover or focus a column for its value. */
function DailyColumns({ daily }: { daily: Analytics["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.txs));
  const [active, setActive] = useState<number>();
  const total = daily.reduce((s, d) => s + d.txs, 0);
  const shown = active !== undefined ? daily[active] : undefined;
  const t = useT();
  const lang = useLang();
  const fmt = (sec: number) => new Date(sec * 1000).toLocaleDateString(dateLocale(lang), { month: "short", day: "numeric" });
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between text-[0.72rem] text-muted-foreground">
        <span>
          <Activity className="mr-1 inline size-3.5 text-link" />
          {t("Transactions per day", "Giao dịch mỗi ngày")}
        </span>
        <span className="tabular-nums text-foreground">{shown ? `${fmt(shown.day)} · ${shown.txs}` : t(`${total} in total`, `Tổng ${total}`)}</span>
      </div>
      <div
        className="flex h-[150px] items-end gap-[2px]"
        onMouseLeave={() => setActive(undefined)}
        role="img"
        aria-label={t(`Transactions per day, ${total} in total`, `Giao dịch mỗi ngày, tổng ${total}`)}
      >
        {daily.map((d, i) => (
          <button
            key={d.day}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(undefined)}
            aria-label={t(`${fmt(d.day)}: ${d.txs} transaction${d.txs === 1 ? "" : "s"}`, `${fmt(d.day)}: ${d.txs} giao dịch`)}
            className="group flex h-full min-w-0 flex-1 items-end outline-none"
          >
            <span
              className={cn("w-full rounded-t-[4px] transition-[height,opacity] duration-500", d.txs === 0 && "bg-overlay/[0.07]", active !== undefined && active !== i && "opacity-55")}
              style={{ height: d.txs === 0 ? 2 : `${Math.max(6, (d.txs / max) * 100)}%`, background: d.txs ? ACCENT : undefined }}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[0.66rem] text-muted-foreground">
        <span>{daily[0] ? fmt(daily[0].day) : ""}</span>
        <span>{daily.at(-1) ? fmt(daily.at(-1)!.day) : ""}</span>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <p className="eyebrow text-[0.62rem]">{label}</p>
      {children}
    </section>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-[1.05rem] font-medium text-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[0.74rem] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Wallet; label: string; value: number; hint: string }) {
  return (
    <div className="well flex flex-col gap-3 rounded-[15px] p-4">
      <span className="flex items-center gap-2 text-[0.72rem] text-muted-foreground">
        <Icon className="size-3.5 text-link" aria-hidden="true" />
        {label}
      </span>
      <span className="text-[1.8rem] font-medium leading-none tracking-[-0.03em] text-foreground tabular-nums">{value}</span>
      <span className="text-[0.7rem] text-muted-foreground">{hint}</span>
    </div>
  );
}

function Mini({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("well rounded-[12px] p-3", wide && "col-span-1")}>
      <p className="text-[0.66rem] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-[1.05rem] font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-overlay/[0.05] pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums text-foreground">{value}</span>
    </li>
  );
}


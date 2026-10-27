"use client";

import { Award, Gavel, Gem, Info, Scale, Search, ShieldCheck, TrendingDown, TrendingUp, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { getAddress, isAddress } from "viem";
import { useAccount } from "wagmi";
import { useMarketSnapshot } from "@/components/analytics/analytics-page";
import { MeterRow } from "@/components/dashboard/charts";
import { useLang, useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisputes } from "@/lib/dispute-hooks";
import { formatDateTime, formatNativeAmount, shortAddress, shortHash } from "@/lib/format";
import { useChainNow } from "@/lib/hooks";
import { NETWORK_NAME } from "@/lib/network";
import { BASE_SCORE, RULES, computeReputation, type Profile } from "@/lib/reputation";
import type { Text } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LEVEL_VARIANT: Record<Profile["level"], "secondary" | "success" | "warning" | "outline" | "muted"> = {
  New: "muted",
  Building: "outline",
  Reliable: "secondary",
  Trusted: "success",
  "At risk": "warning",
};

const LEVEL_LABEL: Record<Profile["level"], Text> = {
  New: ["New", "Mới"],
  Building: ["Building", "Đang xây dựng"],
  Reliable: ["Reliable", "Đáng tin"],
  Trusted: ["Trusted", "Rất đáng tin"],
  "At risk": ["At risk", "Rủi ro"],
};

function LevelBadge({ level }: { level: Profile["level"] }) {
  const t = useT();
  return <Badge variant={LEVEL_VARIANT[level]}>{t(LEVEL_LABEL[level])}</Badge>;
}

export function ReputationPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { address } = useAccount();
  const snap = useMarketSnapshot();
  const disputes = useDisputes();
  const now = useChainNow();
  const t = useT();
  const [input, setInput] = useState(params.get("address") ?? "");
  const [error, setError] = useState<string>();
  const selected = params.get("address");
  const selectedAddr = selected && isAddress(selected) ? getAddress(selected) : undefined;

  const profiles = useMemo(() => {
    if (!snap.data || now === undefined) return undefined;
    const s = snap.data;
    const estimate = (block: bigint) => Math.round(s.head.timestamp - Number(s.head.number - block) * s.blockTime);
    return computeReputation(
      s,
      disputes.rows.map((d) => ({ id: d.id, core: d.core, openedAt: d.openedAt > 0n ? Number(d.openedAt) : estimate(d.openedBlock) })),
      now,
    );
  }, [snap.data, disputes.rows, now]);

  function lookup(value: string) {
    const v = value.trim();
    if (!isAddress(v)) return setError(t("Enter a valid wallet address (0x…).", "Hãy nhập địa chỉ ví hợp lệ (0x…)."));
    setError(undefined);
    router.push(`/reputation?address=${getAddress(v)}`);
  }

  const profile = selectedAddr && profiles ? profiles.get(selectedAddr.toLowerCase()) : undefined;
  const leaderboard = profiles ? [...profiles.values()].filter((p) => p.ledger.length >= 3).sort((a, b) => b.score - a.score || b.ledger.length - a.ledger.length).slice(0, 10) : [];

  return (
    <>
      <PageHeader
        eyebrow={`${t("Proof of Fairness", "Bằng chứng công bằng")} · ${NETWORK_NAME}`}
        title={t("Reputation", "Uy tín")}
        description={t(
          "A track record for every wallet on Plinths, built only from verifiable on-chain history. It measures behaviour and completed obligations on Plinths — not real-world trustworthiness.",
          "Lịch sử hoạt động của mọi ví trên Plinths, chỉ dựng từ dữ liệu on-chain kiểm chứng được. Nó đo hành vi và các nghĩa vụ đã hoàn thành trên Plinths — không phải độ tin cậy ngoài đời thực.",
        )}
      />

      <Card className="mb-6 p-5">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            lookup(input);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={t("Wallet address", "Địa chỉ ví")} placeholder={t("0x… wallet address", "0x… địa chỉ ví")} className="rounded-full pl-9 font-mono" value={input} onChange={(e) => setInput(e.target.value)} />
          </div>
          <Button type="submit">
            <Award /> {t("Look up", "Tra cứu")}
          </Button>
          {address && (
            <Button type="button" variant="outline" onClick={() => (setInput(address), lookup(address))}>
              <User /> {t("My profile", "Hồ sơ của tôi")}
            </Button>
          )}
        </form>
        <FieldError>{error}</FieldError>
      </Card>

      {snap.error ? (
        <p className="text-sm text-destructive">{t("Could not read the contracts:", "Không đọc được contract:")} {snap.error.message}</p>
      ) : !profiles ? (
        <Skeleton className="h-96" />
      ) : selectedAddr ? (
        profile ? (
          <ProfileView p={profile} />
        ) : (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {t(
              `${shortAddress(selectedAddr)} has no activity on Plinths yet, so there is nothing to score.`,
              `${shortAddress(selectedAddr)} chưa có hoạt động nào trên Plinths nên chưa có gì để chấm điểm.`,
            )}
          </Card>
        )
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <Leaderboard rows={leaderboard} />
          <RulesCard />
        </div>
      )}
    </>
  );
}

// ───────────────────────── profile ─────────────────────────

function ProfileView({ p }: { p: Profile }) {
  const delta = p.score - BASE_SCORE;
  const t = useT();
  const lang = useLang();
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="p-6">
          <p className="eyebrow">{t("Reputation profile", "Hồ sơ uy tín")}</p>
          <p className="mt-3 break-all font-mono text-[0.82rem] text-link">{p.address}</p>
          <div className="mt-5 flex items-end gap-4">
            <strong className="text-[3.6rem] font-normal leading-none tracking-[-0.05em] tabular-nums">{p.score}</strong>
            <div className="pb-1.5">
              <LevelBadge level={p.level} />
              <p className="mt-1.5 flex items-center gap-1 text-[0.72rem] text-muted-foreground">
                {delta >= 0 ? <TrendingUp className="size-3.5 text-success-fg" /> : <TrendingDown className="size-3.5 text-warning-fg" />}
                {delta >= 0 ? "+" : ""}
                {delta} {t(`from the starting ${BASE_SCORE}`, `so với mức khởi điểm ${BASE_SCORE}`)}
              </p>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-overlay/[0.06]" role="img" aria-label={t(`Score ${p.score} of 100`, `Điểm ${p.score} trên 100`)}>
            <div className="h-full rounded-full bg-[#5b8def]" style={{ width: `${p.score}%` }} />
          </div>
          <p className="mt-4 text-[0.72rem] leading-relaxed text-muted-foreground">
            {t("Score out of 100 from on-chain behaviour on Plinths only.", "Điểm trên thang 100, chỉ tính từ hành vi on-chain trên Plinths.")}{" "}
            {p.firstSeen ? t(`First seen ${formatDateTime(p.firstSeen, lang)}`, `Lần đầu xuất hiện ${formatDateTime(p.firstSeen, lang)}`) : ""}
            {p.lastSeen ? t(` · last active ${formatDateTime(p.lastSeen, lang)}`, ` · hoạt động gần nhất ${formatDateTime(p.lastSeen, lang)}`) : ""}{" "}
            {t("(times approximate).", "(thời gian ước tính).")}
          </p>
        </Card>

        <Card className="p-6">
          <p className="eyebrow">{t("Badges", "Huy hiệu")}</p>
          <p className="mt-1 text-[0.74rem] text-muted-foreground">
            {t(
              "Earned from verifiable achievements; each one follows from the history below.",
              "Nhận từ các thành tích kiểm chứng được; mỗi huy hiệu đều suy ra từ lịch sử bên dưới.",
            )}
          </p>
          {p.badges.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("No badges yet.", "Chưa có huy hiệu nào.")}</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.badges.map((b) => (
                <li key={b.key} className="well flex items-start gap-3 rounded-[14px] p-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[rgba(131,170,255,.3)] text-link">
                    <Award className="size-4" />
                  </span>
                  <span>
                    <span className="block text-[0.84rem] font-medium text-foreground">{t(b.label)}</span>
                    <span className="mt-0.5 block text-[0.72rem] text-muted-foreground">{t(b.detail)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <RoleCard icon={Gavel} title={t("As a bidder", "Vai trò nhà thầu")} empty={p.bidder.sealed === 0}>
          <Stats
            items={[
              [t("Tenders / auctions joined", "Gói thầu / phiên đấu giá đã tham gia"), p.bidder.markets],
              [t("Sealed bids", "Giá đã niêm phong"), p.bidder.sealed],
              [t("Wins", "Số lần thắng"), t(`${p.bidder.wins} tender · ${p.bidder.nftWins} NFT`, `${p.bidder.wins} gói thầu · ${p.bidder.nftWins} NFT`)],
              [t("Waiting to reveal", "Đang chờ công bố"), p.bidder.pending],
            ]}
          />
          <MeterRow label={t("Revealed in time", "Công bố đúng hạn")} count={p.bidder.revealed} total={p.bidder.revealed + p.bidder.missed} color="#3f7be0" />
          <MeterRow
            label={t("Missed reveals (bond / deposit penalty)", "Bỏ lỡ công bố (bị phạt tiền bảo đảm / cọc)")}
            count={p.bidder.missed}
            total={p.bidder.revealed + p.bidder.missed}
            color="#b07a1f"
          />
        </RoleCard>
        <RoleCard icon={ShieldCheck} title={t("As a tender creator", "Vai trò bên mời thầu")} empty={p.creator.published === 0}>
          <Stats
            items={[
              [t("Tenders published", "Gói thầu đã đăng"), p.creator.published],
              [t("Awarded", "Đã trao thầu"), p.creator.awarded],
              [t("Failed (no valid bids)", "Thất bại (không có hồ sơ hợp lệ)"), p.creator.failed],
              [
                t("Waiting for award", "Đang chờ trao thầu"),
                `${p.creator.pendingAward}${p.creator.overdue ? t(` (${p.creator.overdue} overdue)`, ` (${p.creator.overdue} quá hạn)`) : ""}`,
              ],
            ]}
          />
          <MeterRow label={t("Completed with an award", "Hoàn tất bằng trao thầu")} count={p.creator.awarded} total={p.creator.published} color="#3f7be0" />
          <MeterRow label={t("Cancelled", "Đã hủy")} count={p.creator.cancelled} total={p.creator.published} color="#b07a1f" />
        </RoleCard>
        <RoleCard icon={Gem} title={t("As an NFT seller", "Vai trò người bán NFT")} empty={p.seller.listed === 0}>
          <Stats
            items={[
              [t("Auctions listed", "Phiên đấu giá đã đăng"), p.seller.listed],
              [t("Sold", "Đã bán"), p.seller.sold],
              [t("No sale", "Không bán được"), p.seller.noSale],
              [t("Volume", "Doanh số"), formatNativeAmount(p.seller.volume)],
            ]}
          />
          <MeterRow label={t("Settled with a sale", "Kết thúc có người mua")} count={p.seller.sold} total={p.seller.listed} color="#3f7be0" />
          <MeterRow label={t("Cancelled", "Đã hủy")} count={p.seller.cancelled} total={p.seller.listed} color="#b07a1f" />
        </RoleCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="p-6">
          <p className="eyebrow">{t("Reputation history", "Lịch sử uy tín")}</p>
          <p className="mt-1 text-[0.74rem] text-muted-foreground">
            {t(
              "Every change to the score, newest first, with its reason and the transaction behind it.",
              "Mọi thay đổi điểm, mới nhất trước, kèm lý do và giao dịch tương ứng.",
            )}
          </p>
          {p.ledger.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t(
                `No completed or missed obligations yet — the score stays at ${BASE_SCORE}.`,
                `Chưa có nghĩa vụ nào hoàn thành hoặc bỏ lỡ — điểm giữ ở mức ${BASE_SCORE}.`,
              )}
            </p>
          ) : (
            <ol className="mt-4 divide-y divide-overlay/[0.05]">
              {[...p.ledger].reverse().map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-2.5 text-[0.78rem]">
                  <span className="min-w-0">
                    <span className="block text-foreground-soft">{t(RULES[l.rule].text)}</span>
                    <span className="block text-[0.7rem] text-muted-foreground">
                      {t(l.ref)} · ~{formatDateTime(l.time, lang)}
                      {l.txHash && (
                        <>
                          {" "}
                          · <span className="font-mono text-link" title={l.txHash}>{shortHash(l.txHash)}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className={cn("block font-medium", l.points >= 0 ? "text-success-fg" : "text-warning-fg")}>
                      {l.points >= 0 ? "+" : ""}
                      {l.points}
                    </span>
                    <span className="block text-[0.68rem] text-muted-foreground">→ {l.scoreAfter}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-6">
          <p className="eyebrow flex items-center gap-1.5">
            <Scale className="size-3.5" /> {t("Disputes", "Khiếu nại")}
          </p>
          <Stats
            items={[
              [t("Opened by this wallet", "Ví này đã mở"), p.disputes.opened],
              [t("About their tenders / auctions", "Về gói thầu / phiên đấu giá của họ"), p.disputes.aboutThem],
              [t("Upheld against them", "Được chấp nhận (bất lợi cho họ)"), p.disputes.upheldAgainst],
              [t("Rejected", "Bị bác"), p.disputes.rejectedAgainst],
              [t("Still open", "Còn mở"), p.disputes.open],
            ]}
          />
          <p className="mt-3 text-[0.72rem] leading-relaxed text-muted-foreground">
            {t(
              `Only decided disputes move the score: an upheld dispute about this wallet's tender or auction costs ${Math.abs(RULES.disputeUpheldAgainst.points)} points. Open or rejected disputes have no effect, and quality-of-goods cases are settled between the parties, outside Plinths.`,
              `Chỉ khiếu nại đã có quyết định mới làm đổi điểm: một khiếu nại được chấp nhận về gói thầu hoặc phiên đấu giá của ví này trừ ${Math.abs(RULES.disputeUpheldAgainst.points)} điểm. Khiếu nại còn mở hoặc bị bác không ảnh hưởng, và tranh chấp về chất lượng hàng hóa được các bên tự giải quyết bên ngoài Plinths.`,
            )}
          </p>
          {p.disputes.ids.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.disputes.ids.map((id) => (
                <Link key={id.toString()} href={`/disputes/${id}`} className="rounded-full border border-overlay/10 px-2.5 py-1 text-[0.72rem] text-link hover:bg-overlay/[0.04]">
                  {t("Dispute", "Khiếu nại")} #{id.toString()}
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function RoleCard({ icon: Icon, title, empty, children }: { icon: typeof Gavel; title: string; empty: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <Card className="p-6">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Icon className="size-4 text-link" /> {title}
      </p>
      {empty ? <p className="mt-3 text-sm text-muted-foreground">{t("No activity in this role.", "Chưa có hoạt động ở vai trò này.")}</p> : <div className="mt-4 grid gap-3.5">{children}</div>}
    </Card>
  );
}

function Stats({ items }: { items: [string, ReactNode][] }) {
  return (
    <ul className="grid gap-1.5 text-[0.76rem]">
      {items.map(([label, value]) => (
        <li key={label} className="flex items-center justify-between gap-3 border-b border-overlay/[0.05] pb-1.5 last:border-0">
          <span className="text-muted-foreground">{label}</span>
          <span className="text-right tabular-nums text-foreground">{value}</span>
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────── leaderboard & rules ─────────────────────────

function Leaderboard({ rows }: { rows: Profile[] }) {
  const t = useT();
  return (
    <Card className="p-6">
      <p className="eyebrow">{t("Leaderboard", "Bảng xếp hạng")}</p>
      <h2 className="mt-2 text-[1.15rem] font-medium text-foreground">{t("Most reliable participants", "Những người tham gia đáng tin nhất")}</h2>
      <p className="mt-1 text-[0.74rem] text-muted-foreground">
        {t("Wallets with at least three scored actions, by score.", "Các ví có ít nhất ba hoạt động được chấm điểm, xếp theo điểm.")}
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("Not enough activity yet for a leaderboard.", "Chưa đủ hoạt động để lập bảng xếp hạng.")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[0.78rem]">
            <thead>
              <tr className="border-b border-overlay/[0.07] text-muted-foreground">
                {["#", t("Wallet", "Ví"), t("Level", "Mức"), t("Actions", "Hoạt động"), t("Reveal rate", "Tỷ lệ công bố"), t("Score", "Điểm")].map((c) => (
                  <th key={c} scope="col" className="px-2 py-2.5 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.address} className="border-b border-overlay/[0.05] last:border-0">
                  <td className="px-2 py-2.5 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <Link href={`/reputation?address=${p.address}`} className="font-mono text-link hover:underline">
                      {shortAddress(p.address)}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    <LevelBadge level={p.level} />
                  </td>
                  <td className="px-2 py-2.5 tabular-nums">{p.ledger.length}</td>
                  <td className="px-2 py-2.5 tabular-nums">{p.bidder.revealRate === undefined ? "—" : `${Math.round(p.bidder.revealRate * 100)}%`}</td>
                  <td className="px-2 py-2.5 font-medium tabular-nums text-foreground">{p.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RulesCard() {
  const t = useT();
  return (
    <Card className="p-6">
      <p className="eyebrow flex items-center gap-1.5">
        <Info className="size-3.5" /> {t("How the score is built", "Cách tính điểm")}
      </p>
      <p className="mt-2 text-[0.74rem] leading-relaxed text-muted-foreground">
        {t(
          `Everyone starts at ${BASE_SCORE}. These published rules apply to on-chain history only; the score stays between 0 and 100.`,
          `Ai cũng bắt đầu ở mức ${BASE_SCORE}. Các quy tắc công khai này chỉ áp dụng cho lịch sử on-chain; điểm luôn nằm trong khoảng 0 đến 100.`,
        )}
      </p>
      <ul className="mt-4 grid gap-1.5 text-[0.76rem]">
        {Object.values(RULES).map((r) => (
          <li key={r.text[0]} className="flex items-start justify-between gap-3 border-b border-overlay/[0.05] pb-1.5 last:border-0">
            <span className="text-foreground-soft">{t(r.text)}</span>
            <span className={cn("shrink-0 font-medium tabular-nums", r.points >= 0 ? "text-success-fg" : "text-warning-fg")}>
              {r.points >= 0 ? "+" : ""}
              {r.points}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.72rem] leading-relaxed text-muted-foreground">
        {t(
          "Levels: New (fewer than three scored actions), Building, Reliable (65+), Trusted (85+), At risk (below 40).",
          "Các mức: Mới (dưới ba hoạt động được chấm), Đang xây dựng, Đáng tin (65+), Rất đáng tin (85+), Rủi ro (dưới 40).",
        )}
      </p>
    </Card>
  );
}


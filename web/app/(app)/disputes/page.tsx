import { FileSearch, Inbox, Scale, ScrollText } from "lucide-react";
import { DesignNote, InDesignBadge, Panel, Placeholder, StepList } from "@/components/insights/ui";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { DisputeDashboard } from "@/components/disputes/dashboard";
import { DISPUTES_ADDRESS } from "@/lib/env";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { NETWORK_NAME } from "@/lib/network";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Dispute Center — Plinths", "Trung tâm khiếu nại — Plinths") };
}

const tabs = (t: T) => [t("Open", "Đang mở"), t("Under review", "Đang xem xét"), t("Resolved", "Đã giải quyết")];

const reasons = (t: T) => [
  t("Deadline or timing", "Thời hạn hoặc thời điểm"),
  t("Reveal does not match", "Công bố không khớp"),
  t("Award reasoning", "Lý do trao thầu"),
  t("Eligibility", "Điều kiện tham gia"),
  t("Something else", "Vấn đề khác"),
];

const process = (t: T) => [
  { title: t("File", "Nộp"), text: t("Pick the tender or auction, the reason, and describe what went wrong.", "Chọn gói thầu hoặc phiên đấu giá, lý do, và mô tả điều gì đã sai.") },
  {
    title: t("Evidence pack", "Gói bằng chứng"),
    text: t(
      "Plinths attaches the on-chain timeline, commitments and verification results automatically.",
      "Plinths tự động đính kèm dòng thời gian on-chain, các commitment và kết quả kiểm chứng.",
    ),
  },
  { title: t("Review", "Xem xét"), text: t("The organizer answers and both sides can add documents.", "Bên tổ chức trả lời và hai bên đều có thể bổ sung tài liệu.") },
  {
    title: t("Outcome on record", "Kết quả được ghi nhận"),
    text: t("The decision and its reasoning are published so anyone can read them later.", "Quyết định và lập luận được công bố để ai cũng đọc được về sau."),
  },
];

/** Live once NEXT_PUBLIC_DISPUTES_ADDRESS is set; until then the design below. */
export default async function DisputesPage() {
  if (DISPUTES_ADDRESS) return <DisputeDashboard />;
  return <DisputesPreview t={await getT()} />;
}

function DisputesPreview({ t }: { t: T }) {
  return (
    <>
      <PageHeader
        eyebrow={`${t("Proof of Fairness", "Bằng chứng công bằng")} · ${NETWORK_NAME}`}
        title={t("Dispute Center", "Trung tâm khiếu nại")}
        description={t(
          "Raise a concern about a tender or an auction, back it with evidence from the chain, and follow it to an outcome everyone can see.",
          "Nêu vấn đề về một gói thầu hoặc phiên đấu giá, kèm bằng chứng từ chain, và theo dõi đến kết quả mà ai cũng thấy.",
        )}
        actions={<InDesignBadge />}
      />
      <DesignNote>{t("The layout is ready; filing and tracking disputes are not connected yet.", "Giao diện đã sẵn sàng; chức năng nộp và theo dõi khiếu nại chưa được kết nối.")}</DesignNote>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel eyebrow={t("Your disputes", "Khiếu nại của bạn")} title={t("Cases", "Hồ sơ")}>
            <div role="tablist" aria-label={t("Dispute status", "Trạng thái khiếu nại")} className="flex flex-wrap gap-2">
              {tabs(t).map((label, i) => (
                <span
                  key={label}
                  role="tab"
                  aria-selected={i === 0}
                  className={
                    i === 0
                      ? "inline-flex min-h-[34px] items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] px-4 text-[0.76rem] text-foreground"
                      : "inline-flex min-h-[34px] items-center gap-2 rounded-full border border-overlay/10 px-4 text-[0.76rem] text-foreground-soft"
                  }
                >
                  {label} <span className="text-muted-foreground">—</span>
                </span>
              ))}
            </div>
            <Placeholder icon={Inbox} title={t("No disputes", "Chưa có khiếu nại")}>
              {t(
                "Cases you file, or that are filed about your tenders and auctions, will appear here.",
                "Các vụ việc bạn nộp, hoặc người khác nộp về gói thầu và phiên đấu giá của bạn, sẽ hiện ở đây.",
              )}
            </Placeholder>
          </Panel>

          <Panel eyebrow={t("Process", "Quy trình")} title={t("From concern to outcome", "Từ khiếu nại đến kết quả")}>
            <StepList steps={process(t)} />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel eyebrow={t("New case", "Vụ việc mới")} title={t("Open a dispute", "Mở khiếu nại")}>
            <form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="d-target">{t("Tender or auction", "Gói thầu hoặc phiên đấu giá")}</Label>
                <Input id="d-target" placeholder={t("Tender #… or NFT auction #…", "Gói thầu #… hoặc đấu giá NFT #…")} disabled />
              </div>
              <div className="space-y-2">
                <Label>{t("Reason", "Lý do")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {reasons(t).map((r) => (
                    <span key={r} className="rounded-full border border-overlay/10 px-3 py-1 text-[0.72rem] text-muted-foreground">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-text">{t("What happened", "Chuyện gì đã xảy ra")}</Label>
                <Textarea id="d-text" rows={4} placeholder={t("Describe the problem and what you expected.", "Mô tả vấn đề và điều bạn mong đợi.")} disabled />
              </div>
              <div className="well flex items-start gap-3 rounded-[12px] p-3 text-[0.75rem] text-muted-foreground">
                <FileSearch className="mt-0.5 size-4 shrink-0 text-link" />
                {t(
                  "The on-chain timeline and verification results of the selected tender or auction will be attached as evidence.",
                  "Dòng thời gian on-chain và kết quả kiểm chứng của gói thầu hoặc phiên đấu giá được chọn sẽ được đính kèm làm bằng chứng.",
                )}
              </div>
              <Button type="button" className="w-full" disabled>
                <Scale /> {t("File dispute", "Nộp khiếu nại")}
              </Button>
            </form>
          </Panel>

          <Panel eyebrow={t("Good to know", "Nên biết")} title={t("What a dispute can and cannot do", "Khiếu nại làm được gì và không làm được gì")}>
            <ul className="space-y-3 text-[0.78rem] leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <ScrollText className="mt-0.5 size-4 shrink-0 text-link" />
                {t(
                  "It creates a public record with evidence. It does not reverse an award or a settlement already on-chain.",
                  "Khiếu nại tạo ra hồ sơ công khai kèm bằng chứng. Nó không đảo ngược quyết định trao thầu hay việc kết thúc đã có on-chain.",
                )}
              </li>
              <li className="flex gap-2">
                <ScrollText className="mt-0.5 size-4 shrink-0 text-link" />
                {t(
                  "Many concerns can be settled at once by the Verify button on a tender's Results page.",
                  "Nhiều thắc mắc có thể được giải đáp ngay bằng nút Kiểm chứng trên trang Kết quả của gói thầu.",
                )}
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

"use client";

import { ArrowLeft, CheckCircle2, Gem, Loader2, Lock, Scale, ScrollText, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { WalletGate } from "@/components/gates";
import { useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { uriToDigest } from "@/lib/cid";
import { REASONS, TRACK_TEXT, TargetKind, reasonOf, targetLabel } from "@/lib/disputes";
import { openedDisputeId, useDisputeTx, useEngineChecks, useTargetContext } from "@/lib/dispute-hooks";
import { shortAddress } from "@/lib/format";
import { uploadJson } from "@/lib/ipfs";
import { NETWORK_NAME } from "@/lib/network";
import { cn } from "@/lib/utils";
import { EngineCard, TrackBadge } from "./engine";
import { EMPTY_DRAFT, EvidenceFields, TargetName, draftProblem, draftToEvidence, saveEvidenceCopy, type EvidenceDraft } from "./parts";

export function NewDispute() {
  const params = useSearchParams();
  const router = useRouter();
  const tx = useDisputeTx();
  const [kind, setKind] = useState<TargetKind>(params.get("kind") === "nft" ? TargetKind.NftAuction : TargetKind.Tender);
  const [idInput, setIdInput] = useState(params.get("id") ?? "");
  const [reason, setReason] = useState<number>();
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<EvidenceDraft>(EMPTY_DRAFT);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const t = useT();

  const targetId = /^\d{1,18}$/.test(idInput.trim()) ? BigInt(idInput.trim()) : undefined;
  const ctx = useTargetContext(targetId !== undefined ? kind : undefined, targetId);
  const label =
    targetId !== undefined ? targetLabel(kind, targetId, t) : kind === TargetKind.Tender ? t("the tender", "gói thầu") : t("the auction", "phiên đấu giá");
  const targetOk = !!ctx.data?.exists;
  const checks = useEngineChecks(targetId !== undefined ? kind : undefined, ctx.data);
  const chosen = reason !== undefined ? reasonOf(reason) : undefined;
  const problem = !targetOk
    ? t("Choose an existing tender or auction.", "Hãy chọn một gói thầu hoặc phiên đấu giá có thật.")
    : reason === undefined
      ? t("Pick a reason.", "Hãy chọn lý do.")
      : title.trim().length < 5
        ? t("Give the dispute a short title (5+ characters).", "Hãy đặt tiêu đề ngắn cho khiếu nại (từ 5 ký tự).")
        : draftProblem(draft, t);

  async function submit() {
    setError(undefined);
    if (problem || targetId === undefined || reason === undefined) return setError(problem);
    try {
      setUploading(true);
      const evidence = draftToEvidence(draft, "opening", title.trim());
      const uri = await uploadJson(evidence, `dispute-${kind === TargetKind.Tender ? "tender" : "nft"}-${targetId}.json`);
      setUploading(false);
      const receipt = await tx.send("openDispute", [kind, targetId, reason, uriToDigest(uri)]);
      if (receipt) {
        const id = openedDisputeId(receipt);
        router.push(id !== undefined ? `/disputes/${id}` : "/disputes");
      }
    } catch (e) {
      setUploading(false);
      setError(e instanceof Error ? e.message : t("Could not upload the evidence.", "Không tải lên được bằng chứng."));
    }
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/disputes">
          <ArrowLeft /> {t("Dispute Center", "Trung tâm khiếu nại")}
        </Link>
      </Button>
      <PageHeader
        eyebrow={`${t("New dispute", "Khiếu nại mới")} · ${NETWORK_NAME}`}
        title={t("Open a dispute", "Mở khiếu nại")}
        description={t(
          "Describe the problem, cite the transactions involved and attach anything that helps. Everything you submit is published on IPFS and linked on-chain.",
          "Mô tả vấn đề, dẫn các giao dịch liên quan và đính kèm bất cứ thứ gì hữu ích. Mọi nội dung bạn gửi đều được đăng lên IPFS và liên kết on-chain.",
        )}
      />

      <WalletGate message={t("Connect your wallet to open a dispute.", "Hãy kết nối ví để mở khiếu nại.")}>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Step n={1} title={t("What is it about?", "Khiếu nại về việc gì?")} done={targetOk}>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Type", "Loại")}>
                  {[
                    { k: TargetKind.Tender, label: t("Tender", "Gói thầu"), icon: ScrollText },
                    { k: TargetKind.NftAuction, label: t("NFT auction", "Đấu giá NFT"), icon: Gem },
                  ].map(({ k, label: l, icon: Icon }) => (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={kind === k}
                      onClick={() => setKind(k)}
                      className={cn(
                        "inline-flex min-h-[38px] items-center gap-2 rounded-full border border-overlay/10 px-4 text-[0.8rem] text-foreground-soft transition-colors hover:text-foreground",
                        kind === k && "border-transparent bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-foreground",
                      )}
                    >
                      <Icon className="size-4" /> {l}
                    </button>
                  ))}
                </div>
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="target-id">{kind === TargetKind.Tender ? t("Tender ID", "Mã gói thầu") : t("Auction ID", "Mã phiên đấu giá")}</Label>
                  <Input id="target-id" inputMode="numeric" placeholder={t("e.g. 0", "vd. 0")} value={idInput} onChange={(e) => setIdInput(e.target.value)} />
                </div>
                {targetId !== undefined &&
                  (ctx.isLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> {t(`Reading ${label} from ${NETWORK_NAME}…`, `Đang đọc ${label} từ ${NETWORK_NAME}…`)}
                    </p>
                  ) : ctx.data?.exists ? (
                    <div className="well flex items-start gap-3 rounded-[12px] p-3 text-sm">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" />
                      <div>
                        <p className="font-medium text-foreground">
                          <TargetName kind={kind} targetId={targetId} ctx={ctx.data} />
                        </p>
                        <p className="text-[0.74rem] text-muted-foreground">
                          {kind === TargetKind.Tender ? t("Buyer", "Bên mời thầu") : t("Seller", "Người bán")} {shortAddress(ctx.data.organizer)} ·{" "}
                          {t(
                            `${ctx.data.bidders.length} bidder${ctx.data.bidders.length === 1 ? "" : "s"} · ${ctx.data.events.length} on-chain events`,
                            `${ctx.data.bidders.length} người tham gia · ${ctx.data.events.length} sự kiện on-chain`,
                          )}{" "}
                          ·{" "}
                          <Link className="text-link hover:underline" href={kind === TargetKind.Tender ? `/tenders/${targetId}` : `/nft/${targetId}`}>
                            {t("open", "mở")}
                          </Link>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-destructive">
                      <XCircle className="size-4" />{" "}
                      {kind === TargetKind.Tender
                        ? t("No tender with this ID.", "Không có gói thầu với mã này.")
                        : t("No NFT auction with this ID.", "Không có phiên đấu giá NFT với mã này.")}
                    </p>
                  ))}
              </div>
            </Step>

            <Step n={2} title={t("Reason", "Lý do")} done={reason !== undefined}>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("Reason", "Lý do")}>
                {REASONS.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    role="radio"
                    aria-checked={reason === r.code}
                    onClick={() => setReason(r.code)}
                    className={cn(
                      "rounded-[14px] border border-overlay/10 p-3 text-left transition-colors hover:border-overlay/25",
                      reason === r.code && "border-[rgba(131,170,255,.7)] bg-[color-mix(in_srgb,var(--tint)_10%,transparent)]",
                    )}
                  >
                    <span className="block text-[0.82rem] font-medium text-foreground">{t(r.label)}</span>
                    <span className="mt-0.5 block text-[0.72rem] leading-relaxed text-muted-foreground">{t(r.hint)}</span>
                    <TrackBadge track={r.track} className="mt-2" />
                  </button>
                ))}
              </div>
              {chosen && (
                <p className="mt-4 rounded-[12px] border border-overlay/[0.08] px-3 py-2.5 text-[0.76rem] leading-relaxed text-muted-foreground">
                  <b className="font-medium text-foreground-soft">{t("Who decides: ", "Ai quyết định: ")}</b>
                  {t(TRACK_TEXT[chosen.track])}
                </p>
              )}
            </Step>

            {chosen && "check" in chosen && targetOk && (
              <EngineCard checks={checks} focus={chosen.check} title={t("What the Verification Engine already shows", "Những gì Verification Engine đã cho thấy")} />
            )}

            <Step n={3} title={t("Statement & evidence", "Trình bày & bằng chứng")} done={false}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="d-title">{t("Title", "Tiêu đề")}</Label>
                  <Input id="d-title" maxLength={140} placeholder={t("One line that sums up the problem", "Một dòng tóm tắt vấn đề")} value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <EvidenceFields draft={draft} onChange={setDraft} events={ctx.data?.events} targetLabel={label} idPrefix="open" />
              </div>
            </Step>
          </div>

          <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardContent className="space-y-4 pt-5">
                <p className="eyebrow">{t("Submit", "Gửi")}</p>
                <ul className="space-y-2 text-[0.78rem] text-muted-foreground">
                  <Rule icon={<Lock />}>
                    {t(
                      "Your statement and attachments are public on IPFS. Do not include private data or secrets.",
                      "Nội dung trình bày và tệp đính kèm được công khai trên IPFS. Đừng đưa dữ liệu riêng tư hay bí mật vào.",
                    )}
                  </Rule>
                  <Rule icon={<Scale />}>
                    {t(
                      "Other parties can respond. A dispute is a public record: it does not reverse on-chain results, and Plinths is not a legal authority.",
                      "Các bên khác có thể phản hồi. Khiếu nại là hồ sơ công khai: không đảo ngược kết quả on-chain, và Plinths không phải cơ quan pháp lý.",
                    )}
                  </Rule>
                </ul>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  {t("I understand everything I submit becomes public and permanent.", "Tôi hiểu mọi nội dung tôi gửi sẽ công khai và vĩnh viễn.")}
                </label>
                <FieldError>{error}</FieldError>
                <Button className="w-full" size="lg" disabled={!!problem || !ack || uploading || tx.busy} onClick={submit}>
                  {(uploading || tx.busy) && <Loader2 className="animate-spin" />}
                  {uploading ? t("Uploading evidence…", "Đang tải bằng chứng lên…") : t("Open dispute", "Mở khiếu nại")}
                </Button>
                {problem && <p className="text-[0.72rem] text-muted-foreground">{problem}</p>}
                {draft.text.trim() && (
                  <button
                    type="button"
                    className="text-[0.72rem] text-link hover:underline"
                    onClick={() => saveEvidenceCopy(draftToEvidence(draft, "opening", title.trim()), "plinths-dispute-draft.json")}
                  >
                    {t("Save a copy of my statement", "Lưu một bản nội dung của tôi")}
                  </button>
                )}
                <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
              </CardContent>
            </Card>
            <Alert variant="info">
              <ScrollText />
              <span>
                {kind === TargetKind.Tender
                  ? t("Cited transactions are checked against the tender's own events as you type.", "Các giao dịch được dẫn sẽ được đối chiếu ngay với sự kiện của gói thầu khi bạn nhập.")
                  : t("Cited transactions are checked against the auction's own events as you type.", "Các giao dịch được dẫn sẽ được đối chiếu ngay với sự kiện của phiên đấu giá khi bạn nhập.")}
              </span>
            </Alert>
          </div>
        </div>
      </WalletGate>
    </>
  );
}

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-link">
      {icon}
      <span>{children}</span>
    </li>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className={cn("grid size-7 place-items-center rounded-full border border-primary text-sm text-primary", done && "border-success bg-success text-white")}>
            {done ? <CheckCircle2 className="size-4" /> : n}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { parseEventLogs, type Hex } from "viem";
import { z } from "zod";
import { Countdown, TimeNote } from "@/components/countdown";
import { ConfigGate, WalletGate } from "@/components/gates";
import { useLang, useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select";
import { MIN_REVEAL_WINDOW_S, blindBidAddress, blindBidMarketAbi } from "@/lib/contracts";
import { formatDateTime, formatDuration, isValidAmountInput, parseNativeAmount, parseTokenAmount } from "@/lib/format";
import { describeError, useBlindBidTx, useChainNow } from "@/lib/hooks";
import { uriToDigest } from "@/lib/cid";
import { uploadJson } from "@/lib/ipfs";
import type { T } from "@/lib/i18n";
import { CATEGORIES, CATEGORY_LABEL, tenderMetadataSchema, type TenderMetadata } from "@/lib/metadata";
import { loadProfile } from "@/lib/profile";

/** Validation messages follow the UI language, so the schema is built per language. */
function makeFormSchema(t: T) {
  const amount = (label: string, decimals = 6) =>
    z
      .string()
      .refine(
        (v) => isValidAmountInput(v, decimals),
        t(`${label}: enter a positive amount (max ${decimals} decimals)`, `${label}: nhập số dương (tối đa ${decimals} chữ số thập phân)`),
      );
  const required = t("Required", "Bắt buộc");
  return z
    .object({
      title: z.string().trim().min(3, t("At least 3 characters", "Ít nhất 3 ký tự")).max(120),
      category: z.enum(CATEGORIES),
      description: z.string().trim().min(10, t("At least 10 characters", "Ít nhất 10 ký tự")).max(5000),
      eligibility: z.string().max(2000),
      criteria: z.string().max(2000),
      budgetMin: amount(t("Minimum budget", "Ngân sách tối thiểu")),
      budgetMax: amount(t("Maximum budget", "Ngân sách tối đa")),
      submissionDeadline: z.string().min(1, required),
      revealDeadline: z.string().min(1, required),
      bidBond: amount(t("Bid bond", "Tiền bảo đảm"), 6),
    })
    .refine((v) => !isValidAmountInput(v.budgetMin) || !isValidAmountInput(v.budgetMax) || parseTokenAmount(v.budgetMin) <= parseTokenAmount(v.budgetMax), {
      path: ["budgetMax"],
      message: t("Maximum must be ≥ minimum", "Mức tối đa phải ≥ mức tối thiểu"),
    })
    .refine((v) => toUnix(v.revealDeadline) - toUnix(v.submissionDeadline) >= MIN_REVEAL_WINDOW_S, {
      path: ["revealDeadline"],
      message: t(
        "Reveal deadline must be at least 24 hours after the submission deadline",
        "Hạn công bố phải sau hạn nộp hồ sơ ít nhất 24 giờ",
      ),
    });
}
type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

/** datetime-local (device time zone) → unix seconds */
function toUnix(local: string): number {
  const ms = new Date(local).getTime();
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

function toLocalInput(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateTenderPage() {
  const t = useT();
  return (
    <>
      <PageHeader
        eyebrow={t("Buyer · new tender", "Bên mời thầu · gói thầu mới")}
        title={t("Create tender", "Tạo gói thầu")}
        description={t(
          "Publish a public tender. Bidders submit sealed commitments; nobody — including you — can read prices before the submission deadline.",
          "Đăng một gói thầu công khai. Nhà thầu gửi commitment niêm phong; không ai — kể cả bạn — đọc được giá trước hạn nộp hồ sơ.",
        )}
      />
      <ConfigGate>
        <WalletGate message={t("Connect the wallet that will own this tender.", "Kết nối ví sẽ sở hữu gói thầu này.")}>
          <CreateTenderForm />
        </WalletGate>
      </ConfigGate>
    </>
  );
}

function CreateTenderForm() {
  const router = useRouter();
  const chainNow = useChainNow();
  const tx = useBlindBidTx();
  const [uploadError, setUploadError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const t = useT();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);

  const now = Math.floor(Date.now() / 1000);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      category: "Technology",
      description: "",
      eligibility: "",
      criteria: "",
      budgetMin: "",
      budgetMax: "",
      submissionDeadline: toLocalInput(now + 7 * 86_400),
      revealDeadline: toLocalInput(now + 8 * 86_400),
      bidBond: "0",
    },
  });
  const { register, handleSubmit, formState, watch } = form;
  const errors = formState.errors;
  const sub = toUnix(watch("submissionDeadline"));
  const rev = toUnix(watch("revealDeadline"));

  async function onSubmit(v: FormValues) {
    setUploadError(undefined);
    tx.reset();
    const submissionDeadline = toUnix(v.submissionDeadline);
    const revealDeadline = toUnix(v.revealDeadline);
    if (chainNow !== undefined && submissionDeadline <= chainNow + 60) {
      form.setError("submissionDeadline", { message: t("Must be in the future (chain time)", "Phải ở tương lai (theo thời gian chain)") });
      return;
    }

    const metadata: TenderMetadata = tenderMetadataSchema.parse({
      version: 1,
      title: v.title.trim(),
      category: v.category,
      description: v.description.trim(),
      eligibility: v.eligibility.trim(),
      criteria: v.criteria.trim(),
      buyerName: loadProfile().businessName || undefined,
    });

    let metadataDigest: Hex;
    setUploading(true);
    try {
      metadataDigest = uriToDigest(await uploadJson(metadata, "tender.json"));
    } catch (e) {
      setUploadError(describeError(e));
      return;
    } finally {
      setUploading(false);
    }

    const receipt = await tx.send("createTender", [
      metadataDigest,
      parseTokenAmount(v.budgetMin),
      parseTokenAmount(v.budgetMax),
      BigInt(submissionDeadline),
      BigInt(revealDeadline),
      parseNativeAmount(v.bidBond),
    ]);
    if (!receipt) return;
    const [created] = parseEventLogs({ abi: blindBidMarketAbi, eventName: "TenderCreated", logs: receipt.logs });
    router.push(created ? `/tenders/${created.args.tenderId}` : "/my/tenders");
  }

  const busy = uploading || tx.busy;
  const lang = useLang();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("Tender details", "Thông tin gói thầu")}</CardTitle>
            <CardDescription>{t("Published to IPFS and visible to everyone.", "Được đăng lên IPFS và ai cũng xem được.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t("Title", "Tiêu đề")}</Label>
              <Input id="title" placeholder={t("Tender title", "Tên gói thầu")} {...register("title")} />
              <FieldError>{errors.title?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">{t("Category", "Danh mục")}</Label>
              <Controller
                name="category"
                control={form.control}
                render={({ field }) => (
                  <SelectMenu
                    id="category"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={CATEGORIES.map((c) => ({ value: c, label: t(CATEGORY_LABEL[c]) }))}
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t("Scope of work", "Phạm vi công việc")}</Label>
              <Textarea id="description" rows={6} {...register("description")} />
              <FieldError>{errors.description?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eligibility">{t("Eligibility requirements", "Điều kiện tham gia")}</Label>
              <Textarea
                id="eligibility"
                rows={3}
                placeholder={t("Licences, experience, certifications…", "Giấy phép, kinh nghiệm, chứng chỉ…")}
                {...register("eligibility")}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "Not verified on-chain yet (verifiable attestations are on the roadmap) — you exclude ineligible bids during evaluation.",
                  "Chưa được xác minh on-chain (chứng thực kiểm chứng được nằm trong lộ trình) — bạn loại hồ sơ không đủ điều kiện khi đánh giá.",
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="criteria">{t("Evaluation criteria", "Tiêu chí đánh giá")}</Label>
              <Textarea id="criteria" rows={3} placeholder={t("How bids will be compared", "Cách so sánh các hồ sơ")} {...register("criteria")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Budget & deadlines", "Ngân sách & thời hạn")}</CardTitle>
            <CardDescription>
              {t(
                "Budgets are public. Deadlines are enforced by the contract using block time.",
                "Ngân sách công khai. Contract cưỡng chế thời hạn theo thời gian block.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="budgetMin">{t("Minimum budget (tPOTv3)", "Ngân sách tối thiểu (tPOTv3)")}</Label>
              <Input id="budgetMin" inputMode="decimal" placeholder={t("Minimum, in tPOTv3", "Tối thiểu, tính bằng tPOTv3")} {...register("budgetMin")} />
              <FieldError>{errors.budgetMin?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budgetMax">{t("Maximum budget (tPOTv3)", "Ngân sách tối đa (tPOTv3)")}</Label>
              <Input id="budgetMax" inputMode="decimal" placeholder={t("Maximum, in tPOTv3", "Tối đa, tính bằng tPOTv3")} {...register("budgetMax")} />
              <FieldError>{errors.budgetMax?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="submissionDeadline">{t("Submission deadline", "Hạn nộp hồ sơ")}</Label>
              <Input id="submissionDeadline" type="datetime-local" lang={lang === "vi" ? "vi-VN" : "en-US"} {...register("submissionDeadline")} />
              <DatePreview unix={sub} />
              <FieldError>{errors.submissionDeadline?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="revealDeadline">{t("Reveal deadline", "Hạn công bố")}</Label>
              <Input id="revealDeadline" type="datetime-local" lang={lang === "vi" ? "vi-VN" : "en-US"} {...register("revealDeadline")} />
              <DatePreview unix={rev} />
              <FieldError>{errors.revealDeadline?.message}</FieldError>
              {rev > sub && <p className="text-xs text-muted-foreground">{t("Reveal window:", "Cửa sổ công bố:")} {formatDuration(rev - sub)}</p>}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bidBond">{t("Bid bond (tPOTv3, optional)", "Tiền bảo đảm dự thầu (tPOTv3, tùy chọn)")}</Label>
              <Input id="bidBond" inputMode="decimal" placeholder={t("0 for no bond", "0 nếu không yêu cầu")} {...register("bidBond")} />
              <FieldError>{errors.bidBond?.message}</FieldError>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Each bidder locks this amount. Revealed bids get it back; bonds of bids not revealed in time go to the Plinths treasury, not to you.",
                  "Mỗi nhà thầu khóa khoản này. Hồ sơ đã công bố được hoàn lại; tiền bảo đảm của hồ sơ không công bố đúng hạn chuyển về treasury của Plinths, không về bạn.",
                )}
              </p>
            </div>
            <div className="sm:col-span-2">
              <TimeNote />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Alert variant="info">
          <Info />
          <div className="space-y-1">
            <p className="font-medium">{t("How sealed bidding works", "Cách đấu thầu niêm phong hoạt động")}</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>{t("Until the submission deadline, bidders post only a hash of their price.", "Đến hạn nộp hồ sơ, nhà thầu chỉ gửi mã băm của giá.")}</li>
              <li>{t("During the reveal window, they open it; the contract checks it matches.", "Trong cửa sổ công bố, họ mở giá; contract kiểm tra có khớp không.")}</li>
              <li>
                {t(
                  "After that you compare revealed bids and award one, publicly and permanently.",
                  "Sau đó bạn so sánh các giá đã công bố và trao thầu cho một nhà thầu, công khai và vĩnh viễn.",
                )}
              </li>
            </ol>
          </div>
        </Alert>
        <Button type="submit" size="lg" className="w-full" disabled={busy || !blindBidAddress}>
          {busy && <Loader2 className="animate-spin" />}
          {uploading
            ? t("Uploading metadata…", "Đang tải metadata lên…")
            : blindBidAddress
              ? t("Publish tender", "Đăng gói thầu")
              : t("Contract required to publish", "Cần contract để đăng")}
        </Button>
        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
      </div>
    </form>
  );
}

/** The native picker follows the browser language; echo the chosen time in the UI language with a live chain-time countdown. */
function DatePreview({ unix }: { unix: number }) {
  const t = useT();
  const lang = useLang();
  if (!unix) return null;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>{formatDateTime(unix, lang)}</p>
      <Countdown
        deadline={BigInt(unix)}
        label={t("In", "Còn")}
        passedLabel={t("Already passed in chain time — pick a later time", "Đã qua theo thời gian chain — hãy chọn thời điểm muộn hơn")}
        className="text-xs"
      />
    </div>
  );
}

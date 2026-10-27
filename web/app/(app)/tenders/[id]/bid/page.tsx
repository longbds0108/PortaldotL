"use client";

import { AlertTriangle, CheckCircle2, Download, FileLock2, Loader2, Lock, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { Hex } from "viem";
import { useAccount } from "wagmi";
import { Countdown, TimeNote } from "@/components/countdown";
import { BidRiskNotice } from "@/components/bid-risk-notice";
import { BuyerHistory } from "@/components/buyer-history";
import { WalletGate } from "@/components/gates";
import { useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { TenderShell } from "@/components/tender-shell";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { uriToDigest } from "@/lib/cid";
import { computeCommitment, randomBytes32 } from "@/lib/commitment";
import { blindBidAddress, TenderState } from "@/lib/contracts";
import { encryptDocument, generateDocKey } from "@/lib/crypto";
import { formatBudget, formatNativeAmount, isValidAmountInput, parseTokenAmount, shortAddress } from "@/lib/format";
import { describeError, useBlindBidTx, useMyBid, type TenderRow } from "@/lib/hooks";
import { uploadJson } from "@/lib/ipfs";
import type { TenderMetadata } from "@/lib/metadata";
import { downloadTextFile, saveEntries, toBackupJson, type VaultEntry } from "@/lib/salt-vault";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export default function SubmitBidPage() {
  const t = useT();
  return (
    <TenderShell>
      {({ row, meta }) => (
        <>
          <PageHeader
            eyebrow={t(`Sealed bid · tender #${row.id}`, `Hồ sơ niêm phong · gói thầu #${row.id}`)}
            title={meta?.title ?? t(`Bid on tender #${row.id}`, `Dự thầu gói thầu #${row.id}`)}
            description={t(
              "Your price is sealed with a cryptographic commitment and your documents are encrypted in this browser.",
              "Giá của bạn được niêm phong bằng commitment mật mã và hồ sơ được mã hóa ngay trong trình duyệt này.",
            )}
          />
          <WalletGate message={t("Connect the wallet you will bid with.", "Kết nối ví bạn sẽ dùng để dự thầu.")}>
            <BidGuard row={row} meta={meta} />
          </WalletGate>
        </>
      )}
    </TenderShell>
  );
}

function BidGuard({ row, meta }: { row: TenderRow; meta?: TenderMetadata }) {
  const { address } = useAccount();
  const myBid = useMyBid(row.id);
  const t = useT();
  if (row.state !== TenderState.Open) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <span>
          {t("Submissions for this tender are closed.", "Gói thầu này đã đóng nhận hồ sơ.")}{" "}
          <Link className="underline" href={`/tenders/${row.id}`}>
            {t("Back to tender", "Quay lại gói thầu")}
          </Link>
        </span>
      </Alert>
    );
  }
  if (address?.toLowerCase() === row.tender.buyer.toLowerCase()) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <span>{t("You created this tender, so you cannot bid on it.", "Bạn là người tạo gói thầu này nên không thể dự thầu.")}</span>
      </Alert>
    );
  }
  if (myBid.isLoading) return <Loader2 className="animate-spin" />;
  const hasBid = !!myBid.data && myBid.data.commitment !== `0x${"0".repeat(64)}`;
  return <BidForm row={row} meta={meta} isUpdate={hasBid} onDone={() => void myBid.refetch()} />;
}

type Prepared = { entry: VaultEntry; commitment: Hex; encryptedDocURI: string };

function BidForm({ row, meta, isUpdate, onDone }: { row: TenderRow; meta?: TenderMetadata; isUpdate: boolean; onDone: () => void }) {
  const { id, tender } = row;
  const { address } = useAccount();
  const tx = useBlindBidTx();
  const [amountInput, setAmountInput] = useState("");
  const [file, setFile] = useState<File>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [inputError, setInputError] = useState<string>();
  const [sealing, setSealing] = useState(false);
  const [prepared, setPrepared] = useState<Prepared>();
  const [backedUp, setBackedUp] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [localSaved, setLocalSaved] = useState<boolean>();
  // What the confirmed transaction did. `isUpdate` flips to true as soon as the new bid is refetched,
  // so the success screen must not read it.
  const [completed, setCompleted] = useState<"submitted" | "updated">();
  const t = useT();

  const amount18 = isValidAmountInput(amountInput) ? parseTokenAmount(amountInput) : undefined;
  const outsideBudget = amount18 !== undefined && (amount18 < tender.budgetMin || amount18 > tender.budgetMax);

  function invalidate() {
    setPrepared(undefined);
    setBackedUp(false);
    setAcknowledged(false);
    tx.reset();
  }

  async function seal() {
    setInputError(undefined);
    if (!address || !blindBidAddress) return;
    if (amount18 === undefined || amount18 === 0n)
      return setInputError(t("Enter your bid amount in tPOTv3 (max 18 decimals).", "Nhập giá thầu bằng tPOTv3 (tối đa 18 chữ số thập phân)."));
    if (!file) return setInputError(t("Attach your technical proposal.", "Hãy đính kèm hồ sơ kỹ thuật."));
    if (file.size > MAX_FILE_BYTES) return setInputError(t("File is larger than 20 MB.", "File lớn hơn 20 MB."));

    setSealing(true);
    try {
      const salt = randomBytes32();
      const docKey = generateDocKey();
      const envelope = await encryptDocument(
        { name: file.name, type: file.type || "application/octet-stream", bytes: new Uint8Array(await file.arrayBuffer()) },
        docKey,
      );
      // Only ciphertext leaves the browser.
      const encryptedDocURI = await uploadJson(envelope, "sealed-bid.json");
      const commitment = computeCommitment({ tenderId: id, bidder: address, amount18, salt, docKey });
      const entry: VaultEntry = {
        v: 1,
        chainId: chain.id,
        contract: blindBidAddress,
        tenderId: id.toString(),
        bidder: address,
        amount18: amount18.toString(),
        salt,
        docKey,
        encryptedDocURI,
        createdAt: Date.now(),
      };
      setLocalSaved(saveEntries([entry]));
      setPrepared({ entry, commitment, encryptedDocURI });
    } catch (e) {
      setInputError(describeError(e));
    } finally {
      setSealing(false);
    }
  }

  function downloadBackup() {
    if (!prepared || !address) return;
    downloadTextFile(`plinths-tender-${id}-${shortAddress(address).replace("…", "-")}.json`, toBackupJson([prepared.entry]));
    setBackedUp(true);
  }

  async function submit() {
    if (!prepared) return;
    const wasUpdate = isUpdate;
    // One entry point: the first bid locks the bond, a replacement while Open sends none.
    const receipt = await tx.send(
      "submitBid",
      [id, prepared.commitment, uriToDigest(prepared.encryptedDocURI)],
      wasUpdate ? 0n : tender.bidBond,
    );
    if (receipt) {
      setCompleted(wasUpdate ? "updated" : "submitted");
      onDone();
    }
  }

  if (tx.status === "success" && completed) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <p className="text-lg font-semibold">
            {completed === "updated" ? t("Sealed bid updated", "Đã cập nhật hồ sơ niêm phong") : t("Sealed bid submitted", "Đã gửi hồ sơ niêm phong")}
          </p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {t("Keep your backup file safe. When the reveal window opens (", "Hãy giữ file sao lưu cẩn thận. Khi cửa sổ công bố mở (")}
            <Countdown className="inline-flex" deadline={tender.submissionDeadline} label={t("in", "sau")} passedLabel={t("now", "ngay bây giờ")} />
            {t(") reveal from ", ") hãy công bố tại ")}
            <Link href="/my/bids" className="underline">
              {t("My Bids", "Hồ sơ thầu của tôi")}
            </Link>
            .
          </p>
          <TxStatus status={tx.status} hash={tx.hash} />
          <Button asChild variant="outline">
            <Link href={`/tenders/${id}`}>{t("Back to tender", "Quay lại gói thầu")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <BidRiskNotice tender={tender} />
        {isUpdate && (
          <Alert variant="info">
            <Lock />
            <span>
              {t(
                <>
                  You already have a sealed bid. Submitting again replaces it — you must keep the <b>new</b> backup file.
                </>,
                <>
                  Bạn đã có một hồ sơ niêm phong. Gửi lại sẽ thay thế nó — bạn phải giữ file sao lưu <b>mới</b>.
                </>,
              )}
            </span>
          </Alert>
        )}
        <Step n={1} title={t("Your offer", "Giá chào của bạn")} done={!!prepared} active={!prepared}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">{t("Bid amount (tPOTv3)", "Giá thầu (tPOTv3)")}</Label>
              <Input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder={t("Your price, in tPOTv3", "Giá của bạn, tính bằng tPOTv3")}
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  invalidate();
                }}
              />
              {outsideBudget && (
                <p className="text-xs text-warning">
                  {t(
                    `Outside the expected budget (${formatBudget(tender.budgetMin, tender.budgetMax)}). You can still bid.`,
                    `Nằm ngoài ngân sách dự kiến (${formatBudget(tender.budgetMin, tender.budgetMax)}). Bạn vẫn có thể dự thầu.`,
                  )}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc">{t("Technical proposal", "Hồ sơ kỹ thuật")}</Label>
              {/* Native file inputs are labelled in the browser's language; use our own control in the UI language. */}
              <div className="flex min-w-0 items-center gap-3 well rounded-full p-1.5 pr-4">
                <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload /> {t("Choose file", "Chọn file")}
                </Button>
                <span className={cn("truncate text-sm", !file && "text-muted-foreground")}>{file?.name ?? t("No file chosen", "Chưa chọn file")}</span>
              </div>
              <input
                ref={fileRef}
                id="doc"
                type="file"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  invalidate();
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t("Encrypted with AES-256-GCM in your browser before upload. Max 20 MB.", "Được mã hóa AES-256-GCM trong trình duyệt trước khi tải lên. Tối đa 20 MB.")}
              </p>
            </div>
            <FieldError>{inputError}</FieldError>
            <Button onClick={seal} disabled={sealing || !!prepared || !address || !blindBidAddress}>
              {sealing ? <Loader2 className="animate-spin" /> : <FileLock2 />}
              {sealing ? t("Encrypting & uploading…", "Đang mã hóa & tải lên…") : prepared ? t("Sealed", "Đã niêm phong") : t("Seal bid", "Niêm phong hồ sơ")}
            </Button>
          </div>
        </Step>

        <Step n={2} title={t("Back up your secrets (required)", "Sao lưu bí mật (bắt buộc)")} done={backedUp} active={!!prepared && !backedUp}>
          <p className="mb-3 text-sm text-muted-foreground">
            {t(
              "The backup file holds your amount, salt and document key. Without it you cannot reveal — your bid is excluded",
              "File sao lưu chứa giá, salt và khóa hồ sơ của bạn. Thiếu nó bạn không thể công bố — hồ sơ sẽ bị loại",
            )}
            {tender.bidBond > 0n
              ? t(` and your ${formatNativeAmount(tender.bidBond)} bond is forfeited`, ` và mất ${formatNativeAmount(tender.bidBond)} tiền bảo đảm`)
              : ""}
            {t(". A copy is also kept in this browser", ". Trình duyệt này cũng giữ một bản")}
            {localSaved === false
              ? t(
                  " (failed: browser storage unavailable — the file is your only copy)",
                  " (thất bại: không dùng được bộ nhớ trình duyệt — file là bản duy nhất của bạn)",
                )
              : ""}
            {t(", but do not rely on it.", ", nhưng đừng dựa vào bản đó.")}
          </p>
          <Button variant={backedUp ? "outline" : "default"} disabled={!prepared} onClick={downloadBackup}>
            <Download /> {backedUp ? t("Download again", "Tải lại") : t("Download backup file", "Tải file sao lưu")}
          </Button>
        </Step>

        <Step
          n={3}
          title={isUpdate ? t("Replace sealed bid", "Thay hồ sơ niêm phong") : t("Submit sealed bid", "Gửi hồ sơ niêm phong")}
          done={false}
          active={backedUp}
        >
          <label className="mb-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={acknowledged} disabled={!backedUp} onChange={(e) => setAcknowledged(e.target.checked)} />
            {t(
              "I read the reveal window and bond rules above, stored the backup file somewhere safe, and understand I must reveal between the submission and reveal deadlines.",
              "Tôi đã đọc cửa sổ công bố và quy tắc tiền bảo đảm ở trên, đã cất file sao lưu ở nơi an toàn, và hiểu rằng tôi phải công bố trong khoảng từ hạn nộp hồ sơ đến hạn công bố.",
            )}
          </label>
          <Button size="lg" disabled={!backedUp || !acknowledged || tx.busy} onClick={submit}>
            {tx.busy && <Loader2 className="animate-spin" />}
            {isUpdate
              ? t("Replace sealed bid", "Thay hồ sơ niêm phong")
              : tender.bidBond > 0n
                ? t(`Submit sealed bid + ${formatNativeAmount(tender.bidBond)} bond`, `Gửi hồ sơ niêm phong + ${formatNativeAmount(tender.bidBond)} tiền bảo đảm`)
                : t("Submit sealed bid", "Gửi hồ sơ niêm phong")}
          </Button>
          <div className="mt-3">
            <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
          </div>
        </Step>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{meta?.title ?? t(`Tender #${id}`, `Gói thầu #${id}`)}</CardTitle>
            <CardDescription>
              {t("Expected budget", "Ngân sách dự kiến")} {formatBudget(tender.budgetMin, tender.budgetMax)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Countdown deadline={tender.submissionDeadline} label={t("Submissions close in", "Đóng nhận hồ sơ sau")} />
            <p>
              {t("Bid bond:", "Tiền bảo đảm:")} {tender.bidBond > 0n ? formatNativeAmount(tender.bidBond) : t("none", "không có")}
            </p>
            <TimeNote />
          </CardContent>
        </Card>
        <Alert variant="info">
          <Lock />
          <span>
            {t(
              <>
                Only <code>keccak256(tender, you, amount, salt, hash(docKey))</code> goes on-chain now. Nobody, including the buyer, can read your
                price until you reveal it.
              </>,
              <>
                Lúc này chỉ <code>keccak256(tender, you, amount, salt, hash(docKey))</code> được đưa lên chain. Không ai, kể cả bên mời thầu, đọc
                được giá cho đến khi bạn công bố.
              </>,
            )}
          </span>
        </Alert>
        <BuyerHistory buyer={tender.buyer} />
      </div>
    </div>
  );
}

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: React.ReactNode }) {
  return (
    <Card className={cn(!done && !active && "opacity-60")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-7 place-items-center rounded-full border text-sm",
              done && "border-success bg-success text-white",
              active && "border-primary text-primary",
            )}
          >
            {done ? <CheckCircle2 className="size-4" /> : n}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

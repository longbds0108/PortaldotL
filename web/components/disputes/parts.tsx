"use client";

import { AlertTriangle, CheckCircle2, Download, FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { useT } from "@/components/lang-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import {
  ATTACHMENT_TYPES,
  DisputeStatus,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TX_HASHES,
  PARTY_LABEL,
  STATUS_LABEL,
  TargetKind,
  attachmentBlob,
  fileToAttachment,
  isInlineImage,
  parseTxHashes,
  verifyTxHashes,
  type Attachment,
  type Evidence,
  type Party,
  type TargetEvent,
} from "@/lib/disputes";
import { useEvidence, type TargetContext } from "@/lib/dispute-hooks";
import { shortAddress, shortHash } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { useTenderMetadata } from "@/lib/hooks";
import { useNftMetadata, useNftToken } from "@/lib/nft-hooks";
import { downloadTextFile } from "@/lib/salt-vault";
import { cn } from "@/lib/utils";

export function DisputeStatusBadge({ status, className }: { status: DisputeStatus; className?: string }) {
  const variant =
    status === DisputeStatus.Open ? "secondary" : status === DisputeStatus.UnderReview ? "warning" : status === DisputeStatus.Resolved ? "success" : "muted";
  const t = useT();
  return (
    <Badge variant={variant} dot className={className}>
      {t(STATUS_LABEL[status])}
    </Badge>
  );
}

export function PartyChips({ parties }: { parties: Party[] }) {
  const t = useT();
  if (!parties.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {parties.map((p) => (
        <span key={p} className="rounded-full border border-overlay/10 px-2 py-px text-[0.64rem] text-foreground-soft">
          {t(PARTY_LABEL[p])}
        </span>
      ))}
    </span>
  );
}

/** Name of the disputed tender (metadata title) or auction (NFT name), with a fallback label. */
export function TargetName({ kind, targetId, ctx }: { kind: TargetKind; targetId: bigint; ctx?: TargetContext }) {
  const meta = useTenderMetadata(kind === TargetKind.Tender ? ctx?.metadataUri : undefined);
  const { token } = useNftToken(kind === TargetKind.NftAuction ? ctx?.collection : undefined, ctx?.tokenId);
  const nft = useNftMetadata(token.tokenURI);
  const t = useT();
  const fallback = kind === TargetKind.Tender ? t(`Tender #${targetId}`, `Gói thầu #${targetId}`) : t(`NFT auction #${targetId}`, `Đấu giá NFT #${targetId}`);
  return <>{(kind === TargetKind.Tender ? meta.data?.title : nft.data?.name) ?? fallback}</>;
}

// ───────────────────────── showing evidence ─────────────────────────

/** Loads an evidence document from IPFS and shows it, checking every cited transaction against the target's events. */
export function EvidenceDocument({ uri, events, targetLabel }: { uri: string; events?: TargetEvent[]; targetLabel: string }) {
  const doc = useEvidence(uri || undefined);
  const t = useT();
  if (!uri) return null;
  if (doc.isLoading) {
    return (
      <p className="flex items-center gap-2 text-[0.78rem] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> {t("Loading evidence from IPFS…", "Đang tải bằng chứng từ IPFS…")}
      </p>
    );
  }
  if (!doc.data)
    return (
      <p className="text-[0.78rem] text-warning-fg">
        {t(
          "The evidence document could not be loaded or is not in the expected format.",
          "Không tải được tài liệu bằng chứng hoặc tài liệu sai định dạng.",
        )}
      </p>
    );
  return <EvidenceBody evidence={doc.data} events={events} targetLabel={targetLabel} />;
}

export function EvidenceBody({ evidence, events, targetLabel }: { evidence: Evidence; events?: TargetEvent[]; targetLabel: string }) {
  return (
    <div className="space-y-3">
      {evidence.title && <p className="font-medium text-foreground">{evidence.title}</p>}
      <p className="whitespace-pre-wrap break-words text-[0.84rem] leading-relaxed text-foreground-soft">{evidence.text}</p>
      {evidence.txHashes.length > 0 && <TxChecks hashes={evidence.txHashes} events={events} targetLabel={targetLabel} />}
      {evidence.attachments.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {evidence.attachments.map((a) => (
            <AttachmentView key={a.sha256 + a.name} attachment={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Evidence Verification: each cited transaction must appear among the disputed tender's / auction's events. */
export function TxChecks({ hashes, events, targetLabel }: { hashes: readonly string[]; events?: TargetEvent[]; targetLabel: string }) {
  const checks = events ? verifyTxHashes(hashes, events) : undefined;
  const t = useT();
  return (
    <ul className="space-y-1.5">
      {hashes.map((h, i) => {
        const c = checks?.[i];
        return (
          <li key={h} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-overlay/[0.06] px-3 py-2 text-[0.74rem]">
            <span className="font-mono text-link" title={h}>
              {shortHash(h)}
            </span>
            {!c ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> {t("checking…", "đang kiểm tra…")}
              </span>
            ) : c.ok ? (
              <span className="flex items-center gap-1 text-success-fg">
                <CheckCircle2 className="size-3.5" /> {t(`On-chain in ${targetLabel}:`, `Có on-chain trong ${targetLabel}:`)} {c.events.map((e) => e.name).join(", ")} · block #{c.events[0].blockNumber.toString()}
                {c.events[0].actor && <> · {shortAddress(c.events[0].actor)}</>}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-warning-fg">
                <AlertTriangle className="size-3.5" /> {t(`Not found among ${targetLabel}'s on-chain events`, `Không có trong các sự kiện on-chain của ${targetLabel}`)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AttachmentView({ attachment: a }: { attachment: Attachment }) {
  const [url] = useState(() => (isInlineImage(a) ? URL.createObjectURL(attachmentBlob(a)) : undefined));
  const t = useT();
  const download = () => {
    const link = document.createElement("a");
    const href = URL.createObjectURL(attachmentBlob(a));
    link.href = href;
    link.download = a.name.replace(/[^\w.\- ]/g, "_");
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  return (
    <div className="well overflow-hidden rounded-[12px]">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL of an embedded attachment
        <img src={url} alt={a.name} className="max-h-56 w-full object-contain" />
      )}
      <div className="flex items-center justify-between gap-2 p-2.5 text-[0.72rem]">
        <span className="flex min-w-0 items-center gap-1.5 text-foreground-soft">
          {url ? <ImageIcon className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
          <span className="truncate">{a.name}</span>
          <span className="shrink-0 text-muted-foreground">{formatBytes(a.size)}</span>
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={download} aria-label={t(`Download ${a.name}`, `Tải ${a.name}`)}>
          <Download />
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── writing evidence ─────────────────────────

export type EvidenceDraft = { text: string; txInput: string; attachments: Attachment[] };
export const EMPTY_DRAFT: EvidenceDraft = { text: "", txInput: "", attachments: [] };

/** Evidence Submission fields: explanation, transaction hashes (checked live), attachments embedded in the document. */
export function EvidenceFields({
  draft,
  onChange,
  events,
  targetLabel,
  textLabel,
  textPlaceholder,
  idPrefix,
}: {
  draft: EvidenceDraft;
  onChange: (d: EvidenceDraft) => void;
  events?: TargetEvent[];
  targetLabel: string;
  textLabel?: string;
  textPlaceholder?: string;
  idPrefix: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string>();
  const [reading, setReading] = useState(false);
  const { hashes, invalid } = parseTxHashes(draft.txInput);
  const used = draft.attachments.reduce((n, a) => n + a.size, 0);
  const t = useT();

  async function addFiles(files: FileList) {
    setFileError(undefined);
    setReading(true);
    try {
      const next = [...draft.attachments];
      let total = used;
      for (const f of Array.from(files)) {
        if (next.length >= MAX_ATTACHMENTS) throw new Error(t(`At most ${MAX_ATTACHMENTS} attachments.`, `Tối đa ${MAX_ATTACHMENTS} tệp đính kèm.`));
        if (!(ATTACHMENT_TYPES as readonly string[]).includes(f.type))
          throw new Error(t(`${f.name}: use PNG, JPEG, WebP, GIF, PDF or plain text.`, `${f.name}: hãy dùng PNG, JPEG, WebP, GIF, PDF hoặc văn bản thuần.`));
        if (total + f.size > MAX_ATTACHMENT_BYTES)
          throw new Error(
            t(
              `Attachments are limited to ${formatBytes(MAX_ATTACHMENT_BYTES)} in total.`,
              `Tổng dung lượng tệp đính kèm tối đa ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
            ),
          );
        next.push(await fileToAttachment(f));
        total += f.size;
      }
      onChange({ ...draft, attachments: next });
    } catch (e) {
      setFileError(e instanceof Error ? e.message : t("Could not read the file.", "Không đọc được file."));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-text`}>{textLabel ?? t("Explanation", "Giải thích")}</Label>
        <Textarea
          id={`${idPrefix}-text`}
          rows={5}
          maxLength={5000}
          placeholder={textPlaceholder ?? t("What happened, and what should have happened instead?", "Chuyện gì đã xảy ra, và lẽ ra phải như thế nào?")} value={draft.text} onChange={(e) => onChange({ ...draft, text: e.target.value })} />
        <p className="text-right text-[0.68rem] text-muted-foreground">{draft.text.length} / 5000</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-tx`}>{t("Transaction hashes (optional)", "Mã giao dịch (tùy chọn)")}</Label>
        <Textarea
          id={`${idPrefix}-tx`}
          rows={2}
          className="font-mono text-[0.76rem]"
          placeholder={t("0x… one per line", "0x… mỗi dòng một mã")}
          value={draft.txInput}
          onChange={(e) => onChange({ ...draft, txInput: e.target.value })}
        />
        {invalid.length > 0 && (
          <FieldError>
            {t("Not a transaction hash:", "Không phải mã giao dịch:")} {invalid.slice(0, 2).join(", ")}
          </FieldError>
        )}
        {hashes.length > MAX_TX_HASHES && <FieldError>{t(`At most ${MAX_TX_HASHES} transaction hashes.`, `Tối đa ${MAX_TX_HASHES} mã giao dịch.`)}</FieldError>}
        {hashes.length > 0 && <TxChecks hashes={hashes.slice(0, MAX_TX_HASHES)} events={events} targetLabel={targetLabel} />}
      </div>

      <div className="space-y-2">
        <Label>{t("Attachments (optional)", "Tệp đính kèm (tùy chọn)")}</Label>
        {draft.attachments.length > 0 && (
          <ul className="space-y-1.5">
            {draft.attachments.map((a, i) => (
              <li key={a.sha256 + i} className="flex items-center justify-between gap-2 rounded-[10px] border border-overlay/[0.06] px-3 py-1.5 text-[0.74rem]">
                <span className="flex min-w-0 items-center gap-1.5 text-foreground-soft">
                  {isInlineImage(a) ? <ImageIcon className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(a.size)}</span>
                </span>
                <button
                  type="button"
                  aria-label={t(`Remove ${a.name}`, `Xóa ${a.name}`)}
                  className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-overlay/5 hover:text-foreground"
                  onClick={() => onChange({ ...draft, attachments: draft.attachments.filter((_, j) => j !== i) })}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={reading || draft.attachments.length >= MAX_ATTACHMENTS} onClick={() => fileRef.current?.click()}>
            {reading ? <Loader2 className="animate-spin" /> : <Paperclip />} {t("Add files", "Thêm file")}
          </Button>
          <span className="text-[0.7rem] text-muted-foreground">
            {t(
              `Images, PDF or text · up to ${MAX_ATTACHMENTS} files, ${formatBytes(MAX_ATTACHMENT_BYTES)} in total`,
              `Ảnh, PDF hoặc văn bản · tối đa ${MAX_ATTACHMENTS} file, tổng ${formatBytes(MAX_ATTACHMENT_BYTES)}`,
            )}
          </span>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ATTACHMENT_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => e.target.files?.length && void addFiles(e.target.files)}
          />
        </div>
        <FieldError>{fileError}</FieldError>
      </div>
    </div>
  );
}

export function draftProblem(d: EvidenceDraft, t: T): string | undefined {
  const { hashes, invalid } = parseTxHashes(d.txInput);
  if (!d.text.trim()) return t("Write an explanation.", "Hãy viết phần giải thích.");
  if (invalid.length) return t("Remove the entries that are not transaction hashes.", "Hãy xóa các dòng không phải mã giao dịch.");
  if (hashes.length > MAX_TX_HASHES) return t(`At most ${MAX_TX_HASHES} transaction hashes.`, `Tối đa ${MAX_TX_HASHES} mã giao dịch.`);
  return undefined;
}

export function draftToEvidence(d: EvidenceDraft, role: Evidence["role"], title?: string): Evidence {
  return {
    kind: "plinths-dispute-evidence",
    v: 1,
    role,
    ...(title ? { title } : {}),
    text: d.text.trim(),
    txHashes: parseTxHashes(d.txInput).hashes,
    attachments: d.attachments,
    createdAt: new Date().toISOString(),
  };
}

/** Lets a participant keep a copy of what they published. */
export function saveEvidenceCopy(e: Evidence, name: string) {
  downloadTextFile(name, JSON.stringify(e, null, 2));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AddressLine({ address, parties, children }: { address: Address; parties?: Party[]; children?: ReactNode }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5")}>
      <span className="font-mono text-[0.76rem] text-link" title={address}>
        {shortAddress(address)}
      </span>
      {parties && <PartyChips parties={parties} />}
      {children}
    </span>
  );
}

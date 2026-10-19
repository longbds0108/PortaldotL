"use client";

import { AlertTriangle, CheckCircle2, Download, FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { Address } from "viem";
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
import { useTenderMetadata } from "@/lib/hooks";
import { useNftMetadata, useNftToken } from "@/lib/nft-hooks";
import { downloadTextFile } from "@/lib/salt-vault";
import { cn } from "@/lib/utils";

export function DisputeStatusBadge({ status, className }: { status: DisputeStatus; className?: string }) {
  const variant =
    status === DisputeStatus.Open ? "secondary" : status === DisputeStatus.UnderReview ? "warning" : status === DisputeStatus.Resolved ? "success" : "muted";
  return (
    <Badge variant={variant} dot className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function PartyChips({ parties }: { parties: Party[] }) {
  if (!parties.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {parties.map((p) => (
        <span key={p} className="rounded-full border border-overlay/10 px-2 py-px text-[0.64rem] text-foreground-soft">
          {PARTY_LABEL[p]}
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
  const fallback = kind === TargetKind.Tender ? `Tender #${targetId}` : `NFT auction #${targetId}`;
  return <>{(kind === TargetKind.Tender ? meta.data?.title : nft.data?.name) ?? fallback}</>;
}

// ───────────────────────── showing evidence ─────────────────────────

/** Loads an evidence document from IPFS and shows it, checking every cited transaction against the target's events. */
export function EvidenceDocument({ uri, events, targetLabel }: { uri: string; events?: TargetEvent[]; targetLabel: string }) {
  const doc = useEvidence(uri || undefined);
  if (!uri) return null;
  if (doc.isLoading) {
    return (
      <p className="flex items-center gap-2 text-[0.78rem] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading evidence from IPFS…
      </p>
    );
  }
  if (!doc.data) return <p className="text-[0.78rem] text-warning-fg">The evidence document could not be loaded or is not in the expected format.</p>;
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
                <Loader2 className="size-3 animate-spin" /> checking…
              </span>
            ) : c.ok ? (
              <span className="flex items-center gap-1 text-success-fg">
                <CheckCircle2 className="size-3.5" /> On-chain in {targetLabel}: {c.events.map((e) => e.name).join(", ")} · block #{c.events[0].blockNumber.toString()}
                {c.events[0].actor && <> · {shortAddress(c.events[0].actor)}</>}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-warning-fg">
                <AlertTriangle className="size-3.5" /> Not found among {targetLabel}&apos;s on-chain events
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
        <Button type="button" size="sm" variant="ghost" onClick={download} aria-label={`Download ${a.name}`}>
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
  textLabel = "Explanation",
  textPlaceholder = "What happened, and what should have happened instead?",
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

  async function addFiles(files: FileList) {
    setFileError(undefined);
    setReading(true);
    try {
      const next = [...draft.attachments];
      let total = used;
      for (const f of Array.from(files)) {
        if (next.length >= MAX_ATTACHMENTS) throw new Error(`At most ${MAX_ATTACHMENTS} attachments.`);
        if (!(ATTACHMENT_TYPES as readonly string[]).includes(f.type)) throw new Error(`${f.name}: use PNG, JPEG, WebP, GIF, PDF or plain text.`);
        if (total + f.size > MAX_ATTACHMENT_BYTES) throw new Error(`Attachments are limited to ${formatBytes(MAX_ATTACHMENT_BYTES)} in total.`);
        next.push(await fileToAttachment(f));
        total += f.size;
      }
      onChange({ ...draft, attachments: next });
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-text`}>{textLabel}</Label>
        <Textarea id={`${idPrefix}-text`} rows={5} maxLength={5000} placeholder={textPlaceholder} value={draft.text} onChange={(e) => onChange({ ...draft, text: e.target.value })} />
        <p className="text-right text-[0.68rem] text-muted-foreground">{draft.text.length} / 5000</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-tx`}>Transaction hashes (optional)</Label>
        <Textarea
          id={`${idPrefix}-tx`}
          rows={2}
          className="font-mono text-[0.76rem]"
          placeholder="0x… one per line"
          value={draft.txInput}
          onChange={(e) => onChange({ ...draft, txInput: e.target.value })}
        />
        {invalid.length > 0 && <FieldError>Not a transaction hash: {invalid.slice(0, 2).join(", ")}</FieldError>}
        {hashes.length > MAX_TX_HASHES && <FieldError>At most {MAX_TX_HASHES} transaction hashes.</FieldError>}
        {hashes.length > 0 && <TxChecks hashes={hashes.slice(0, MAX_TX_HASHES)} events={events} targetLabel={targetLabel} />}
      </div>

      <div className="space-y-2">
        <Label>Attachments (optional)</Label>
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
                  aria-label={`Remove ${a.name}`}
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
            {reading ? <Loader2 className="animate-spin" /> : <Paperclip />} Add files
          </Button>
          <span className="text-[0.7rem] text-muted-foreground">
            Images, PDF or text · up to {MAX_ATTACHMENTS} files, {formatBytes(MAX_ATTACHMENT_BYTES)} in total
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

export function draftProblem(d: EvidenceDraft): string | undefined {
  const { hashes, invalid } = parseTxHashes(d.txInput);
  if (!d.text.trim()) return "Write an explanation.";
  if (invalid.length) return "Remove the entries that are not transaction hashes.";
  if (hashes.length > MAX_TX_HASHES) return `At most ${MAX_TX_HASHES} transaction hashes.`;
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

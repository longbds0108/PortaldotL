"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { parseEventLogs } from "viem";
import { z } from "zod";
import { TimeNote } from "@/components/countdown";
import { ConfigGate, WalletGate } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { blindBidMarketAbi } from "@/lib/contracts";
import { formatDateTime, formatDuration, isValidAmountInput, parseNativeWei, parseUsdc6 } from "@/lib/format";
import { describeError, useBlindBidTx, useChainNow } from "@/lib/hooks";
import { uploadJson } from "@/lib/ipfs";
import { CATEGORIES, tenderMetadataSchema, type TenderMetadata } from "@/lib/metadata";
import { loadProfile } from "@/lib/profile";

const MIN_REVEAL_WINDOW = 5 * 60;

const amount = (label: string, decimals = 6) =>
  z.string().refine((v) => isValidAmountInput(v, decimals), `${label}: enter a positive amount (max ${decimals} decimals)`);

const formSchema = z
  .object({
    title: z.string().trim().min(3, "At least 3 characters").max(120),
    category: z.enum(CATEGORIES),
    description: z.string().trim().min(10, "At least 10 characters").max(5000),
    eligibility: z.string().max(2000),
    criteria: z.string().max(2000),
    budgetMin: amount("Minimum budget"),
    budgetMax: amount("Maximum budget"),
    submissionDeadline: z.string().min(1, "Required"),
    revealDeadline: z.string().min(1, "Required"),
    bidBond: amount("Bid bond", 6),
  })
  .refine((v) => !isValidAmountInput(v.budgetMin) || !isValidAmountInput(v.budgetMax) || parseUsdc6(v.budgetMin) <= parseUsdc6(v.budgetMax), {
    path: ["budgetMax"],
    message: "Maximum must be ≥ minimum",
  })
  .refine((v) => toUnix(v.revealDeadline) - toUnix(v.submissionDeadline) >= MIN_REVEAL_WINDOW, {
    path: ["revealDeadline"],
    message: "Reveal deadline must be at least 5 minutes after the submission deadline",
  });
type FormValues = z.infer<typeof formSchema>;

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
  return (
    <>
      <PageHeader
        eyebrow="Buyer · new tender"
        title="Create tender"
        description="Publish a public tender. Bidders submit sealed commitments; nobody — including you — can read prices before the submission deadline."
      />
      <ConfigGate>
        <WalletGate message="Connect the wallet that will own this tender.">
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
      form.setError("submissionDeadline", { message: "Must be in the future (chain time)" });
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

    let metadataURI: string;
    setUploading(true);
    try {
      metadataURI = await uploadJson(metadata, "tender.json");
    } catch (e) {
      setUploadError(describeError(e));
      return;
    } finally {
      setUploading(false);
    }

    const receipt = await tx.send("createTender", [
      metadataURI,
      parseUsdc6(v.budgetMin),
      parseUsdc6(v.budgetMax),
      BigInt(submissionDeadline),
      BigInt(revealDeadline),
      parseNativeWei(v.bidBond),
    ]);
    if (!receipt) return;
    const [created] = parseEventLogs({ abi: blindBidMarketAbi, eventName: "TenderCreated", logs: receipt.logs });
    router.push(created ? `/tenders/${created.args.tenderId}` : "/my/tenders");
  }

  const busy = uploading || tx.busy;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Tender details</CardTitle>
            <CardDescription>Published to IPFS and visible to everyone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" placeholder="Enterprise Website Development" {...register("title")} />
              <FieldError>{errors.title?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select id="category" {...register("category")}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Scope of work</Label>
              <Textarea id="description" rows={6} {...register("description")} />
              <FieldError>{errors.description?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eligibility">Eligibility requirements</Label>
              <Textarea id="eligibility" rows={3} placeholder="Licences, experience, certifications…" {...register("eligibility")} />
              <p className="text-xs text-muted-foreground">
                Not verified on-chain in this version — you exclude ineligible bids during evaluation.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="criteria">Evaluation criteria</Label>
              <Textarea id="criteria" rows={3} placeholder="Price 60%, technical approach 30%, track record 10%" {...register("criteria")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget & deadlines</CardTitle>
            <CardDescription>Budgets are public. Deadlines are enforced by the contract using block time.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="budgetMin">Minimum budget (USDC)</Label>
              <Input id="budgetMin" inputMode="decimal" placeholder="5,000" {...register("budgetMin")} />
              <FieldError>{errors.budgetMin?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budgetMax">Maximum budget (USDC)</Label>
              <Input id="budgetMax" inputMode="decimal" placeholder="10,000" {...register("budgetMax")} />
              <FieldError>{errors.budgetMax?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="submissionDeadline">Submission deadline</Label>
              <Input id="submissionDeadline" type="datetime-local" lang="en-US" {...register("submissionDeadline")} />
              <DatePreview unix={sub} />
              <FieldError>{errors.submissionDeadline?.message}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="revealDeadline">Reveal deadline</Label>
              <Input id="revealDeadline" type="datetime-local" lang="en-US" {...register("revealDeadline")} />
              <DatePreview unix={rev} />
              <FieldError>{errors.revealDeadline?.message}</FieldError>
              {rev > sub && <p className="text-xs text-muted-foreground">Reveal window: {formatDuration(rev - sub)}</p>}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bidBond">Bid bond (USDC, optional)</Label>
              <Input id="bidBond" inputMode="decimal" placeholder="0" {...register("bidBond")} />
              <FieldError>{errors.bidBond?.message}</FieldError>
              <p className="text-xs text-muted-foreground">
                Each bidder locks this amount. Revealed bids get it back; bonds of bids not revealed in time go to you.
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
            <p className="font-medium">How sealed bidding works</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Until the submission deadline, bidders post only a hash of their price.</li>
              <li>During the reveal window, they open it; the contract checks it matches.</li>
              <li>After that you compare revealed bids and award one, publicly and permanently.</li>
            </ol>
          </div>
        </Alert>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {uploading ? "Uploading metadata…" : "Publish tender"}
        </Button>
        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
      </div>
    </form>
  );
}

/** The native picker follows the browser language; always echo the chosen time in English. */
function DatePreview({ unix }: { unix: number }) {
  if (!unix) return null;
  return <p className="text-xs text-muted-foreground">{formatDateTime(unix)}</p>;
}

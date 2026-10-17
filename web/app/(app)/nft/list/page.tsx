"use client";

import { AlertTriangle, CheckCircle2, Clock, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { TimeNote } from "@/components/countdown";
import { NftMedia, NftWalletGate } from "@/components/nft/nft-ui";
import { PageHeader } from "@/components/page-header";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select";
import { formatDateTime, formatNativeAmount, isValidAmountInput, parseTokenAmount, shortAddress } from "@/lib/format";
import { useChainNow } from "@/lib/hooks";
import { ERC721_ENUMERABLE_INTERFACE_ID, encodeListingData, erc721Abi, nftAuctionAddress } from "@/lib/nft-auction";
import { createdAuctionId, nftAuctionEnabled, useNftMetadata, useNftToken, useNftTx, useOwnedTokens } from "@/lib/nft-hooks";
import { PREVIEW_COLLECTION, PREVIEW_TOKENS } from "@/lib/nft-preview";
import { NETWORK_NAME } from "@/lib/network";
import { cn } from "@/lib/utils";

const BID_OPTIONS = [
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
];
const REVEAL_OPTIONS = [
  { value: "24", label: "24 hours (minimum)" },
  { value: "48", label: "48 hours" },
  { value: "72", label: "72 hours" },
];

export default function ListNftPage() {
  return (
    <>
      <PageHeader
        eyebrow={`List an NFT · ${NETWORK_NAME}`}
        title="List NFT"
        description="Put an ERC-721 you own up for a sealed-bid auction. It moves into the auction contract with one signature and stays locked until the auction ends."
      />
      <NftWalletGate message="Connect the wallet that holds the NFT.">
        <ListForm />
      </NftWalletGate>
    </>
  );
}

function ListForm() {
  const { address } = useAccount();
  const now = useChainNow();
  const tx = useNftTx();
  const [collectionInput, setCollectionInput] = useState(nftAuctionEnabled ? "" : PREVIEW_COLLECTION);
  const [tokenIdInput, setTokenIdInput] = useState(nftAuctionEnabled ? "" : "1");
  const [bidHours, setBidHours] = useState("72");
  const [revealHours, setRevealHours] = useState("24");
  const [reserveInput, setReserveInput] = useState("");
  const [created, setCreated] = useState<bigint | null>();

  const collection = isAddress(collectionInput.trim()) ? getAddress(collectionInput.trim()) : undefined;
  const tokenId = /^\d{1,78}$/.test(tokenIdInput.trim()) ? BigInt(tokenIdInput.trim()) : undefined;
  const { token, isLoading } = useNftToken(collection, tokenId);
  const meta = useNftMetadata(token.tokenURI);

  const isPreviewCollection = collection === PREVIEW_COLLECTION;
  const enumerable = useReadContract({
    address: collection,
    abi: erc721Abi,
    functionName: "supportsInterface",
    args: [ERC721_ENUMERABLE_INTERFACE_ID],
    query: { enabled: !!collection && !isPreviewCollection },
  });
  const owned = useOwnedTokens(collection, address, enumerable.data);
  const pickable = isPreviewCollection ? PREVIEW_TOKENS.map((t) => t.tokenId) : owned.tokenIds;

  const reserveValid = reserveInput.trim() === "" || isValidAmountInput(reserveInput);
  const reserve14 = reserveInput.trim() && reserveValid ? parseTokenAmount(reserveInput) : 0n;
  const ownsIt = isPreviewCollection || (!!token.owner && !!address && token.owner.toLowerCase() === address.toLowerCase());

  const tokenProblem: string | undefined =
    !collection || tokenId === undefined || isLoading
      ? undefined
      : token.isErc721 === false
        ? "This contract is not an ERC-721 collection."
        : token.missing
          ? "No token with this id in the collection."
          : !ownsIt
            ? `Owned by ${shortAddress(token.owner)}, not by the connected wallet.`
            : undefined;
  const ready = !!collection && tokenId !== undefined && !isLoading && !tokenProblem && ownsIt && reserveValid;

  const start = now ?? Math.floor(Date.now() / 1000);
  const bidDeadline = BigInt(start + Number(bidHours) * 3600);
  const revealDeadline = bidDeadline + BigInt(Number(revealHours) * 3600);

  async function list() {
    if (!ready || !nftAuctionAddress || !address || now === undefined || tokenId === undefined || !collection) return;
    // Deadlines from chain time at the moment of listing, so the contract's checks pass.
    const bd = BigInt(now + Number(bidHours) * 3600);
    const data = encodeListingData({ reserve14, bidDeadline: bd, revealDeadline: bd + BigInt(Number(revealHours) * 3600) });
    const receipt = await tx.run({
      address: collection,
      abi: erc721Abi,
      functionName: "safeTransferFrom",
      args: [address, nftAuctionAddress, tokenId, data],
    });
    if (receipt) setCreated(createdAuctionId(receipt) ?? null);
  }

  if (tx.status === "success" && created !== undefined) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <p className="text-lg font-semibold">NFT listed</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Your NFT is now held by the auction contract. Bidding closes {formatDateTime(bidDeadline)}.
          </p>
          <TxStatus status={tx.status} hash={tx.hash} />
          <Button asChild>
            <Link href={created !== null ? `/nft/${created}` : "/nft"}>{created !== null ? "View auction" : "Back to NFT Auctions"}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Step n={1} title="Choose the NFT" done={ready} active>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="space-y-2">
              <Label htmlFor="collection">Collection contract (ERC-721)</Label>
              <Input
                id="collection"
                placeholder="0x…"
                autoComplete="off"
                spellCheck={false}
                value={collectionInput}
                onChange={(e) => setCollectionInput(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token">Token ID</Label>
              <Input id="token" inputMode="numeric" placeholder="e.g. 1" value={tokenIdInput} onChange={(e) => setTokenIdInput(e.target.value)} />
            </div>
          </div>
          {collectionInput.trim() && !collection && <FieldError>Enter a valid contract address.</FieldError>}

          {pickable.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[0.76rem] text-muted-foreground">
                {isPreviewCollection ? "Plinths test collection" : "Your NFTs in this collection"} — pick one
              </p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {pickable.map((id) => (
                  <OwnedThumb
                    key={id.toString()}
                    collection={collection!}
                    tokenId={id}
                    selected={id === tokenId}
                    onSelect={() => setTokenIdInput(id.toString())}
                  />
                ))}
              </div>
            </div>
          )}
          {!isPreviewCollection && enumerable.data === false && (
            <p className="mt-3 text-xs text-muted-foreground">
              This collection cannot list a wallet&apos;s tokens on-chain, so enter the token ID yourself.
            </p>
          )}
        </Step>

        <Step n={2} title="Auction settings" done={false} active={ready}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Bidding stays open for</Label>
              <SelectMenu ariaLabel="Bidding duration" value={bidHours} onValueChange={setBidHours} options={BID_OPTIONS} />
              <p className="text-xs text-muted-foreground">Ends {formatDateTime(bidDeadline)}</p>
            </div>
            <div className="space-y-2">
              <Label>Then bidders reveal for</Label>
              <SelectMenu ariaLabel="Reveal window" value={revealHours} onValueChange={setRevealHours} options={REVEAL_OPTIONS} />
              <p className="text-xs text-muted-foreground">Reveal ends {formatDateTime(revealDeadline)}</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="reserve">Reserve price (optional)</Label>
              <div className="relative">
                <Input
                  id="reserve"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="No reserve"
                  value={reserveInput}
                  onChange={(e) => setReserveInput(e.target.value)}
                  className="pr-20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">tPOTv3</span>
              </div>
              {!reserveValid ? (
                <FieldError>Enter a tPOTv3 amount with at most 14 decimals.</FieldError>
              ) : (
                <p className="text-xs text-muted-foreground">Bids below the reserve do not count. If no bid reaches it, the NFT returns to you.</p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <TimeNote />
          </div>
        </Step>

        <Step n={3} title="List with one signature" done={false} active={ready}>
          <ul className="mb-5 grid gap-2 text-sm text-muted-foreground">
            <Rule icon={<Lock />}>The NFT moves into the auction contract and stays there until the auction ends.</Rule>
            <Rule icon={<ShieldCheck />}>You can cancel only while bidding is open and nobody has bid yet.</Rule>
            <Rule icon={<Clock />}>If no valid bid reaches the reserve, settling the auction returns the NFT to you.</Rule>
          </ul>
          <Button size="lg" disabled={!ready || !nftAuctionEnabled || tx.busy || now === undefined} onClick={list}>
            {tx.busy && <Loader2 className="animate-spin" />}
            List NFT for auction
          </Button>
          {!nftAuctionEnabled && (
            <p className="mt-3 text-xs text-muted-foreground">Listing opens once the auction contract is deployed.</p>
          )}
          <div className="mt-3">
            <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
          </div>
        </Step>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <NftMedia tokenURI={token.tokenURI} />
            <div>
              <p className="eyebrow">
                {token.collectionName ?? (collection ? shortAddress(collection) : "Collection")}
                {tokenId !== undefined ? ` · #${tokenId}` : ""}
              </p>
              <CardTitle className="mt-2 text-[1.2rem]">{meta.data?.name ?? (tokenId !== undefined ? `Token #${tokenId}` : "Choose an NFT")}</CardTitle>
              {meta.data?.description && <CardDescription className="mt-2 line-clamp-3">{meta.data.description}</CardDescription>}
            </div>
            {collection && tokenId !== undefined && (
              isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Checking ownership…
                </p>
              ) : tokenProblem ? (
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <XCircle className="mt-0.5 size-4 shrink-0" /> {tokenProblem}
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm text-success-fg">
                  <CheckCircle2 className="size-4" /> {isPreviewCollection ? "Sample NFT (preview)" : "You own this NFT"}
                </p>
              )
            )}
            <div className="grid gap-2 border-t border-overlay/[0.07] pt-4 text-sm">
              <Row label="Reserve">{reserve14 > 0n ? formatNativeAmount(reserve14) : "No reserve"}</Row>
              <Row label="Bidding ends">{formatDateTime(bidDeadline)}</Row>
              <Row label="Reveal ends">{formatDateTime(revealDeadline)}</Row>
            </div>
          </CardContent>
        </Card>
        <Alert variant="info">
          <AlertTriangle />
          <span>
            Only ERC-721 NFTs on {NETWORK_NAME} can be listed. Payment is always native tPOTv3. Plinths does not mint NFTs.
          </span>
        </Alert>
      </div>
    </div>
  );
}

function OwnedThumb({ collection, tokenId, selected, onSelect }: { collection: Address; tokenId: bigint; selected: boolean; onSelect: () => void }) {
  const { token } = useNftToken(collection, tokenId);
  const meta = useNftMetadata(token.tokenURI);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-[14px] border border-overlay/10 p-1.5 text-left transition-colors hover:border-overlay/25",
        selected && "border-[rgba(131,170,255,.7)] bg-[color-mix(in_srgb,var(--tint)_10%,transparent)]",
      )}
    >
      <NftMedia tokenURI={token.tokenURI} className="rounded-[10px]" />
      <span className="mt-1.5 block truncate px-1 text-[0.72rem] text-foreground-soft">{meta.data?.name ?? `#${tokenId}`}</span>
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
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

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: ReactNode }) {
  return (
    <Card className={cn(!done && !active && "opacity-60")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-7 place-items-center rounded-full border text-sm",
              done && "border-success bg-success text-white",
              active && !done && "border-primary text-primary",
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

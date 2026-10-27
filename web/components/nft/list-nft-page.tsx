"use client";

import { AlertTriangle, CheckCircle2, Clock, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { TimeNote } from "@/components/countdown";
import { useLang, useT } from "@/components/lang-provider";
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
import { TEST_NFT_ADDRESS } from "@/lib/env";
import { ERC721_ENUMERABLE_INTERFACE_ID, encodeListingData, erc721Abi, nftAuctionAddress, sealedNftAuctionAbi } from "@/lib/nft-auction";
import { createdAuctionId, nftAuctionEnabled, useNftMetadata, useNftToken, useNftTx, useOwnedTokens } from "@/lib/nft-hooks";
import { PREVIEW_COLLECTION, PREVIEW_TOKENS } from "@/lib/nft-preview";
import { NETWORK_NAME } from "@/lib/network";
import type { T } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const bidOptions = (t: T) => [
  { value: "24", label: t("24 hours", "24 giờ") },
  { value: "72", label: t("3 days", "3 ngày") },
  { value: "168", label: t("7 days", "7 ngày") },
];
/** The collection's errors plus the auction's, so a revert inside onERC721Received (bubbled up) is readable. */
const LISTING_ABI = [...erc721Abi, ...sealedNftAuctionAbi.filter((x) => x.type === "error")];
const TEST_TOKEN_IDS = [1n, 2n, 3n];

const revealOptions = (t: T) => [
  { value: "24", label: t("24 hours (minimum)", "24 giờ (tối thiểu)") },
  { value: "48", label: t("48 hours", "48 giờ") },
  { value: "72", label: t("72 hours", "72 giờ") },
];

export default function ListNftPage() {
  const t = useT();
  return (
    <>
      <PageHeader
        eyebrow={`${t("List an NFT", "Đăng bán NFT")} · ${NETWORK_NAME}`}
        title={t("List NFT", "Đăng bán NFT")}
        description={t(
          "Put an ERC-721 you own up for a sealed-bid auction. It moves into the auction contract with one signature and stays locked until the auction ends.",
          "Đưa một ERC-721 bạn sở hữu vào đấu giá niêm phong. NFT chuyển vào contract đấu giá chỉ với một chữ ký và bị khóa đến khi phiên đấu giá kết thúc.",
        )}
      />
      <NftWalletGate message={t("Connect the wallet that holds the NFT.", "Kết nối ví đang giữ NFT.")}>
        <ListForm />
      </NftWalletGate>
    </>
  );
}

function ListForm() {
  const { address } = useAccount();
  const now = useChainNow();
  const tx = useNftTx();
  const [collectionInput, setCollectionInput] = useState(nftAuctionEnabled ? (TEST_NFT_ADDRESS ?? "") : PREVIEW_COLLECTION);
  const [tokenIdInput, setTokenIdInput] = useState(nftAuctionEnabled ? "" : "1");
  const [bidHours, setBidHours] = useState("72");
  const [revealHours, setRevealHours] = useState("24");
  const [reserveInput, setReserveInput] = useState("");
  const [created, setCreated] = useState<bigint | null>();
  const t = useT();
  const lang = useLang();

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
  const isTestCollection = !!TEST_NFT_ADDRESS && collection === TEST_NFT_ADDRESS;
  const pickable = isPreviewCollection ? PREVIEW_TOKENS.map((p) => p.tokenId) : isTestCollection ? TEST_TOKEN_IDS : owned.tokenIds;

  const reserveValid = reserveInput.trim() === "" || isValidAmountInput(reserveInput);
  const reserve18 = reserveInput.trim() && reserveValid ? parseTokenAmount(reserveInput) : 0n;
  const ownsIt = isPreviewCollection || (!!token.owner && !!address && token.owner.toLowerCase() === address.toLowerCase());

  const tokenProblem: string | undefined =
    !collection || tokenId === undefined || isLoading
      ? undefined
      : token.isErc721 === false
        ? t("This contract is not an ERC-721 collection.", "Contract này không phải bộ sưu tập ERC-721.")
        : token.missing
          ? t("No token with this id in the collection.", "Bộ sưu tập không có token với id này.")
          : !ownsIt
            ? t(`Owned by ${shortAddress(token.owner)}, not by the connected wallet.`, `Thuộc sở hữu của ${shortAddress(token.owner)}, không phải ví đang kết nối.`)
            : undefined;
  const ready = !!collection && tokenId !== undefined && !isLoading && !tokenProblem && ownsIt && reserveValid;

  const start = now ?? Math.floor(Date.now() / 1000);
  const bidDeadline = BigInt(start + Number(bidHours) * 3600);
  const revealDeadline = bidDeadline + BigInt(Number(revealHours) * 3600);

  async function list() {
    if (!ready || !nftAuctionAddress || !address || now === undefined || tokenId === undefined || !collection) return;
    // Deadlines from chain time at the moment of listing, so the contract's checks pass.
    const bd = BigInt(now + Number(bidHours) * 3600);
    const data = encodeListingData({ reserve18, bidDeadline: bd, revealDeadline: bd + BigInt(Number(revealHours) * 3600) });
    const receipt = await tx.run({
      address: collection,
      abi: LISTING_ABI,
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
          <p className="text-lg font-semibold">{t("NFT listed", "Đã đăng bán NFT")}</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {t(
              `Your NFT is now held by the auction contract. Bidding closes ${formatDateTime(bidDeadline, lang)}.`,
              `NFT của bạn đang được contract đấu giá giữ. Hết hạn đặt giá lúc ${formatDateTime(bidDeadline, lang)}.`,
            )}
          </p>
          <TxStatus status={tx.status} hash={tx.hash} />
          <Button asChild>
            <Link href={created !== null ? `/nft/${created}` : "/nft"}>
              {created !== null ? t("View auction", "Xem phiên đấu giá") : t("Back to NFT Auctions", "Quay lại Đấu giá NFT")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Step n={1} title={t("Choose the NFT", "Chọn NFT")} done={ready} active>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="space-y-2">
              <Label htmlFor="collection">{t("Collection contract (ERC-721)", "Contract bộ sưu tập (ERC-721)")}</Label>
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
              <Input id="token" inputMode="numeric" placeholder={t("e.g. 1", "vd. 1")} value={tokenIdInput} onChange={(e) => setTokenIdInput(e.target.value)} />
            </div>
          </div>
          {collectionInput.trim() && !collection && <FieldError>{t("Enter a valid contract address.", "Hãy nhập địa chỉ contract hợp lệ.")}</FieldError>}

          {pickable.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[0.76rem] text-muted-foreground">
                {isPreviewCollection || isTestCollection
                  ? t("Plinths test collection", "Bộ sưu tập thử của Plinths")
                  : t("Your NFTs in this collection", "NFT của bạn trong bộ sưu tập này")}{" "}
                — {t("pick one", "chọn một")}
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
          {!isPreviewCollection && !isTestCollection && enumerable.data === false && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                "This collection cannot list a wallet's tokens on-chain, so enter the token ID yourself.",
                "Bộ sưu tập này không liệt kê được token của ví on-chain, nên hãy tự nhập token ID.",
              )}
            </p>
          )}
        </Step>

        <Step n={2} title={t("Auction settings", "Cài đặt đấu giá")} done={false} active={ready}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("Bidding stays open for", "Thời gian nhận giá")}</Label>
              <SelectMenu ariaLabel={t("Bidding duration", "Thời gian nhận giá")} value={bidHours} onValueChange={setBidHours} options={bidOptions(t)} />
              <p className="text-xs text-muted-foreground">
                {t("Ends", "Kết thúc")} {formatDateTime(bidDeadline, lang)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("Then bidders reveal for", "Sau đó người đặt giá công bố trong")}</Label>
              <SelectMenu ariaLabel={t("Reveal window", "Cửa sổ công bố")} value={revealHours} onValueChange={setRevealHours} options={revealOptions(t)} />
              <p className="text-xs text-muted-foreground">
                {t("Reveal ends", "Hết hạn công bố")} {formatDateTime(revealDeadline, lang)}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="reserve">{t("Reserve price (optional)", "Giá sàn (tùy chọn)")}</Label>
              <div className="relative">
                <Input
                  id="reserve"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={t("No reserve", "Không có giá sàn")}
                  value={reserveInput}
                  onChange={(e) => setReserveInput(e.target.value)}
                  className="pr-20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">tPOTv3</span>
              </div>
              {!reserveValid ? (
                <FieldError>{t("Enter a tPOTv3 amount with at most 18 decimals.", "Hãy nhập số tPOTv3 có tối đa 18 chữ số thập phân.")}</FieldError>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Bids below the reserve do not count. If no bid reaches it, the NFT returns to you.",
                    "Giá dưới giá sàn không được tính. Nếu không giá nào đạt, NFT sẽ về lại bạn.",
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <TimeNote />
          </div>
        </Step>

        <Step n={3} title={t("List with one signature", "Đăng bán bằng một chữ ký")} done={false} active={ready}>
          <ul className="mb-5 grid gap-2 text-sm text-muted-foreground">
            <Rule icon={<Lock />}>
              {t("The NFT moves into the auction contract and stays there until the auction ends.", "NFT chuyển vào contract đấu giá và ở đó đến khi phiên đấu giá kết thúc.")}
            </Rule>
            <Rule icon={<ShieldCheck />}>
              {t("You can cancel only while bidding is open and nobody has bid yet.", "Bạn chỉ hủy được khi còn nhận giá và chưa có ai đặt giá.")}
            </Rule>
            <Rule icon={<Clock />}>
              {t(
                "If no valid bid reaches the reserve, settling the auction returns the NFT to you.",
                "Nếu không giá hợp lệ nào đạt giá sàn, kết thúc phiên đấu giá sẽ trả NFT về bạn.",
              )}
            </Rule>
          </ul>
          <Button size="lg" disabled={!ready || !nftAuctionEnabled || tx.busy || now === undefined} onClick={list}>
            {tx.busy && <Loader2 className="animate-spin" />}
            {t("List NFT for auction", "Đăng NFT lên đấu giá")}
          </Button>
          {!nftAuctionEnabled && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("Listing opens once the auction contract is deployed.", "Chức năng đăng bán sẽ mở khi contract đấu giá được triển khai.")}
            </p>
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
                {token.collectionName ?? (collection ? shortAddress(collection) : t("Collection", "Bộ sưu tập"))}
                {tokenId !== undefined ? ` · #${tokenId}` : ""}
              </p>
              <CardTitle className="mt-2 text-[1.2rem]">{meta.data?.name ?? (tokenId !== undefined ? `Token #${tokenId}` : t("Choose an NFT", "Chọn một NFT"))}</CardTitle>
              {meta.data?.description && <CardDescription className="mt-2 line-clamp-3">{meta.data.description}</CardDescription>}
            </div>
            {collection && tokenId !== undefined && (
              isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> {t("Checking ownership…", "Đang kiểm tra quyền sở hữu…")}
                </p>
              ) : tokenProblem ? (
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <XCircle className="mt-0.5 size-4 shrink-0" /> {tokenProblem}
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm text-success-fg">
                  <CheckCircle2 className="size-4" /> {isPreviewCollection ? t("Sample NFT (preview)", "NFT mẫu (xem trước)") : t("You own this NFT", "Bạn sở hữu NFT này")}
                </p>
              )
            )}
            <div className="grid gap-2 border-t border-overlay/[0.07] pt-4 text-sm">
              <Row label={t("Reserve", "Giá sàn")}>{reserve18 > 0n ? formatNativeAmount(reserve18) : t("No reserve", "Không có giá sàn")}</Row>
              <Row label={t("Bidding ends", "Hết hạn đặt giá")}>{formatDateTime(bidDeadline, lang)}</Row>
              <Row label={t("Reveal ends", "Hết hạn công bố")}>{formatDateTime(revealDeadline, lang)}</Row>
            </div>
          </CardContent>
        </Card>
        <Alert variant="info">
          <AlertTriangle />
          <span>
            {t(
              `Only ERC-721 NFTs on ${NETWORK_NAME} can be listed. Payment is always native tPOTv3. Plinths does not mint NFTs.`,
              `Chỉ đăng bán được NFT ERC-721 trên ${NETWORK_NAME}. Thanh toán luôn bằng tPOTv3 gốc. Plinths không đúc (mint) NFT.`,
            )}
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

"use client";

import { AlertTriangle, CheckCircle2, Download, Gavel, Loader2, Lock, Trophy, Undo2, Upload, Wallet } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { zeroAddress, zeroHash, type Hex } from "viem";
import { useAccount } from "wagmi";
import { useT } from "@/components/lang-provider";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { randomBytes32 } from "@/lib/commitment";
import { TOKEN_DECIMALS, formatNativeAmount, formatTokenFloor, isValidAmountInput, parseTokenAmount, shortAddress } from "@/lib/format";
import { AuctionState, nftAuctionAddress, type AuctionBid, type AuctionRow } from "@/lib/nft-auction";
import { computeNftCommitment, verifyNftCommitment } from "@/lib/nft-commitment";
import { nftAuctionEnabled, useMyAuctionBid, useNftTx, useWithdrawable } from "@/lib/nft-hooks";
import { getNftEntry, nftEntrySecrets, parseNftBackup, saveNftEntries, toNftBackupJson, type NftVaultEntry } from "@/lib/nft-vault";
import { downloadTextFile } from "@/lib/salt-vault";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

/*
 * Right-hand action panel of an auction. Which panel shows depends on the on-chain state and the viewer's role,
 * mirroring the rules in contracts/src/interfaces/ISealedNFTAuction.sol. In preview mode every button is disabled.
 * The seller cancels with settle() while the auction is Open and has no bids (the contract folds both together).
 */

function PreviewHint() {
  const t = useT();
  return (
    <p className="text-xs text-muted-foreground">
      {t("Transactions open once the auction contract is deployed.", "Giao dịch sẽ mở khi contract đấu giá được triển khai.")}
    </p>
  );
}

export function AuctionActions({ row, onChange }: { row: AuctionRow; onChange: () => void }) {
  const { address } = useAccount();
  const myBid = useMyAuctionBid(row.id);
  const withdrawable = useWithdrawable(row.id);
  const isSeller = !!address && address.toLowerCase() === row.auction.seller.toLowerCase();
  const bid = myBid.data as AuctionBid | undefined;
  const hasBid = !!bid && bid.commitment !== zeroHash;
  const t = useT();
  const refresh = () => {
    void myBid.refetch();
    void withdrawable.refetch();
    onChange();
  };

  let main: ReactNode;
  switch (row.state) {
    case AuctionState.Open:
      main = isSeller ? <SellerOpenPanel row={row} onDone={refresh} /> : <BidPanel row={row} existing={hasBid ? bid : undefined} onDone={refresh} />;
      break;
    case AuctionState.Reveal:
      main =
        hasBid || !nftAuctionEnabled ? (
          <RevealPanel row={row} bid={bid} onDone={refresh} />
        ) : (
          <Notice icon={<Lock />} title={t("Bidding has closed", "Đã hết hạn đặt giá")}>
            {t(
              "Bidders are revealing their prices. Revealed bids appear in the list as they come in.",
              "Người đặt giá đang công bố giá. Giá đã công bố sẽ lần lượt hiện trong danh sách.",
            )}
          </Notice>
        );
      break;
    case AuctionState.Settlement:
    case AuctionState.NoSale:
      main = row.auction.settled ? <OutcomePanel row={row} /> : <SettlePanel row={row} onDone={refresh} />;
      break;
    default:
      main = <OutcomePanel row={row} />;
  }

  const owed = (withdrawable.data as bigint | undefined) ?? 0n;
  return (
    <div className="space-y-4">
      {main}
      {owed > 0n && <WithdrawPanel row={row} amount={owed} isSeller={isSeller} bid={bid} onDone={refresh} />}
    </div>
  );
}

// ───────────────────────── Open: place / update a sealed bid ─────────────────────────

type Prepared = { entry: NftVaultEntry; commitment: Hex };

function BidPanel({ row, existing, onDone }: { row: AuctionRow; existing?: AuctionBid; onDone: () => void }) {
  const { id, auction } = row;
  const { address } = useAccount();
  const tx = useNftTx();
  const [amountInput, setAmountInput] = useState("");
  const [depositInput, setDepositInput] = useState("");
  const [prepared, setPrepared] = useState<Prepared>();
  const [backedUp, setBackedUp] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const t = useT();

  const amount18 = isValidAmountInput(amountInput) ? parseTokenAmount(amountInput) : undefined;
  const deposit18 = isValidAmountInput(depositInput) ? parseTokenAmount(depositInput) : undefined;
  const current = existing?.deposit ?? 0n;
  const topUp = deposit18 !== undefined && deposit18 > current ? deposit18 - current : 0n;
  const belowReserve = amount18 !== undefined && amount18 > 0n && amount18 < auction.reservePrice;
  const overDeposit = amount18 !== undefined && deposit18 !== undefined && amount18 > deposit18;
  const exactDeposit = amount18 !== undefined && deposit18 !== undefined && amount18 === deposit18;

  function reset() {
    setPrepared(undefined);
    setBackedUp(false);
    setAck(false);
    tx.reset();
  }

  function suggest(factor: number) {
    if (!amount18) return;
    const value = (amount18 * BigInt(Math.round(factor * 100))) / 100n;
    const max = value > current ? value : current;
    setDepositInput(formatTokenFloor(max, TOKEN_DECIMALS, TOKEN_DECIMALS, 2));
    reset();
  }

  function seal() {
    setError(undefined);
    if (!amount18) return setError(t("Enter your price in tPOTv3 (max 18 decimals).", "Nhập giá bằng tPOTv3 (tối đa 18 chữ số thập phân)."));
    if (deposit18 === undefined || deposit18 === 0n) return setError(t("Enter the deposit to lock.", "Nhập khoản cọc cần khóa."));
    if (deposit18 < current)
      return setError(
        t(
          `Your deposit cannot go below the ${formatNativeAmount(current)} already locked.`,
          `Tiền cọc không thể thấp hơn ${formatNativeAmount(current)} đã khóa.`,
        ),
      );
    if (overDeposit)
      return setError(t("Your price is above your deposit, so it would not count. Raise the deposit.", "Giá của bạn vượt tiền cọc nên sẽ không được tính. Hãy tăng tiền cọc."));
    if (!address || !nftAuctionAddress) return;
    const salt = randomBytes32();
    const entry: NftVaultEntry = {
      v: 1,
      chainId: chain.id,
      contract: nftAuctionAddress,
      auctionId: id.toString(),
      bidder: address,
      amount18: amount18.toString(),
      deposit18: deposit18.toString(),
      salt,
      createdAt: Date.now(),
    };
    saveNftEntries([entry]);
    setPrepared({ entry, commitment: computeNftCommitment({ auctionId: id, bidder: address, amount18, salt }) });
  }

  function backup() {
    if (!prepared || !address) return;
    downloadTextFile(`plinths-nft-auction-${id}-${shortAddress(address).replace("…", "-")}.json`, toNftBackupJson([prepared.entry]));
    setBackedUp(true);
  }

  async function submit() {
    if (!prepared) return;
    // placeBid again replaces the commitment; msg.value tops up the deposit
    const receipt = await tx.send("placeBid", [id, prepared.commitment], existing ? topUp : deposit18);
    if (receipt) {
      setDone(true);
      onDone();
    }
  }

  if (done) {
    return (
      <Notice
        icon={<CheckCircle2 className="text-success" />}
        title={existing ? t("Sealed bid updated", "Đã cập nhật giá niêm phong") : t("Sealed bid placed", "Đã đặt giá niêm phong")}
      >
        {t("Keep your backup file. When bidding ends, come back here to reveal your price.", "Hãy giữ file sao lưu. Khi hết hạn đặt giá, quay lại đây để công bố giá.")}
        <TxStatus status={tx.status} hash={tx.hash} />
      </Notice>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="size-4" /> {existing ? t("Update your sealed bid", "Cập nhật giá niêm phong") : t("Place a sealed bid", "Đặt giá niêm phong")}
        </CardTitle>
        <CardDescription>
          {existing
            ? t(
                `You have ${formatNativeAmount(existing.deposit)} locked. A new price replaces the old one; you can add to the deposit but not withdraw from it.`,
                `Bạn đang khóa ${formatNativeAmount(existing.deposit)}. Giá mới sẽ thay giá cũ; bạn có thể nạp thêm tiền cọc nhưng không rút bớt được.`,
              )
            : t(
                "Your price is hashed in this browser. Only the hash and your deposit go on-chain.",
                "Giá của bạn được băm ngay trong trình duyệt. Chỉ mã băm và tiền cọc được đưa lên chain.",
              )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AmountField
          id="price"
          label={t("Your price", "Giá của bạn")}
          value={amountInput}
          onChange={(v) => {
            setAmountInput(v);
            reset();
          }}
          placeholder={
            auction.reservePrice > 0n
              ? t(`At least ${formatNativeAmount(auction.reservePrice)}`, `Tối thiểu ${formatNativeAmount(auction.reservePrice)}`)
              : t("Your price", "Giá của bạn")
          }
        />
        {belowReserve && <p className="text-xs text-warning">{t("Below the reserve — this bid would not count.", "Dưới giá sàn — giá này sẽ không được tính.")}</p>}

        <div className="space-y-2">
          <AmountField
            id="deposit"
            label={t("Deposit to lock", "Tiền cọc cần khóa")}
            value={depositInput}
            onChange={(v) => {
              setDepositInput(v);
              reset();
            }}
            placeholder={t("More than your price", "Lớn hơn giá của bạn")}
          />
          <div className="flex flex-wrap gap-1.5">
            {[
              ["+25%", 1.25],
              ["+50%", 1.5],
              ["×2", 2],
            ].map(([label, f]) => (
              <button
                key={label}
                type="button"
                disabled={!amount18}
                onClick={() => suggest(f as number)}
                className="rounded-full border border-overlay/10 px-3 py-1 text-[0.7rem] text-foreground-soft transition-colors hover:text-foreground disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "The deposit is public; your price is not. Lock more than your price so others cannot read it from the deposit. Losing bidders get it all back; the winner gets back the difference.",
              "Tiền cọc công khai; giá của bạn thì không. Hãy khóa nhiều hơn giá để người khác không suy ra giá từ tiền cọc. Người thua được hoàn toàn bộ; người thắng được hoàn phần chênh lệch.",
            )}
          </p>
          {exactDeposit && (
            <p className="text-xs text-warning">
              {t("Deposit equals your price, so anyone can read your bid from it.", "Tiền cọc bằng đúng giá nên ai cũng đọc được giá của bạn.")}
            </p>
          )}
        </div>

        <FieldError>{error}</FieldError>
        {!prepared ? (
          <Button className="w-full" onClick={seal} disabled={!nftAuctionEnabled || !amount18 || !deposit18}>
            <Lock /> {t("Seal bid", "Niêm phong giá")}
          </Button>
        ) : (
          <div className="space-y-3 rounded-[14px] border border-overlay/[0.08] p-3">
            <Button className="w-full" variant={backedUp ? "outline" : "default"} onClick={backup}>
              <Download /> {backedUp ? t("Download backup again", "Tải lại file sao lưu") : t("Download backup file (required)", "Tải file sao lưu (bắt buộc)")}
            </Button>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="mt-0.5" checked={ack} disabled={!backedUp} onChange={(e) => setAck(e.target.checked)} />
              {t(
                "I stored the backup. Without it I cannot reveal, my bid is excluded and part of my deposit is forfeited.",
                "Tôi đã cất file sao lưu. Thiếu nó tôi không thể công bố, giá bị loại và mất một phần tiền cọc.",
              )}
            </label>
            <Button className="w-full" size="lg" disabled={!backedUp || !ack || tx.busy} onClick={submit}>
              {tx.busy && <Loader2 className="animate-spin" />}
              {existing
                ? `${t("Update bid", "Cập nhật giá")}${topUp > 0n ? ` + ${formatNativeAmount(topUp)}` : ""}`
                : `${t("Bid · lock", "Đặt giá · khóa")} ${deposit18 !== undefined ? formatNativeAmount(deposit18) : ""}`}
            </Button>
            <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
          </div>
        )}
        {!nftAuctionEnabled && <PreviewHint />}
      </CardContent>
    </Card>
  );
}

function SellerOpenPanel({ row, onDone }: { row: AuctionRow; onDone: () => void }) {
  const tx = useNftTx();
  const canCancel = row.auction.bidCount === 0;
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Your auction", "Phiên đấu giá của bạn")}</CardTitle>
        <CardDescription>
          {canCancel
            ? t("No bids yet. You can still cancel and get the NFT back.", "Chưa có ai đặt giá. Bạn vẫn có thể hủy và nhận lại NFT.")
            : t(
                `${row.auction.bidCount} sealed bid${row.auction.bidCount === 1 ? "" : "s"}. The auction can no longer be cancelled.`,
                `${row.auction.bidCount} giá niêm phong. Không thể hủy phiên đấu giá nữa.`,
              )}
        </CardDescription>
      </CardHeader>
      {canCancel && (
        <CardContent className="space-y-3">
          <Button variant="outline" disabled={tx.busy} onClick={async () => (await tx.send("settle", [row.id])) && onDone()}>
            {tx.busy ? <Loader2 className="animate-spin" /> : <Undo2 />} {t("Cancel and return NFT", "Hủy và nhận lại NFT")}
          </Button>
          <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
        </CardContent>
      )}
    </Card>
  );
}

// ───────────────────────── Reveal ─────────────────────────

function RevealPanel({ row, bid, onDone }: { row: AuctionRow; bid?: AuctionBid; onDone: () => void }) {
  const { id, auction } = row;
  const { address } = useAccount();
  const tx = useNftTx();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<NftVaultEntry>();
  const [error, setError] = useState<string>();
  const t = useT();

  const stored = address && nftAuctionAddress ? getNftEntry({ chainId: chain.id, contract: nftAuctionAddress, auctionId: id, bidder: address }) : undefined;
  const entry = imported ?? stored;
  const secrets = entry ? nftEntrySecrets(entry) : undefined;
  const matches = !!secrets && !!bid && !!address && verifyNftCommitment({ auctionId: id, bidder: address, ...secrets }, bid.commitment);
  const counts = !!secrets && !!bid && secrets.amount18 >= auction.reservePrice && secrets.amount18 <= bid.deposit;

  if (bid?.revealed) {
    const counted = bid.amount >= auction.reservePrice && bid.amount <= bid.deposit;
    return (
      <Notice icon={<CheckCircle2 className="text-success" />} title={`${t("Revealed:", "Đã công bố:")} ${formatNativeAmount(bid.amount)}`}>
        {counted
          ? auction.highestBidder.toLowerCase() === address?.toLowerCase()
            ? t("Your bid is currently the highest.", "Giá của bạn hiện đang cao nhất.")
            : t(
                "Your bid counts. The highest counted price wins when the reveal window closes.",
                "Giá của bạn được tính. Giá hợp lệ cao nhất thắng khi cửa sổ công bố đóng.",
              )
          : t(
              "Your bid does not count (below the reserve or above your deposit). You will get your full deposit back.",
              "Giá của bạn không được tính (dưới giá sàn hoặc vượt tiền cọc). Bạn sẽ được hoàn toàn bộ tiền cọc.",
            )}
      </Notice>
    );
  }

  async function importFile(file: File) {
    setError(undefined);
    try {
      const all = parseNftBackup(await file.text());
      const match = all.find((e) => e.auctionId === id.toString() && (!address || e.bidder.toLowerCase() === address.toLowerCase()));
      if (!match)
        throw new Error(
          address
            ? t(`This backup has no bid for auction #${id} from ${shortAddress(address)}.`, `File sao lưu này không có giá của ${shortAddress(address)} cho phiên đấu giá #${id}.`)
            : t(`This backup has no bid for auction #${id}.`, `File sao lưu này không có giá cho phiên đấu giá #${id}.`),
        );
      saveNftEntries([match]);
      setImported(match);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not read the backup file.", "Không đọc được file sao lưu."));
    }
  }

  async function reveal() {
    if (!secrets) return;
    if (await tx.send("revealBid", [id, secrets.amount18, secrets.salt])) onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" /> {t("Reveal your bid", "Công bố giá của bạn")}
        </CardTitle>
        <CardDescription>
          {t(
            "Bidding has closed. Reveal before the deadline: unrevealed bids are excluded and lose part of their deposit.",
            "Đã hết hạn đặt giá. Hãy công bố trước hạn: giá không công bố sẽ bị loại và mất một phần tiền cọc.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {entry && secrets ? (
          <div className="grid gap-2 rounded-[14px] border border-overlay/[0.08] p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Your price", "Giá của bạn")}</span>
              <b className="font-medium">{formatNativeAmount(secrets.amount18)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Deposit", "Tiền cọc")}</span>
              <span>{formatNativeAmount(bid?.deposit ?? BigInt(entry.deposit18))}</span>
            </div>
            <p className={cn("flex items-center gap-1.5 text-xs", matches ? "text-success-fg" : "text-destructive")}>
              {matches ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
              {matches
                ? t("Matches your sealed commitment", "Khớp commitment đã niêm phong")
                : t(
                    "Does not match the commitment on-chain — check you imported the latest backup",
                    "Không khớp commitment on-chain — hãy kiểm tra bạn đã nhập bản sao lưu mới nhất",
                  )}
            </p>
            {matches && !counts && (
              <p className="text-xs text-warning">
                {t("This bid will not count, but revealing still returns your full deposit.", "Giá này sẽ không được tính, nhưng công bố vẫn giúp bạn nhận lại toàn bộ tiền cọc.")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("No saved secrets for this bid in this browser. Import your backup file.", "Trình duyệt này chưa lưu bí mật của giá này. Hãy nhập file sao lưu.")}
          </p>
        )}
        <div>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload /> {t("Import backup file", "Nhập file sao lưu")}
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
        </div>
        <FieldError>{error}</FieldError>
        <Button className="w-full" size="lg" disabled={!nftAuctionEnabled || !matches || tx.busy} onClick={reveal}>
          {tx.busy && <Loader2 className="animate-spin" />} {t("Reveal bid", "Công bố giá")}
        </Button>
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
        {!nftAuctionEnabled && <PreviewHint />}
      </CardContent>
    </Card>
  );
}

// ───────────────────────── Settle / outcome / withdraw ─────────────────────────

function SettlePanel({ row, onDone }: { row: AuctionRow; onDone: () => void }) {
  const tx = useNftTx();
  const sale = row.auction.highestBidder !== zeroAddress;
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4" /> {sale ? t("Ready to settle", "Sẵn sàng kết thúc") : t("No valid bid", "Không có giá hợp lệ")}
        </CardTitle>
        <CardDescription>
          {sale
            ? t(
                `${shortAddress(row.auction.highestBidder)} won with ${formatNativeAmount(row.auction.highestBid)}. Anyone can settle: the NFT goes to the winner and the price to the seller.`,
                `${shortAddress(row.auction.highestBidder)} thắng với ${formatNativeAmount(row.auction.highestBid)}. Ai cũng có thể kết thúc: NFT về người thắng, tiền về người bán.`,
              )
            : t("No revealed bid met the reserve. Settling returns the NFT to the seller.", "Không giá công bố nào đạt giá sàn. Kết thúc sẽ trả NFT về người bán.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full" disabled={!nftAuctionEnabled || tx.busy} onClick={async () => (await tx.send("settle", [row.id])) && onDone()}>
          {tx.busy && <Loader2 className="animate-spin" />}{" "}
          {sale ? t("Settle: deliver NFT", "Kết thúc: giao NFT") : t("Settle: return NFT", "Kết thúc: trả NFT")}
        </Button>
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
        {!nftAuctionEnabled && <PreviewHint />}
      </CardContent>
    </Card>
  );
}

function OutcomePanel({ row }: { row: AuctionRow }) {
  const { auction, state } = row;
  const t = useT();
  if (state === AuctionState.Cancelled) {
    return (
      <Notice icon={<Undo2 />} title={t("Cancelled", "Đã hủy")}>
        {t("The seller cancelled before any bid; the NFT went back to them.", "Người bán đã hủy trước khi có giá nào; NFT đã về lại người bán.")}
      </Notice>
    );
  }
  if (auction.highestBidder === zeroAddress) {
    return (
      <Notice icon={<Undo2 />} title={t("No sale", "Không bán được")}>
        {t("No revealed bid met the reserve. The NFT was returned to the seller.", "Không giá công bố nào đạt giá sàn. NFT đã được trả về người bán.")}
      </Notice>
    );
  }
  return (
    <Notice icon={<Trophy className="text-success" />} title={t(`Sold for ${formatNativeAmount(auction.highestBid)}`, `Đã bán với giá ${formatNativeAmount(auction.highestBid)}`)}>
      {t(
        `Won by ${shortAddress(auction.highestBidder)}. Every revealed amount below can be re-checked against its sealed commitment.`,
        `Người thắng: ${shortAddress(auction.highestBidder)}. Mọi giá đã công bố bên dưới đều có thể đối chiếu lại với commitment niêm phong.`,
      )}
    </Notice>
  );
}

function WithdrawPanel({ row, amount, isSeller, bid, onDone }: { row: AuctionRow; amount: bigint; isSeller: boolean; bid?: AuctionBid; onDone: () => void }) {
  const tx = useNftTx();
  const { address } = useAccount();
  const winner = !!address && address.toLowerCase() === row.auction.highestBidder.toLowerCase();
  const t = useT();
  const reason = isSeller
    ? t("Proceeds from the sale.", "Tiền thu từ việc bán.")
    : winner
      ? t("The part of your deposit above your winning price.", "Phần tiền cọc vượt quá giá thắng của bạn.")
      : bid && !bid.revealed
        ? t("Your deposit minus the penalty for not revealing.", "Tiền cọc sau khi trừ khoản phạt do không công bố.")
        : t("Your full deposit.", "Toàn bộ tiền cọc của bạn.");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4" /> {t(`${formatNativeAmount(amount)} to withdraw`, `${formatNativeAmount(amount)} có thể rút`)}
        </CardTitle>
        <CardDescription>{reason}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full" disabled={tx.busy} onClick={async () => (await tx.send("withdraw", [row.id])) && onDone()}>
          {tx.busy && <Loader2 className="animate-spin" />} {t("Withdraw", "Rút")}
        </Button>
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
      </CardContent>
    </Card>
  );
}

// ───────────────────────── bits ─────────────────────────

function AmountField({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} inputMode="decimal" autoComplete="off" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="pr-20" />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">tPOTv3</span>
      </div>
    </div>
  );
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Alert variant="default" className="flex-col gap-2 sm:flex-row">
      {icon}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <div className="space-y-2 text-muted-foreground">{children}</div>
      </div>
    </Alert>
  );
}
